'use server';

import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import {
  sendResendEmail,
  isResendConfigured,
  listResendEmails,
  getResendEmail,
  resolveEffectiveBcc,
  listReceivedEmails,
  getReceivedEmail,
  type ResendEmailListItem,
  type ResendEmailDetails,
  type ResendReceivedEmailListItem,
  type ResendReceivedAttachment,
} from '@/lib/resend';
import { textToEmailHtml, htmlBodyToFullEmailHtml, escapeHtml, safeHttpUrl } from '@/lib/email-formatter';
import {
  recordOutboundMessage,
  buildOutreachTags,
  lookupInboundLinks,
  type InboundLink,
} from '@/lib/marketing/conversation-store';
import {
  normalizeConversationHistory,
  type ConversationSummary,
  type ConversationThread,
} from '@/lib/marketing/conversation';
import {
  describeExistingToolMatches,
  sortExistingToolMatches,
  type ExistingToolMatch,
  type ExistingToolMatches,
  type ExistingToolSource,
} from '@/lib/marketing/existing-tools';
import {
  evaluateOutreachHistory,
  parseOutreachSendHistory,
  summarizeSkipReasons,
  type OutreachLeadGuard,
  type OutreachSendHistory,
  type OutreachSkipReason,
} from '@/lib/marketing/send-guards';
import {
  type EmailDeliverabilityStatus,
  type ResendDeliveryStatus,
  type EmailRecord,
  type BusinessEmailsMap,
  normalizeBusinessEmails,
} from '@/lib/marketing/business-emails';
import {
  isNo2BounceConfigured,
  verifySingleEmail,
  verifyEmailsBatch,
  type No2BounceVerificationResult,
} from '@/lib/no2bounce';
import {
  getCachedEmailVerifications,
  saveEmailVerifications,
} from '@/lib/marketing/email-verification-cache';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface MarketingTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  from_name: string;
  from_email: string;
  html: string;
  text: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  messageId?: string;
  results?: SendResult[];
}

export interface SendResult {
  email: string;
  success: boolean;
  messageId?: string;
  /** Failure reason, or the skip reason when `skipped` is true. */
  error?: string;
  /** Not sent on purpose by an outreach guard (see lib/marketing/send-guards.ts). */
  skipped?: boolean;
  skipReason?: OutreachSkipReason;
  toolName?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Zod Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const TemplateIdSchema = z.preprocess(
  (val) => (val === 'tool_relist' || val === 'relist_launch' ? 'tool_outreach' : val),
  z.enum(['sponsored_feature', 'new_tool_launch', 'affiliate_partnership', 'tool_outreach'], {
    message: 'Invalid template ID.',
  })
);

const UpdateTemplateSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  from_name: z.string().min(1).max(100).optional(),
  from_email: z.string().email().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
});

const SendEmailSchema = z.object({
  templateId: TemplateIdSchema,
  recipients: z
    .array(
      z.object({
        email: z.string().email({ message: 'Invalid recipient email address.' }),
        name: z.string().max(200).optional(),
      })
    )
    .min(1, { message: 'At least one recipient is required.' })
    .max(50, { message: 'Maximum 50 recipients per batch.' }),
  variables: z.record(z.string(), z.string()).optional(),
  customSubject: z.string().max(500).optional(),
  customBody: z.string().optional(),
  customHtml: z.string().optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Helper: Read templates from site_settings
// ────────────────────────────────────────────────────────────────────────────

async function readTemplatesFromDB(): Promise<Record<string, MarketingTemplate> | null> {
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'marketing_mail_templates')
    .single();

  if (error || !data?.value) return null;
  const rawTemplates = data.value as Record<string, MarketingTemplate>;
  const normalizedTemplates: Record<string, MarketingTemplate> = {};
  for (const [k, v] of Object.entries(rawTemplates)) {
    // Migrate legacy 'tool_relist' / 'relist_launch' keys to 'tool_outreach'
    const isRelist = k === 'tool_relist' || k === 'relist_launch' || v.id === 'tool_relist' || v.id === 'relist_launch';
    const key = isRelist ? 'tool_outreach' : k;
    const id = isRelist ? 'tool_outreach' : (v.id || key);
    const name = isRelist
      ? (v.name === 'Toolbit Listing Outreach' || v.name === 'Listing Outreach' ? 'Tool Outreach' : v.name)
      : v.name;

    let subject = v.subject;
    let text = v.text;
    let html = v.html;
    let variables = v.variables;

    if (isRelist || key === 'tool_outreach') {
      if (subject && /\{\{\s*tool_name\s*\}\}/i.test(subject)) {
        subject = subject.replace(/\{\{\s*tool_name\s*\}\}/gi, '{{tool_domain}}');
      }
      if (text && /tool_name/i.test(text)) {
        text = text
          .replace(/\{\{\s*tool_name\s*\}\}\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '{{tool_domain}}')
          .replace(/\{\{\s*tool_name\s*\}\}/gi, '{{tool_domain}}');
      }
      if (html && /tool_name/i.test(html)) {
        html = html
          .replace(/\{\{\s*tool_name\s*\}\}\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '{{tool_domain}}')
          .replace(/\{\{\s*tool_name\s*\}\}/gi, '{{tool_domain}}');
      }
      if (Array.isArray(variables)) {
        variables = Array.from(
          new Set(
            variables.map((varName) =>
              /tool_name/i.test(varName) ? '{{tool_domain}}' : varName
            )
          )
        );
      }
    }

    normalizedTemplates[key] = {
      ...v,
      id,
      name,
      subject,
      text,
      html,
      variables,
      from_name:
        !v.from_name?.trim() || v.from_name.trim() === 'Toolbit Team'
          ? 'Toolbit AI'
          : v.from_name.trim(),
    };
  }

  // Ensure tool_relist and relist_launch are never returned as an active template key
  delete normalizedTemplates['tool_relist'];
  delete normalizedTemplates['relist_launch'];

  return normalizedTemplates;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: Extract domain from URL
// ────────────────────────────────────────────────────────────────────────────

function getToolDomain(siteUrl: string): string {
  if (!siteUrl) return '';
  try {
    const parsed = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return siteUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: Append UTM params to a URL
// ────────────────────────────────────────────────────────────────────────────

function appendUtmParams(url: string, params: Record<string, string>): string {
  if (!url) return url;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return `${url}${sep}${qs}`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: Variable substitution
// ────────────────────────────────────────────────────────────────────────────

function substituteVariables(
  template: string,
  vars: Record<string, string>,
  options?: { isHtml?: boolean }
): string {
  let result = template;
  const isHtml = options?.isHtml ?? false;

  // Resolve domain name if not explicitly set but URL is available
  const siteUrlForDomain = (vars.tool_site_url || vars.tool_url || '').trim();
  let resolvedDomain = (vars.tool_domain || vars.domain_name || '').trim();
  if (!resolvedDomain && siteUrlForDomain) {
    resolvedDomain = getToolDomain(siteUrlForDomain);
  }
  if (!resolvedDomain && vars.tool_name) {
    resolvedDomain = vars.tool_name.trim();
  }

  // If no domain available, remove any trailing domain parentheses like " ({{tool_domain}})"
  if (!resolvedDomain) {
    result = result.replace(/\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '');
  }

  const effectiveVars: Record<string, string> = {
    ...vars,
    ...(resolvedDomain ? { tool_domain: resolvedDomain, domain_name: resolvedDomain } : {}),
  };

  for (const [rawKey, value] of Object.entries(effectiveVars)) {
    const key = rawKey.replace(/^\{\{|\}\}$/g, '').trim();
    if (!key) continue;
    // Keys are matched literally (no regex injection / catastrophic patterns from variable names)
    const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let val = value || '';

    // tool_domain / tool_name / domain_name: always substitute as plain text.
    //
    // In HTML mode, insert zero-width non-joiners (&zwnj;) around dots in domain values
    // (e.g. "example&zwnj;.&zwnj;com") so that Gmail, Apple Mail, and other email clients
    // do NOT auto-detect the bare domain as a clickable URL pattern and apply their own
    // teal/blue link styling. The &zwnj; entity is zero-width and invisible to the human eye,
    // but breaks the URL regex pattern matching in email client linkifiers.
    if (
      isHtml &&
      (key === 'tool_domain' || key === 'domain_name' || key === 'tool_name') &&
      val.trim()
    ) {
      val = val.replace(/(?:\.|&#46;)/g, '&zwnj;.&zwnj;');
    }

    // Replacer functions insert values literally ("$&", "$1" in a tool name stay as typed)
    const replacement = val;

    // Standard {{key}} or {{ key }}
    const standardRegex = new RegExp(`\\{\\{\\s*${keyPattern}\\s*\\}\\}`, 'gi');
    result = result.replace(standardRegex, () => replacement);

    // URL encoded %7B%7Bkey%7D%7D (often produced in href attributes)
    const encodedRegex = new RegExp(`%7B%7B\\s*${keyPattern}\\s*%7D%7D`, 'gi');
    result = result.replace(encodedRegex, () => replacement);

  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Get all marketing templates
// ────────────────────────────────────────────────────────────────────────────

export async function getMarketingTemplatesAction(
  token: string
): Promise<ActionResponse<Record<string, MarketingTemplate>>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const templates = await readTemplatesFromDB();
    if (!templates) {
      return {
        success: false,
        error: 'Marketing mail templates not found in site_settings. Please run the database migration.',
      };
    }

    return { success: true, data: templates };
  } catch (err: any) {
    console.error('getMarketingTemplatesAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch marketing templates.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Update a single template
// ────────────────────────────────────────────────────────────────────────────

export async function updateMarketingTemplateAction(
  token: string,
  templateId: string,
  payload: Partial<Pick<MarketingTemplate, 'subject' | 'from_name' | 'from_email' | 'html' | 'text'>>
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // Validate template ID
    const idResult = TemplateIdSchema.safeParse(templateId);
    if (!idResult.success) {
      return { success: false, error: 'Invalid template ID.' };
    }
    const targetTemplateId = idResult.data;

    // Validate payload
    const payloadResult = UpdateTemplateSchema.safeParse(payload);
    if (!payloadResult.success) {
      const msg = payloadResult.error.issues[0]?.message || 'Invalid template data.';
      return { success: false, error: msg };
    }

    // Read current templates
    const templates = await readTemplatesFromDB();
    if (!templates || !templates[targetTemplateId]) {
      return { success: false, error: `Template "${targetTemplateId}" not found.` };
    }

    // If text was updated and html wasn't provided or was empty, auto-generate html from text
    const textValue = payloadResult.data.text ?? templates[targetTemplateId].text;
    const htmlValue =
      payloadResult.data.html && payloadResult.data.html.trim().length > 0
        ? payloadResult.data.html
        : textToEmailHtml(textValue);

    // Merge updates into the template
    const updatedTemplate: MarketingTemplate = {
      ...templates[targetTemplateId],
      ...payloadResult.data,
      id: targetTemplateId,
      html: htmlValue,
      updated_at: new Date().toISOString(),
    };

    templates[targetTemplateId] = updatedTemplate;
    delete templates['tool_relist'];
    delete templates['relist_launch'];

    // Write back entire JSONB value
    const { error } = await supabaseAdmin
      .from('site_settings')
      .update({ value: templates })
      .eq('key', 'marketing_mail_templates');

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateMarketingTemplateAction error:', err);
    return { success: false, error: err?.message || 'Failed to update template.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Send marketing email (single or batch)
// ────────────────────────────────────────────────────────────────────────────

export async function sendMarketingEmailAction(
  token: string,
  params: {
    templateId: string;
    recipients: { email: string; name?: string }[];
    variables?: Record<string, string>;
    customSubject?: string;
    customBody?: string;
    customHtml?: string;
    bcc?: string | string[];
  }
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // Validate input
    const validated = SendEmailSchema.safeParse(params);
    if (!validated.success) {
      const msg = validated.error.issues[0]?.message || 'Invalid send parameters.';
      return { success: false, error: msg };
    }

    const { templateId, recipients, variables = {}, customSubject, customBody, customHtml, bcc } = validated.data;
    const bccAddress = resolveEffectiveBcc(bcc);

    // Check Resend configuration
    if (!isResendConfigured()) {
      return {
        success: false,
        error: 'Resend is not configured. Please set RESEND_API_KEY in your environment variables.',
      };
    }

    // Fetch template
    const templates = await readTemplatesFromDB();
    if (!templates || !templates[templateId]) {
      return { success: false, error: `Template "${templateId}" not found.` };
    }

    const template = templates[templateId];

    // Determine base subject and body / html
    const baseSubject = customSubject && customSubject.trim().length > 0 ? customSubject.trim() : template.subject;
    const baseText = customBody && customBody.trim().length > 0 ? customBody.trim() : template.text;
    
    let baseHtml = '';
    if (customHtml && customHtml.trim().length > 0) {
      baseHtml = htmlBodyToFullEmailHtml(customHtml.trim());
    } else if (customBody && customBody.trim().length > 0) {
      baseHtml = textToEmailHtml(customBody.trim());
    } else if (template.html && template.html.trim().length > 0) {
      baseHtml = template.html;
    } else {
      baseHtml = textToEmailHtml(template.text);
    }

    if (!baseHtml && !baseText) {
      return {
        success: false,
        error: 'Template has no email content. Please provide email text or select a valid template.',
      };
    }

    const fromName =
      !template.from_name?.trim() || template.from_name.trim() === 'Toolbit Team'
        ? 'Toolbit AI'
        : template.from_name.trim();
    const fromAddress = `${fromName} <${template.from_email}>`;

    // Pre-send Email Deliverability Verification via No2Bounce with persistent caching & fail-open resilience
    const undeliverableEmails = new Map<string, string>();
    if (isNo2BounceConfigured()) {
      try {
        const uniqueRecipientEmails = Array.from(
          new Set(recipients.map((r) => r.email.trim().toLowerCase()).filter(Boolean))
        );

        // 1. Cross-lead persistent verification cache check
        const cachedVerifications = await getCachedEmailVerifications(uniqueRecipientEmails);
        const stillNeedingVerification: string[] = [];

        for (const email of uniqueRecipientEmails) {
          const cached = cachedVerifications.get(email);
          if (cached) {
            if (cached.status === 'undeliverable') {
              undeliverableEmails.set(
                email,
                `Address is cached as undeliverable (${cached.score_status || 'invalid mailbox'}). Blocked to protect sender reputation.`
              );
            }
          } else {
            stillNeedingVerification.push(email);
          }
        }

        // 2. Query No2Bounce for emails not in cache (bounded timeout, fail-open)
        if (stillNeedingVerification.length > 0) {
          const apiResults = await verifyEmailsBatch(stillNeedingVerification, { concurrency: 4, timeoutMs: 12000 });
          const resultsToPersist: No2BounceVerificationResult[] = [];

          for (const [email, result] of apiResults.entries()) {
            if (!result.failOpen && (result.status === 'deliverable' || result.status === 'undeliverable')) {
              resultsToPersist.push(result);
            }

            if (result.status === 'undeliverable') {
              undeliverableEmails.set(
                email,
                `Address verified as undeliverable by No2Bounce (${result.scoreStatus || 'invalid mailbox'}). Blocked to protect sender reputation.`
              );
            }
          }

          if (resultsToPersist.length > 0) {
            void saveEmailVerifications(resultsToPersist);
          }
        }
      } catch (verificationErr: any) {
        console.warn('[No2Bounce] Pre-send check in sendMarketingEmailAction degraded gracefully:', verificationErr?.message);
      }
    }

    // Send to each recipient individually for proper variable substitution
    const results: SendResult[] = [];

    for (const recipient of recipients) {
      const cleanToEmail = recipient.email.trim().toLowerCase();
      if (undeliverableEmails.has(cleanToEmail)) {
        results.push({
          email: recipient.email.trim(),
          success: false,
          error: undeliverableEmails.get(cleanToEmail) || 'Address verified as undeliverable by No2Bounce.',
        });
        continue;
      }

      const recipientName =
        recipient.name && recipient.name.trim().length > 0
          ? recipient.name.trim()
          : 'there';

      // Build substitution variables per recipient
      const firstName =
        recipient.name && recipient.name.trim().length > 0
          ? recipient.name.trim().split(' ')[0]
          : 'there';

      const recipientVars: Record<string, string> = {
        ...variables,
        recipient_name: recipientName,
        first_name: firstName,
        recipient_email: recipient.email.trim(),
      };

      const finalSubject = substituteVariables(baseSubject, recipientVars, { isHtml: false });
      const finalHtml = substituteVariables(baseHtml, recipientVars, { isHtml: true });
      const finalText = baseText ? substituteVariables(baseText, recipientVars, { isHtml: false }) : undefined;

      const result = await sendResendEmail({
        from: fromAddress,
        to: recipient.email.trim(),
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
        bcc: bccAddress,
      });

      results.push({
        email: recipient.email.trim(),
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    }

    const allSuccess = results.every((r) => r.success);
    const someSuccess = results.some((r) => r.success);

    if (allSuccess) {
      return {
        success: true,
        results,
        messageId: results[0]?.messageId,
      };
    }

    if (someSuccess) {
      const failedCount = results.filter((r) => !r.success).length;
      return {
        success: true,
        results,
        error: `${failedCount} of ${results.length} emails failed to send.`,
      };
    }

    return {
      success: false,
      results,
      error: results[0]?.error || 'All emails failed to send.',
    };
  } catch (err: any) {
    console.error('sendMarketingEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to send marketing email.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Get sent email history directly from Resend API (Option A)
// ────────────────────────────────────────────────────────────────────────────

export async function getResendEmailHistoryAction(
  token: string
): Promise<ActionResponse<ResendEmailListItem[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const res = await listResendEmails();
    if (!res.success) {
      return { success: false, error: res.error || 'Failed to fetch emails from Resend.' };
    }

    return { success: true, data: res.data || [] };
  } catch (err: any) {
    console.error('getResendEmailHistoryAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch email history from Resend.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Get single email details from Resend API
// ────────────────────────────────────────────────────────────────────────────

export async function getResendEmailDetailsAction(
  token: string,
  emailId: string
): Promise<ActionResponse<ResendEmailDetails>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    if (!emailId || !emailId.trim()) {
      return { success: false, error: 'Email ID is required.' };
    }

    const res = await getResendEmail(emailId.trim());
    if (!res.success) {
      return { success: false, error: res.error || 'Failed to fetch email details from Resend.' };
    }

    return { success: true, data: res.data };
  } catch (err: any) {
    console.error('getResendEmailDetailsAction error:', err);
    return { success: false, error: err?.message || 'Failed to retrieve email from Resend.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Check Resend configuration status
// ────────────────────────────────────────────────────────────────────────────

export async function checkResendConfigAction(
  token: string
): Promise<ActionResponse<{ configured: boolean }>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    return {
      success: true,
      data: { configured: isResendConfigured() },
    };
  } catch (err: any) {
    console.error('checkResendConfigAction error:', err);
    return { success: false, error: err?.message || 'Failed to check Resend configuration.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Search tools from Supabase for marketing mail dropdown
// ────────────────────────────────────────────────────────────────────────────

export interface SearchableToolItem {
  id: number;
  name: string;
  slug: string;
  site_url: string;
  favicon_url: string | null;
}

export async function searchAdminToolsAction(
  token: string,
  query?: string
): Promise<ActionResponse<SearchableToolItem[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const selectCols = 'tool_id, tool_url, tool_site_url, favicon_url, tool_info';
    const rawQ = (query || '').trim();

    if (!rawQ) {
      const { data, error } = await supabaseAdmin
        .from('ai_tools')
        .select(selectCols)
        .order('tool_id', { ascending: false })
        .limit(300);

      if (error) throw error;

      const formatted: SearchableToolItem[] = (data || []).map((t: any) => {
        const info = t.tool_info || {};
        const name = info.toolName || info.name || t.tool_url || `Tool #${t.tool_id}`;
        return {
          id: t.tool_id,
          name,
          slug: t.tool_url || '',
          site_url: t.tool_site_url || '',
          favicon_url: t.favicon_url || info.favicon_url || info.icon_url || null,
        };
      });

      return { success: true, data: formatted };
    }

    const sanitized = rawQ.replace(/[%_,]/g, '');
    const [resUrl, resName, resName2] = await Promise.all([
      supabaseAdmin
        .from('ai_tools')
        .select(selectCols)
        .or(`tool_url.ilike.%${sanitized}%,tool_site_url.ilike.%${sanitized}%`)
        .order('tool_id', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('ai_tools')
        .select(selectCols)
        .ilike('tool_info->>toolName', `%${sanitized}%`)
        .order('tool_id', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('ai_tools')
        .select(selectCols)
        .ilike('tool_info->>name', `%${sanitized}%`)
        .order('tool_id', { ascending: false })
        .limit(30),
    ]);

    const combined = [
      ...(resUrl.data || []),
      ...(resName.data || []),
      ...(resName2.data || []),
    ];

    const seen = new Set<number>();
    const formatted: SearchableToolItem[] = [];

    for (const t of combined) {
      if (!t.tool_id || seen.has(t.tool_id)) continue;
      seen.add(t.tool_id);
      const info = t.tool_info || {};
      const name = info.toolName || info.name || t.tool_url || `Tool #${t.tool_id}`;
      formatted.push({
        id: t.tool_id,
        name,
        slug: t.tool_url || '',
        site_url: t.tool_site_url || '',
        favicon_url: t.favicon_url || info.favicon_url || info.icon_url || null,
      });
    }

    return { success: true, data: formatted };
  } catch (err: any) {
    console.error('searchAdminToolsAction error:', err);
    return { success: false, error: err?.message || 'Failed to search tools.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Marketing Outreach Leads Types & Actions
// ────────────────────────────────────────────────────────────────────

export interface OutreachConversionEvent {
  id: string;
  type: 'page_visit' | 'signup' | 'login' | 'submission' | 'checkout' | 'purchase';
  at: string;
  session_id?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  data?: Record<string, any>;
  idempotency_key?: string | null;
}

export interface OutreachConversionSummary {
  visit_count?: number;
  first_visit_at?: string;
  last_visit_at?: string;
  signed_up?: boolean;
  signed_up_at?: string;
  toolbit_user_id?: string;
  toolbit_user_email?: string;
  submitted?: boolean;
  submitted_at?: string;
  submission_count?: number;
  last_submission_id?: string | number;
  checked_out?: boolean;
  last_checkout_at?: string;
  purchased?: boolean;
  purchased_at?: string;
  purchase_count?: number;
  total_spent_usd?: number;
}

export type { EmailDeliverabilityStatus, ResendDeliveryStatus, EmailRecord, BusinessEmailsMap };

export interface MarketingOutreachLead {
  id: string;
  tool_name: string;
  tool_site_url: string;
  business_emails: BusinessEmailsMap;
  status: string;
  contact_page_url: string[];
  social_links: string[];
  marketing_medium: string[] | null;
  sources: Array<{ source?: string; listing_url?: string; [key: string]: any }> | null;
  /** Full history is lazy-loaded per lead (getOutreachLeadConversationAction). */
  conversation_history?: ConversationThread[];
  /** Lightweight summary from the `conversation_summary` computed field. */
  conversation_summary?: ConversationSummary | null;
  /** Unified website conversion tracking ({ summary, events }). */
  conversions?: {
    summary?: OutreachConversionSummary | null;
    events?: OutreachConversionEvent[];
  } | null;
  /** Full website conversion events history (backward-compatible alias). */
  conversion_events?: OutreachConversionEvent[];
  /** Materialized roll-up of conversion milestones (backward-compatible alias). */
  conversion_summary?: OutreachConversionSummary | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OutreachLeadsStats {
  total: number;
  withEmails: number;
  pending: number;
  emailed: number;
  replied: number;
}

export interface GetOutreachLeadsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  hasEmailOnly?: boolean;
  hasRepliesOnly?: boolean;
  isToolSubmissionOnly?: boolean;
}

/** JSONB containment used for "has replies" (real replies, not auto-responders). Hits the GIN index. */
const HAS_REPLIES_FILTER = JSON.stringify([{ messages: [{ direction: 'inbound', is_auto_reply: false }] }]);

const LEAD_LIST_COLUMNS =
  'id, tool_name, tool_site_url, business_emails, status, contact_page_url, social_links, marketing_medium, sources, metadata, conversions, created_at, updated_at';

const LeadIdSchema = z.uuid({ message: 'Invalid lead ID.' });

export interface OutreachLeadsResult {
  leads: MarketingOutreachLead[];
  totalCount: number;
  stats: OutreachLeadsStats;
}

export interface OutreachSendItem {
  leadId: string;
  toolName: string;
  toolSiteUrl: string;
  recipientEmail: string;
  recipientName?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Fetch paginated marketing outreach leads with stats
// ────────────────────────────────────────────────────────────────────────────

export async function getMarketingOutreachLeadsAction(
  token: string,
  params: GetOutreachLeadsParams = {}
): Promise<ActionResponse<OutreachLeadsResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(10, params.pageSize || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Parallel fetch: paginated leads (+ `conversation_summary` computed field) and stat-card counts
    const [leadsRes, stats] = await Promise.all([
      applyOutreachLeadFilters(
        supabaseAdmin
          .from('marketing_outreach_leads')
          .select(`${LEAD_LIST_COLUMNS}, conversation_summary`, { count: 'exact' }),
        params
      )
        .order('created_at', { ascending: false })
        .range(from, to),
      fetchOutreachLeadStats(),
    ]);

    if (leadsRes.error) throw leadsRes.error;

    return {
      success: true,
      data: {
        leads: ((leadsRes.data || []) as any[]).map((row) => ({
          ...row,
          business_emails: normalizeBusinessEmails(row.business_emails),
          conversion_summary: row.conversions?.summary || row.conversion_summary || null,
          conversion_events: Array.isArray(row.conversions?.events) ? row.conversions.events : (row.conversion_events || []),
        })) as MarketingOutreachLead[],
        totalCount: leadsRes.count || 0,
        stats,
      },
    };
  } catch (err: any) {
    console.error('getMarketingOutreachLeadsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch marketing leads.' };
  }
}

/**
 * Stat cards (totals over ALL leads, independent of list filters) in one query via
 * rpc marketing_outreach_lead_stats (migration 20260930120000).
 * Until that migration is applied, falls back to the previous per-card counts so the
 * page keeps working; the fallback can be removed afterwards.
 */
async function fetchOutreachLeadStats(): Promise<OutreachLeadsStats> {
  const { data, error } = await supabaseAdmin.rpc('marketing_outreach_lead_stats');
  if (!error && data && typeof data === 'object') {
    const s = data as Record<string, number>;
    return {
      total: s.total || 0,
      withEmails: s.with_emails || 0,
      pending: s.pending || 0,
      emailed: s.emailed || 0,
      replied: s.replied || 0,
    };
  }

  console.warn('marketing_outreach_lead_stats unavailable, using per-card counts:', error?.message);
  const countLeads = (apply: (q: any) => any = (q) => q) =>
    apply(supabaseAdmin.from('marketing_outreach_leads').select('id', { count: 'exact', head: true }));
  const [totalRes, withEmailsRes, pendingRes, emailedRes, repliedRes] = await Promise.all([
    countLeads(),
    countLeads((q) => q.neq('business_emails', '{}')),
    countLeads((q) => q.eq('status', 'pending')),
    countLeads((q) => q.eq('status', 'emailed')),
    countLeads((q) => q.eq('status', 'replied')),
  ]);
  return {
    total: totalRes.count || 0,
    withEmails: withEmailsRes.count || 0,
    pending: pendingRes.count || 0,
    emailed: emailedRes.count || 0,
    replied: repliedRes.count || 0,
  };
}

// Shared filter builder for the leads list (keeps the original filter semantics).
function applyOutreachLeadFilters(query: any, params: GetOutreachLeadsParams): any {
    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    if (params.source && params.source !== 'all') {
      if (params.source === 'producthunt') {
        query = query.or('sources.cs.[{"source":"producthunt.com"}],sources.cs.[{"source":"ProductHunt"}]');
      } else if (params.source === 'toolify') {
        query = query.filter('sources', 'cs', JSON.stringify([{ source: 'toolify.ai' }]));
      } else if (params.source === 'theresanaiforthat') {
        query = query.filter('sources', 'cs', JSON.stringify([{ source: 'theresanaiforthat.com' }]));
      } else if (params.source === 'codehype') {
        query = query.filter('sources', 'cs', JSON.stringify([{ source: 'codehype.ai' }]));
      } else if (params.source === 'tool_submission') {
        query = query.eq('metadata->>is_tool_submission', 'true');
      }
    }

    if (params.isToolSubmissionOnly) {
      query = query.eq('metadata->>is_tool_submission', 'true');
    }

    if (params.hasEmailOnly) {
      query = query.neq('business_emails', '{}');
    }

    const rawSearch = (params.search || '').trim();
    if (rawSearch) {
      const sanitized = rawSearch.replace(/[%_,]/g, '');
      if (sanitized) {
        if (sanitized.includes('@')) {
          const safeEmail = sanitized.toLowerCase().replace(/["\\]/g, '');
          query = query.or(
            `tool_name.ilike.%${sanitized}%,tool_site_url.ilike.%${sanitized}%,business_emails->>"${safeEmail}".not.is.null`
          );
        } else {
          query = query.or(
            `tool_name.ilike.%${sanitized}%,tool_site_url.ilike.%${sanitized}%`
          );
        }
      }
    }

    if (params.hasRepliesOnly) {
      query = query.filter('conversation_history', 'cs', HAS_REPLIES_FILTER);
    }

    return query;
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Update marketing outreach lead status manually
// ────────────────────────────────────────────────────────────────────────────

export async function updateOutreachLeadStatusAction(
  token: string,
  leadId: string,
  newStatus: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    if (!leadId || !leadId.trim()) {
      return { success: false, error: 'Lead ID is required.' };
    }

    const { error } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        status: newStatus.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId.trim());

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('updateOutreachLeadStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update lead status.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Actions: Manage Marketing Outreach Lead Business Emails
// ────────────────────────────────────────────────────────────────────────────

const EmailFormatSchema = z
  .string()
  .trim()
  .min(3, { message: 'Email address is too short.' })
  .max(255, { message: 'Email address is too long.' })
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Invalid email address format.' });

export interface LeadEmailOperationResult {
  leadId: string;
  business_emails: BusinessEmailsMap;
}

export async function addOutreachLeadEmailAction(
  token: string,
  leadId: string,
  email: string,
  status: EmailDeliverabilityStatus = 'unverified'
): Promise<ActionResponse<LeadEmailOperationResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const parsedEmail = EmailFormatSchema.safeParse(email);
    if (!parsedEmail.success) {
      return { success: false, error: parsedEmail.error.issues[0]?.message || 'Invalid email format.' };
    }
    const cleanEmail = parsedEmail.data.toLowerCase();

    // 1. Attempt RPC call (migration 20261003001500)
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('marketing_add_lead_email', {
      p_lead_id: parsedId.data,
      p_email: cleanEmail,
      p_status: status,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      return {
        success: true,
        data: {
          leadId: parsedId.data,
          business_emails: normalizeBusinessEmails(rpcData),
        },
      };
    }

    // 2. Resilient fallback: Direct table update if RPC is not yet applied
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, business_emails')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingLead) return { success: false, error: 'Marketing lead not found.' };

    const currentEmails = normalizeBusinessEmails(existingLead.business_emails);
    const updatedEmails: BusinessEmailsMap = { ...currentEmails, [cleanEmail]: { status } };

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        business_emails: updatedEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, business_emails')
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      data: {
        leadId: parsedId.data,
        business_emails: normalizeBusinessEmails(updatedData?.business_emails || updatedEmails),
      },
    };
  } catch (err: any) {
    console.error('addOutreachLeadEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to add lead email.' };
  }
}

export async function updateOutreachLeadEmailAction(
  token: string,
  leadId: string,
  oldEmail: string,
  newEmail: string,
  status?: EmailDeliverabilityStatus
): Promise<ActionResponse<LeadEmailOperationResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const parsedNewEmail = EmailFormatSchema.safeParse(newEmail);
    if (!parsedNewEmail.success) {
      return { success: false, error: parsedNewEmail.error.issues[0]?.message || 'Invalid new email format.' };
    }

    const cleanOld = oldEmail.trim().toLowerCase();
    const cleanNew = parsedNewEmail.data.toLowerCase();

    // 1. Attempt RPC call (migration 20261003001500)
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('marketing_update_lead_email', {
      p_lead_id: parsedId.data,
      p_old_email: cleanOld,
      p_new_email: cleanNew,
      p_status: status || null,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      return {
        success: true,
        data: {
          leadId: parsedId.data,
          business_emails: normalizeBusinessEmails(rpcData),
        },
      };
    }

    // 2. Resilient fallback: Direct table update preserving priority order
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, business_emails')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingLead) return { success: false, error: 'Marketing lead not found.' };

    const currentEmails = normalizeBusinessEmails(existingLead.business_emails);
    const updatedEmails: BusinessEmailsMap = {};
    for (const [key, val] of Object.entries(currentEmails)) {
      if (key === cleanOld) {
        updatedEmails[cleanNew] = status ? { ...val, status } : val;
      } else if (key !== cleanNew) {
        updatedEmails[key] = val;
      }
    }
    if (!updatedEmails[cleanNew]) {
      updatedEmails[cleanNew] = { status: status || 'unverified' };
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        business_emails: updatedEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, business_emails')
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      data: {
        leadId: parsedId.data,
        business_emails: normalizeBusinessEmails(updatedData?.business_emails || updatedEmails),
      },
    };
  } catch (err: any) {
    console.error('updateOutreachLeadEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to update lead email.' };
  }
}

export async function updateOutreachLeadEmailStatusAction(
  token: string,
  leadId: string,
  email: string,
  status: EmailDeliverabilityStatus
): Promise<ActionResponse<LeadEmailOperationResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }

    const validStatuses: EmailDeliverabilityStatus[] = ['unverified', 'deliverable', 'undeliverable'];
    if (!validStatuses.includes(status)) {
      return { success: false, error: 'Invalid deliverability status.' };
    }

    // 1. Attempt RPC call
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('marketing_update_lead_email', {
      p_lead_id: parsedId.data,
      p_old_email: cleanEmail,
      p_new_email: cleanEmail,
      p_status: status,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      return {
        success: true,
        data: {
          leadId: parsedId.data,
          business_emails: normalizeBusinessEmails(rpcData),
        },
      };
    }

    // 2. Direct table fallback preserving priority order
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, business_emails')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingLead) return { success: false, error: 'Marketing lead not found.' };

    const currentEmails = normalizeBusinessEmails(existingLead.business_emails);
    const updatedEmails: BusinessEmailsMap = {};
    for (const [key, val] of Object.entries(currentEmails)) {
      if (key === cleanEmail) {
        updatedEmails[key] = { ...val, status };
      } else {
        updatedEmails[key] = val;
      }
    }
    if (!updatedEmails[cleanEmail]) {
      updatedEmails[cleanEmail] = { status };
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        business_emails: updatedEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, business_emails')
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      data: {
        leadId: parsedId.data,
        business_emails: normalizeBusinessEmails(updatedData?.business_emails || updatedEmails),
      },
    };
  } catch (err: any) {
    console.error('updateOutreachLeadEmailStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update email deliverability status.' };
  }
}

export interface LeadEmailVerificationResult {
  leadId: string;
  email: string;
  status: EmailDeliverabilityStatus;
  score: number | null;
  scoreStatus: string | null;
  provider: string;
  verified_at: string;
  business_emails: BusinessEmailsMap;
}

export async function verifyOutreachLeadEmailAction(
  token: string,
  leadId: string,
  email: string
): Promise<ActionResponse<LeadEmailVerificationResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }

    if (!isNo2BounceConfigured()) {
      return {
        success: false,
        error: 'No2Bounce is not configured. Please set NO2BOUNCE_API_KEY in server environment variables.',
      };
    }

    // Step 1: Query No2Bounce for verification
    const verification = await verifySingleEmail(cleanEmail);

    if (verification.failOpen && verification.error && verification.status === 'unverified') {
      return {
        success: false,
        error: `Email verification failed: ${verification.error}`,
      };
    }

    // Step 2: Persist to cross-lead cache table
    if (verification.status === 'deliverable' || verification.status === 'undeliverable') {
      void saveEmailVerifications([verification]);
    }

    // Step 3: Fetch existing lead to update business_emails
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, business_emails')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingLead) return { success: false, error: 'Marketing lead not found.' };

    const currentEmails = normalizeBusinessEmails(existingLead.business_emails);
    const existingRecord = currentEmails[cleanEmail] || { status: 'unverified' };

    const updatedRecord: EmailRecord = {
      ...existingRecord,
      status: verification.status,
      verification_provider: verification.provider,
      verification_score: verification.score ?? undefined,
      verification_status: verification.scoreStatus ?? undefined,
      verified_at: verification.verifiedAt,
    };

    const updatedEmails: BusinessEmailsMap = {
      ...currentEmails,
      [cleanEmail]: updatedRecord,
    };

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        business_emails: updatedEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, business_emails')
      .single();

    if (updateError) throw updateError;

    const normalizedUpdated = normalizeBusinessEmails(updatedData?.business_emails || updatedEmails);

    return {
      success: true,
      data: {
        leadId: parsedId.data,
        email: cleanEmail,
        status: verification.status,
        score: verification.score,
        scoreStatus: verification.scoreStatus,
        provider: verification.provider,
        verified_at: verification.verifiedAt,
        business_emails: normalizedUpdated,
      },
    };
  } catch (err: any) {
    console.error('verifyOutreachLeadEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to verify email deliverability.' };
  }
}

export async function deleteOutreachLeadEmailAction(
  token: string,
  leadId: string,
  email: string
): Promise<ActionResponse<LeadEmailOperationResult>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Attempt RPC call (migration 20261003001500)
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('marketing_delete_lead_email', {
      p_lead_id: parsedId.data,
      p_email: cleanEmail,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      return {
        success: true,
        data: {
          leadId: parsedId.data,
          business_emails: normalizeBusinessEmails(rpcData),
        },
      };
    }

    // 2. Resilient fallback: Direct table update preserving priority order
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, business_emails')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingLead) return { success: false, error: 'Marketing lead not found.' };

    const currentEmails = normalizeBusinessEmails(existingLead.business_emails);
    const updatedEmails: BusinessEmailsMap = {};
    for (const [key, val] of Object.entries(currentEmails)) {
      if (key !== cleanEmail) {
        updatedEmails[key] = val;
      }
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .update({
        business_emails: updatedEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, business_emails')
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      data: {
        leadId: parsedId.data,
        business_emails: normalizeBusinessEmails(updatedData?.business_emails || updatedEmails),
      },
    };
  } catch (err: any) {
    console.error('deleteOutreachLeadEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete lead email.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Outreach guard: tools already listed in ai_tools / submitted in ai_tool_submissions
// ────────────────────────────────────────────────────────────────────────────

// Keeps every RPC response well below PostgREST's max-rows limit (1000).
const EXISTING_TOOL_CHECK_CHUNK = 100;
// Keeps the `id=in.(...)` query string short.
const LEAD_ID_CHUNK = 200;
const MAX_GUARD_LEADS = 1000;

// Inline (not LeadIdSchema): these are evaluated at module load, before LeadIdSchema is declared.
const GuardLeadIdsSchema = z
  .array(z.uuid({ message: 'Invalid lead ID.' }))
  .max(MAX_GUARD_LEADS, { message: `Maximum ${MAX_GUARD_LEADS} leads per request.` });

const MAX_SEND_ITEMS = 1000;

/** Payload of sendOutreachLeadEmailAction (limits are generous; they only stop abuse). */
const OutreachSendParamsSchema = z.object({
  templateId: z.string().trim().min(1, { message: 'Template is required.' }).max(100),
  items: z
    .array(
      z.object({
        leadId: z.string().max(100),
        toolName: z.string().max(1000).default(''),
        toolSiteUrl: z.string().max(4096).default(''),
        recipientEmail: z.string().trim().min(3, { message: 'Invalid recipient email address.' }).max(320),
        recipientName: z.string().max(1000).optional(),
      })
    )
    .min(1, { message: 'No recipients provided to send email.' })
    .max(MAX_SEND_ITEMS, { message: `Maximum ${MAX_SEND_ITEMS} recipients per send.` }),
  customSubject: z.string().max(1000).optional(),
  customBody: z.string().max(200_000).optional(),
  customHtml: z.string().max(500_000).optional(),
  variables: z
    .record(z.string().regex(/^[a-z0-9_]{1,64}$/i), z.string().max(5000), {
      error: 'Invalid template variables (names may only contain letters, digits and _).',
    })
    .optional(),
  bcc: z.union([z.email(), z.array(z.email()).max(10)]).optional(),
  /** Leads the admin explicitly confirmed despite an existing reply. */
  allowRepliedLeadIds: GuardLeadIdsSchema.default([]),
  /** Leads the admin explicitly confirmed to receive this template again. */
  allowRepeatLeadIds: GuardLeadIdsSchema.default([]),
});

/**
 * Looks up the given website URLs in ai_tools and ai_tool_submissions (any status) via
 * rpc marketing_find_existing_tools (migration 20260930150000). Keys of the result are the
 * URLs exactly as passed. Throws when the check cannot be performed.
 */
async function findExistingTools(siteUrls: unknown[]): Promise<ExistingToolMatches> {
  const unique = Array.from(
    new Set(siteUrls.filter((u): u is string => typeof u === 'string' && u.trim() !== ''))
  );
  const matches: ExistingToolMatches = new Map();
  if (unique.length === 0) return matches;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += EXISTING_TOOL_CHECK_CHUNK) {
    chunks.push(unique.slice(i, i + EXISTING_TOOL_CHECK_CHUNK));
  }

  const responses = await Promise.all(
    chunks.map((chunk) => supabaseAdmin.rpc('marketing_find_existing_tools', { p_site_urls: chunk }))
  );

  for (const { data, error } of responses) {
    if (error) {
      console.error('marketing_find_existing_tools failed:', error);
      const functionMissing = error.code === 'PGRST202' || error.code === '42883';
      throw new Error(
        functionMissing
          ? 'Tool validation service is temporarily unavailable. Please verify database functions are deployed.'
          : `Could not check whether these tools are already on Toolbit (${error.message}).`
      );
    }

    for (const row of (data || []) as any[]) {
      if (typeof row?.site_url !== 'string') continue;
      let list = matches.get(row.site_url);
      if (!list) matches.set(row.site_url, (list = []));
      list.push({
        host: String(row.host ?? ''),
        source: row.source as ExistingToolSource,
        recordId: Number(row.record_id),
        toolName: row.tool_name ?? null,
        toolSlug: row.tool_slug ?? null,
        status: row.status ?? null,
        matchedUrl: row.matched_url ?? null,
      });
    }
  }

  return matches;
}

interface GuardLeadRow {
  id: string;
  toolName: string;
  toolSiteUrl: string | null;
  /** Lower-cased, trimmed business emails (recipients must be one of these). */
  businessEmails: ReadonlySet<string>;
  businessEmailsMap: BusinessEmailsMap;
  status: string;
  isToolSubmission: boolean;
  history: OutreachSendHistory;
}

/**
 * Current name, site URL, business emails, status and send history (computed field
 * `outreach_send_history`, migration 20260930170000) of the given leads, read fresh from the database.
 * Unknown / invalid IDs are simply absent from the result. Throws when the data cannot be read.
 */
async function fetchGuardLeadRows(leadIds: unknown[]): Promise<Map<string, GuardLeadRow>> {
  const ids = Array.from(
    new Set(leadIds.filter((id): id is string => typeof id === 'string' && LeadIdSchema.safeParse(id).success))
  );
  const rows = new Map<string, GuardLeadRow>();
  if (ids.length === 0) return rows;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += LEAD_ID_CHUNK) chunks.push(ids.slice(i, i + LEAD_ID_CHUNK));

  const responses = await Promise.all(
    chunks.map((chunk) =>
      supabaseAdmin
        .from('marketing_outreach_leads')
        .select('id, tool_name, tool_site_url, business_emails, status, outreach_send_history, metadata')
        .in('id', chunk)
    )
  );

  for (const { data, error } of responses) {
    if (error) {
      console.error('fetchGuardLeadRows failed:', error);
      const historyMissing = /outreach_send_history/.test(error.message || '');
      throw new Error(
        historyMissing
          ? 'Lead outreach history service is temporarily unavailable. Please verify database functions are deployed.'
          : `Could not load the selected leads (${error.message}).`
      );
    }

    for (const row of (data || []) as any[]) {
      const history = parseOutreachSendHistory(row.outreach_send_history);
      if (!history) throw new Error(`Could not read the email history of lead ${row.id}.`);
      const emailMap = normalizeBusinessEmails(row.business_emails);
      rows.set(row.id, {
        id: row.id,
        toolName: typeof row.tool_name === 'string' ? row.tool_name.trim() : '',
        toolSiteUrl: typeof row.tool_site_url === 'string' && row.tool_site_url.trim() ? row.tool_site_url : null,
        businessEmails: new Set(Object.keys(emailMap)),
        businessEmailsMap: emailMap,
        status: typeof row.status === 'string' ? row.status : '',
        isToolSubmission: Boolean(
          row.metadata?.is_tool_submission === true || row.metadata?.is_tool_submission === 'true'
        ),
        history,
      });
    }
  }

  return rows;
}

/** Existing-tool matches for a set of URLs, merged and de-duplicated (listed tools first). */
function collectExistingMatches(matches: ExistingToolMatches, urls: string[]): ExistingToolMatch[] {
  const seen = new Set<string>();
  const list: ExistingToolMatch[] = [];
  for (const url of urls) {
    for (const match of matches.get(url) || []) {
      const key = `${match.source}:${match.recordId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(match);
    }
  }
  return sortExistingToolMatches(list);
}

interface SkipDecision {
  reason: OutreachSkipReason;
  message: string;
}

/**
 * Decides for every send item (same order as `items`) whether it must be skipped.
 * Uses the database as the source of truth: the lead's stored URL is checked in addition to
 * the URL sent by the client, and history/status are read fresh at send time.
 * Replied / repeat-template leads are only sent when the admin explicitly confirmed that lead.
 */
interface SendItemDecision {
  /** Fresh lead row from the database (source of the template values), null if not found. */
  lead: GuardLeadRow | null;
  skip: SkipDecision | null;
}

async function evaluateSendItems(
  items: OutreachSendItem[],
  templateId: string,
  allowReplied: ReadonlySet<string>,
  allowRepeat: ReadonlySet<string>
): Promise<SendItemDecision[]> {
  const leads = await fetchGuardLeadRows(items.map((item) => item.leadId));

  const urlsPerItem = items.map((item) => {
    const urls = new Set<string>();
    if (item.toolSiteUrl?.trim()) urls.add(item.toolSiteUrl);
    const stored = leads.get(item.leadId)?.toolSiteUrl;
    if (stored) urls.add(stored);
    return Array.from(urls);
  });
  const matches = await findExistingTools(urlsPerItem.flat());

  const seenRecipients = new Set<string>();
  return items.map((item, index): SendItemDecision => {
    const lead = leads.get(item.leadId) ?? null;
    const skip = (reason: OutreachSkipReason, message: string): SendItemDecision => ({
      lead,
      skip: { reason, message },
    });
    if (!lead) return skip('lead_not_found', 'Lead not found (it may have been deleted)');

    const existing = collectExistingMatches(matches, urlsPerItem[index]);
    const filteredExisting = lead.isToolSubmission
      ? existing.filter((m) => m.source !== 'ai_tool_submissions')
      : existing;
    if (filteredExisting.length > 0) return skip('existing_tool', describeExistingToolMatches(filteredExisting));

    // Only the lead's own business emails can be targeted (no arbitrary addresses via a modified request)
    const email = item.recipientEmail.toLowerCase();
    if (!lead.businessEmails.has(email)) {
      return skip('recipient_not_on_lead', "Address is not one of this lead's business emails");
    }

    // Protection for domain sender reputation: block undeliverable & bounced emails
    const emailRecord = lead.businessEmailsMap[email];
    const deliverabilityStatus = emailRecord?.status || 'unverified';
    const isBounced =
      emailRecord?.resend_status === 'bounced' ||
      (deliverabilityStatus === 'undeliverable' && Boolean(emailRecord?.bounce_reason));
    if (deliverabilityStatus === 'undeliverable' || isBounced) {
      const reasonDetail = emailRecord?.bounce_reason ? ` (bounced: ${emailRecord.bounce_reason})` : '';
      return skip(
        'undeliverable_recipient',
        `Address is marked as undeliverable and blocked to protect sender reputation${reasonDetail}`
      );
    }

    const recipientKey = `${lead.id}|${email}`;
    if (seenRecipients.has(recipientKey)) return skip('duplicate_recipient', 'Duplicate recipient in this batch');
    seenRecipients.add(recipientKey);

    const flags = evaluateOutreachHistory(lead.status, lead.history, templateId);
    if (flags.replied && !allowReplied.has(lead.id)) return skip('replied', flags.replied);
    if (flags.templateSent && !allowRepeat.has(lead.id)) return skip('template_already_sent', flags.templateSent);
    return { lead, skip: null };
  });
}

function toSkippedResult(item: OutreachSendItem, decision: SendItemDecision): SendResult {
  return {
    email: item.recipientEmail,
    success: false,
    skipped: true,
    skipReason: decision.skip?.reason,
    toolName: decision.lead?.toolName || item.toolName || undefined,
    error: decision.skip?.message,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Pre-check for the send modal (one request): tools already on Toolbit
// plus each lead's current status and email history. The server re-checks on send.
// ────────────────────────────────────────────────────────────────────────────

export async function getOutreachSendPrecheckAction(
  token: string,
  leadIds: string[]
): Promise<ActionResponse<Record<string, OutreachLeadGuard>>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsed = GuardLeadIdsSchema.safeParse(leadIds);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid lead IDs.' };
    }

    const leads = await fetchGuardLeadRows(parsed.data);
    const matches = await findExistingTools(Array.from(leads.values(), (lead) => lead.toolSiteUrl));

    const data: Record<string, OutreachLeadGuard> = {};
    for (const lead of leads.values()) {
      const existingMatches = lead.toolSiteUrl ? collectExistingMatches(matches, [lead.toolSiteUrl]) : [];
      const filteredExisting = lead.isToolSubmission
        ? existingMatches.filter((m) => m.source !== 'ai_tool_submissions')
        : existingMatches;

      data[lead.id] = {
        status: lead.status,
        history: lead.history,
        existing: filteredExisting,
      };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('getOutreachSendPrecheckAction error:', err);
    return { success: false, error: err?.message || 'Failed to check the selected leads.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: Append outreach tracking parameters to specific CTA links
// ────────────────────────────────────────────────────────────────────────────

/**
 * Specifically transforms Toolbit CTA links like https://www.toolbit.ai/submit or https://toolbit.ai/submit
 * in email content to include outreach_id, utm_source, utm_medium, and utm_campaign while leaving generic
 * links (e.g. homepage, contact) untouched.
 *
 * In HTML mode (isHtml: true), only destination URLs inside `href="..."` or `href='...'` are updated
 * with tracking parameters, ensuring visible anchor text (e.g. `https://www.toolbit.ai/submit` or `toolbit.ai/submit`)
 * stays clean without displaying long query parameters to recipients.
 */
function appendOutreachCtaParams(
  content: string,
  outreachId: string,
  campaign: string,
  options?: { isHtml?: boolean }
): string {
  if (!content) return content;
  const isHtml = options?.isHtml ?? false;

  const buildTrackingUrl = (basePath: string, existingQuery?: string): string => {
    try {
      const normalizedQuery = (existingQuery || '').replace(/&amp;/g, '&');
      const url = new URL(basePath + normalizedQuery, 'https://www.toolbit.ai');
      url.searchParams.set('outreach_id', outreachId);
      url.searchParams.set('utm_source', 'email');
      url.searchParams.set('utm_medium', 'outreach');
      url.searchParams.set('utm_campaign', campaign);
      return url.toString();
    } catch {
      return basePath + (existingQuery || '');
    }
  };

  if (isHtml) {
    // Only update CTA URLs when inside href="..." or href='...'
    return content.replace(
      /(href\s*=\s*(['"]))(https?:\/\/(?:www\.)?toolbit\.ai\/submit\/?)([\w\-.~:/?#\[\]@!$&'()*+,;=]*)?(\2)/gi,
      (_match, prefix, quote, basePath, existingQuery) => {
        const trackingUrl = buildTrackingUrl(basePath, existingQuery);
        return `${prefix}${trackingUrl}${quote}`;
      }
    );
  }

  return content.replace(
    /(https?:\/\/(?:www\.)?toolbit\.ai\/submit\/?)([\w\-.~:/?#\[\]@!$&'()*+,;=]*)?/gi,
    (_match, basePath, existingQuery) => buildTrackingUrl(basePath, existingQuery)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Send outreach emails to selected leads (Single or Bulk)
// ────────────────────────────────────────────────────────────────────────────

export async function sendOutreachLeadEmailAction(
  token: string,
  params: {
    templateId: string;
    items: OutreachSendItem[];
    customSubject?: string;
    customBody?: string;
    customHtml?: string;
    variables?: Record<string, string>;
    bcc?: string | string[];
    /** Leads the admin explicitly confirmed despite an existing reply. */
    allowRepliedLeadIds?: string[];
    /** Leads the admin explicitly confirmed to receive this template again. */
    allowRepeatLeadIds?: string[];
  }
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // Server actions are public endpoints: validate the whole payload (types, sizes, emails).
    const parsed = OutreachSendParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid send request.' };
    }
    const input = parsed.data;
    const items: OutreachSendItem[] = input.items;

    if (!isResendConfigured()) {
      return {
        success: false,
        error: 'Resend is not configured. Please set RESEND_API_KEY in your environment variables.',
      };
    }

    const effectiveTemplateId =
      input.templateId === 'tool_relist' || input.templateId === 'relist_launch'
        ? 'tool_outreach'
        : input.templateId;

    // Guards (see lib/marketing/send-guards.ts): tools already on Toolbit, unknown leads /
    // addresses, duplicate recipients, leads that already replied or already received this
    // template. Fails closed: a sent email cannot be taken back, so if a check itself fails
    // nothing is sent.
    let decisions: SendItemDecision[];
    try {
      decisions = await evaluateSendItems(
        items,
        effectiveTemplateId,
        new Set(input.allowRepliedLeadIds),
        new Set(input.allowRepeatLeadIds)
      );
    } catch (checkErr: any) {
      return {
        success: false,
        error: `${checkErr?.message || 'Could not check the selected leads.'} No emails were sent.`,
      };
    }

    // Pre-send Email Deliverability Verification via No2Bounce with persistent caching & fail-open resilience
    if (isNo2BounceConfigured()) {
      try {
        const sendableIndices = items
          .map((item, idx) => ({ item, idx }))
          .filter(({ idx }) => !decisions[idx].skip && decisions[idx].lead);

        const unverifiedItems = sendableIndices.filter(({ item, idx }) => {
          const lead = decisions[idx].lead;
          if (!lead) return false;
          const email = item.recipientEmail.toLowerCase();
          const record = lead.businessEmailsMap[email];
          return record?.status !== 'deliverable' && record?.status !== 'undeliverable';
        });

        if (unverifiedItems.length > 0) {
          const emailsToVerify = Array.from(
            new Set(unverifiedItems.map(({ item }) => item.recipientEmail.toLowerCase()))
          );
          const leadsToUpdateInDb = new Set<string>();

          // 1. Cross-lead persistent verification cache check (Credit Optimization)
          const cachedVerifications = await getCachedEmailVerifications(emailsToVerify);
          const stillNeedingVerification: string[] = [];

          for (const email of emailsToVerify) {
            const cached = cachedVerifications.get(email);
            if (cached) {
              for (const { idx } of unverifiedItems.filter(({ item }) => item.recipientEmail.toLowerCase() === email)) {
                const lead = decisions[idx].lead!;
                const curRec = lead.businessEmailsMap[email] || { status: 'unverified' };
                lead.businessEmailsMap[email] = {
                  ...curRec,
                  status: cached.status,
                  verification_provider: cached.provider,
                  verification_score: cached.score ?? undefined,
                  verification_status: cached.score_status ?? undefined,
                  verified_at: cached.verified_at,
                };
                leadsToUpdateInDb.add(lead.id);

                if (cached.status === 'undeliverable') {
                  decisions[idx].skip = {
                    reason: 'undeliverable_recipient',
                    message: `Address is cached as undeliverable (${cached.score_status || 'invalid mailbox'}). Blocked to protect sender reputation.`,
                  };
                }
              }
            } else {
              stillNeedingVerification.push(email);
            }
          }

          // 2. Query No2Bounce for emails not in cache (bounded timeout, fail-open)
          if (stillNeedingVerification.length > 0) {
            const apiResults = await verifyEmailsBatch(stillNeedingVerification, { concurrency: 4, timeoutMs: 12000 });
            const resultsToPersist: No2BounceVerificationResult[] = [];

            for (const [email, result] of apiResults.entries()) {
              if (!result.failOpen && (result.status === 'deliverable' || result.status === 'undeliverable')) {
                resultsToPersist.push(result);
              }

              for (const { idx } of unverifiedItems.filter(({ item }) => item.recipientEmail.toLowerCase() === email)) {
                const lead = decisions[idx].lead!;
                const curRec = lead.businessEmailsMap[email] || { status: 'unverified' };

                if (result.status === 'deliverable' || result.status === 'undeliverable') {
                  lead.businessEmailsMap[email] = {
                    ...curRec,
                    status: result.status,
                    verification_provider: result.provider,
                    verification_score: result.score ?? undefined,
                    verification_status: result.scoreStatus ?? undefined,
                    verified_at: result.verifiedAt,
                  };
                  leadsToUpdateInDb.add(lead.id);

                  if (result.status === 'undeliverable') {
                    decisions[idx].skip = {
                      reason: 'undeliverable_recipient',
                      message: `Address verified as undeliverable by No2Bounce (${result.scoreStatus || 'invalid mailbox'}). Blocked to protect sender reputation.`,
                    };
                  }
                }
              }
            }

            // Persist to cross-lead cache table
            if (resultsToPersist.length > 0) {
              void saveEmailVerifications(resultsToPersist);
            }
          }

          // Persist updated email deliverability records to marketing_outreach_leads table
          for (const leadId of leadsToUpdateInDb) {
            const matchingLead = Array.from(decisions.values())
              .map((d) => d.lead)
              .find((l) => l && l.id === leadId);
            if (matchingLead) {
              void supabaseAdmin
                .from('marketing_outreach_leads')
                .update({
                  business_emails: matchingLead.businessEmailsMap,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', leadId);
            }
          }
        }
      } catch (verificationErr: any) {
        console.warn('[No2Bounce] Pre-send deliverability check degraded gracefully:', verificationErr?.message);
      }
    }

    const skipReasons = decisions.flatMap((d) => (d.skip ? [d.skip.reason] : []));
    const sendableCount = items.length - skipReasons.length;

    if (sendableCount === 0) {
      return {
        success: false,
        results: items.map((item, i) => toSkippedResult(item, decisions[i])),
        error:
          items.length === 1
            ? `No email was sent: ${decisions[0].skip?.message}.`
            : `No emails were sent: every recipient was skipped (${summarizeSkipReasons(skipReasons)}).`,
      };
    }

    const bccAddress = resolveEffectiveBcc(input.bcc);

    // Fetch template (own keys only, never inherited object properties)
    const templates = await readTemplatesFromDB();
    const template =
      templates && Object.prototype.hasOwnProperty.call(templates, effectiveTemplateId)
        ? templates[effectiveTemplateId]
        : null;
    if (!template || typeof template !== 'object') {
      return { success: false, error: `Template "${effectiveTemplateId}" not found.` };
    }

    const fromName =
      !template.from_name?.trim() || template.from_name.trim() === 'Toolbit Team'
        ? 'Toolbit AI'
        : template.from_name.trim();
    const fromAddress = `${fromName} <${template.from_email}>`;

    const baseSubject = input.customSubject?.trim() || template.subject;
    const baseText = input.customBody?.trim() || template.text;

    let baseHtml = '';
    if (input.customHtml?.trim()) {
      baseHtml = htmlBodyToFullEmailHtml(input.customHtml.trim());
    } else if (input.customBody?.trim()) {
      baseHtml = textToEmailHtml(input.customBody.trim());
    } else if (template.html?.trim()) {
      baseHtml = template.html;
    } else {
      baseHtml = textToEmailHtml(template.text);
    }

    const results: SendResult[] = [];
    let remainingSends = sendableCount;

    // Send to each recipient with individual variable interpolation
    for (const [index, item] of items.entries()) {
      const decision = decisions[index];
      if (decision.skip || !decision.lead) {
        // Skipped: nothing is sent and nothing is logged in the lead's conversation.
        results.push(toSkippedResult(item, decision));
        continue;
      }

      // Tool name / URL come from the database, not from the request. Scraped values are
      // untrusted: HTML-escaped in the HTML body, only http(s) URLs are linked.
      const lead = decision.lead;
      const email = item.recipientEmail;
      const toolName = lead.toolName || 'AI Tool';
      const toolSiteUrl = safeHttpUrl(lead.toolSiteUrl);
      const recipientName = item.recipientName?.trim() || toolName;
      const firstName = recipientName ? recipientName.split(' ')[0] : 'there';

      const trackingCtaUrl = `https://www.toolbit.ai/submit?outreach_id=${encodeURIComponent(lead.id)}&utm_source=email&utm_medium=outreach&utm_campaign=${encodeURIComponent(effectiveTemplateId)}`;

      const toolDomain = getToolDomain(toolSiteUrl) || toolName;

      // Build a UTM-tagged version of the tool's site URL if needed by custom variables
      const toolSiteUrlUtm = toolSiteUrl
        ? appendUtmParams(toolSiteUrl, {
            utm_source: 'toolbit.ai',
            utm_medium: 'email',
            utm_campaign: 'outreach',
          })
        : '';

      const textVars: Record<string, string> = {
        ...(input.variables || {}),
        tool_name: toolName,
        company_name: toolName,
        tool_domain: toolDomain,
        domain_name: toolDomain,
        tool_site_url: toolSiteUrl,
        tool_url: toolSiteUrl,
        tool_site_url_utm: toolSiteUrlUtm,
        recipient_name: recipientName,
        first_name: firstName,
        recipient_email: email,
        outreach_id: lead.id,
        submit_url: trackingCtaUrl,
        cta_url: trackingCtaUrl,
      };
      const htmlVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(textVars)) htmlVars[key] = escapeHtml(value);

      const finalSubject = substituteVariables(baseSubject, textVars, { isHtml: false }).replace(/[\r\n]+/g, ' ');
      const rawHtml = substituteVariables(baseHtml, htmlVars, { isHtml: true });
      const rawText = baseText ? substituteVariables(baseText, textVars, { isHtml: false }) : undefined;

      // Specifically inject outreach tracking into Toolbit CTA destination links (e.g. toolbit.ai/submit)
      // leaving generic brand links (e.g. homepage, contact) untouched.
      const finalHtml = appendOutreachCtaParams(rawHtml, lead.id, effectiveTemplateId, { isHtml: true });
      const finalText = rawText ? appendOutreachCtaParams(rawText, lead.id, effectiveTemplateId, { isHtml: false }) : undefined;

      const result = await sendResendEmail({
        from: fromAddress,
        to: email,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
        bcc: bccAddress,
        // Lets the Resend webhook (Supabase Edge Function `resend-webhook`) recognise outreach emails
        tags: buildOutreachTags(lead.id),
      });

      results.push({
        email,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });

      if (result.success && result.messageId) {
        const curRecord = lead.businessEmailsMap[email] || { status: 'unverified' };
        lead.businessEmailsMap[email] = {
          ...curRecord,
          resend_status: 'sent',
          last_sent_at: new Date().toISOString(),
          last_resend_id: result.messageId,
        };
        // Background update to persist sent telemetry on lead email record
        void supabaseAdmin
          .from('marketing_outreach_leads')
          .update({
            business_emails: lead.businessEmailsMap,
          })
          .eq('id', lead.id);
      }

      // Log into the lead's conversation thread (parent = this business email) while the
      // rate-limit pause runs. recordOutboundMessage never throws, so a logging problem cannot
      // affect the send result; both finish before the next send (appends stay in order).
      remainingSends -= 1;
      await Promise.all([
        recordOutboundMessage({
          leadId: lead.id,
          toEmail: email,
          from: fromAddress,
          subject: finalSubject,
          html: finalHtml,
          text: finalText,
          resendEmailId: result.success ? result.messageId : undefined,
          templateId: effectiveTemplateId,
          error: result.success ? undefined : result.error,
        }),
        // Subtle delay between sends to respect provider rate limits (not after the last one)
        remainingSends > 0 ? new Promise((resolve) => setTimeout(resolve, 80)) : null,
      ]);
    }

    // Skipped recipients are reported separately, they are not failures.
    const attempted = results.filter((r) => !r.skipped);
    const sent = attempted.filter((r) => r.success);
    const failedCount = attempted.length - sent.length;
    const skippedNote =
      skipReasons.length > 0 ? ` ${skipReasons.length} skipped (${summarizeSkipReasons(skipReasons)}).` : '';

    if (failedCount === 0) {
      // Skipped recipients (if any) are flagged in `results`.
      return { success: true, results, messageId: sent[0]?.messageId };
    }

    if (sent.length > 0) {
      return {
        success: true,
        results,
        error: `${failedCount} of ${attempted.length} emails failed to send.${skippedNote}`,
      };
    }

    return {
      success: false,
      results,
      error: `${attempted[0]?.error || 'All emails failed to send.'}${skippedNote}`,
    };
  } catch (err: any) {
    console.error('sendOutreachLeadEmailAction error:', err);
    return { success: false, error: err?.message || 'Failed to dispatch outreach emails.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Conversation history (Resend replies) – Types
// ────────────────────────────────────────────────────────────────────────────

export interface OutreachLeadConversation {
  lead: Pick<MarketingOutreachLead, 'id' | 'tool_name' | 'tool_site_url' | 'business_emails' | 'status' | 'updated_at'>;
  threads: ConversationThread[];
  conversions?: {
    events: OutreachConversionEvent[];
    summary: OutreachConversionSummary | null;
  };
}

export interface ReceivedEmailListEntry extends ResendReceivedEmailListItem {
  link: InboundLink | null;
}

export interface ReceivedEmailsPage {
  items: ReceivedEmailListEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ReceivedEmailDetails {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  created_at: string;
  message_id: string | null;
  text: string | null;
  html: string | null;
  attachments: ResendReceivedAttachment[];
  link: InboundLink | null;
}

const ResendIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/, { message: 'Invalid email ID.' });

// ────────────────────────────────────────────────────────────────────────────
// Action: Full conversation history for one lead (lazy-loaded by the dialog)
// ────────────────────────────────────────────────────────────────────────────

export async function getOutreachLeadConversationAction(
  token: string,
  leadId: string
): Promise<ActionResponse<OutreachLeadConversation>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const { data, error } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, tool_name, tool_site_url, business_emails, status, updated_at, conversation_history, conversions')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: 'Lead not found.' };

    const { conversation_history, conversions, ...lead } = data as any;
    const events = Array.isArray(conversions?.events) ? conversions.events : [];
    const summary = (conversions?.summary && typeof conversions.summary === 'object') ? conversions.summary : null;

    return {
      success: true,
      data: {
        lead: {
          ...lead,
          business_emails: normalizeBusinessEmails(lead.business_emails),
          conversions,
          conversion_summary: summary,
          conversion_events: events,
        },
        threads: normalizeConversationHistory(conversation_history),
        conversions: {
          events,
          summary,
        },
      },
    };
  } catch (err: any) {
    console.error('getOutreachLeadConversationAction error:', err);
    return { success: false, error: err?.message || 'Failed to load conversation history.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Fetch website conversion events & summary for one lead
// ────────────────────────────────────────────────────────────────────────────

export async function getOutreachLeadConversionsAction(
  token: string,
  leadId: string
): Promise<ActionResponse<{ events: OutreachConversionEvent[]; summary: OutreachConversionSummary | null }>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsedId = LeadIdSchema.safeParse(leadId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid lead ID.' };
    }

    const { data, error } = await supabaseAdmin
      .from('marketing_outreach_leads')
      .select('id, conversions')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: 'Lead not found.' };

    const conv = (data as any)?.conversions;
    return {
      success: true,
      data: {
        events: Array.isArray(conv?.events) ? conv.events : [],
        summary: (conv?.summary && typeof conv.summary === 'object') ? conv.summary : null,
      },
    };
  } catch (err: any) {
    console.error('getOutreachLeadConversionsAction error:', err);
    return { success: false, error: err?.message || 'Failed to load conversion events.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Live list of received emails (Resend Receiving API) + linked lead
// ────────────────────────────────────────────────────────────────────────────

export async function getResendReceivedEmailsAction(
  token: string,
  params: { after?: string } = {}
): Promise<ActionResponse<ReceivedEmailsPage>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    let after: string | undefined;
    if (params.after) {
      const parsed = ResendIdSchema.safeParse(params.after);
      if (!parsed.success) return { success: false, error: 'Invalid pagination cursor.' };
      after = parsed.data;
    }

    const res = await listReceivedEmails({ limit: 50, after });
    if (!res.success) {
      return { success: false, error: res.error || 'Failed to fetch received emails from Resend.' };
    }

    const list = res.data || [];
    let links: Record<string, InboundLink> = {};
    try {
      links = await lookupInboundLinks(list.map((item) => item.id));
    } catch (linkErr) {
      // Migration not applied yet (or transient DB error): still show the live list.
      console.warn('lookupInboundLinks failed:', linkErr);
    }

    // Explicit field pick (never forward unknown/future Resend fields to the browser)
    return {
      success: true,
      data: {
        items: list.map((item) => ({
          id: item.id,
          from: item.from,
          to: Array.isArray(item.to) ? item.to : [],
          subject: item.subject || '',
          created_at: item.created_at,
          message_id: item.message_id ?? null,
          attachments: (item.attachments || []).map((a) => ({
            id: a.id,
            filename: a.filename ?? null,
            content_type: a.content_type ?? null,
            size: typeof a.size === 'number' ? a.size : null,
          })),
          link: links[item.id] || null,
        })),
        hasMore: Boolean(res.hasMore),
        nextCursor: res.hasMore && list.length > 0 ? list[list.length - 1].id : null,
      },
    };
  } catch (err: any) {
    console.error('getResendReceivedEmailsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch received emails.' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action: Single received email (body + attachments metadata)
// ────────────────────────────────────────────────────────────────────────────

export async function getResendReceivedEmailDetailsAction(
  token: string,
  emailId: string
): Promise<ActionResponse<ReceivedEmailDetails>> {
  try {
    const auth = await verifyAdminPermission(token, 'marketing', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const parsed = ResendIdSchema.safeParse(emailId);
    if (!parsed.success) return { success: false, error: 'Invalid email ID.' };

    const res = await getReceivedEmail(parsed.data, { htmlFormat: 'cid' });
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to fetch received email from Resend.' };
    }

    let link: InboundLink | null = null;
    try {
      link = (await lookupInboundLinks([parsed.data]))[parsed.data] || null;
    } catch {
      link = null;
    }

    const email = res.data;
    // Explicit field pick: never forward signed raw-download URLs or full headers to the browser.
    return {
      success: true,
      data: {
        id: email.id,
        from: email.from,
        to: email.to || [],
        cc: email.cc || [],
        subject: email.subject || '',
        created_at: email.created_at,
        message_id: email.message_id || null,
        text: email.text ?? null,
        html: email.html ?? null,
        attachments: (email.attachments || []).map((a) => ({
          id: a.id,
          filename: a.filename ?? null,
          content_type: a.content_type ?? null,
          size: typeof a.size === 'number' ? a.size : null,
        })),
        link,
      },
    };
  } catch (err: any) {
    console.error('getResendReceivedEmailDetailsAction error:', err);
    return { success: false, error: err?.message || 'Failed to retrieve received email.' };
  }
}
