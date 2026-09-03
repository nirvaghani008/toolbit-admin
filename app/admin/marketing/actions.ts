'use server';

import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import {
  sendResendEmail,
  isResendConfigured,
  listResendEmails,
  getResendEmail,
  type ResendEmailListItem,
  type ResendEmailDetails,
} from '@/lib/resend';
import { textToEmailHtml, htmlBodyToFullEmailHtml } from '@/lib/email-formatter';

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
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Zod Validation Schemas
// ────────────────────────────────────────────────────────────────────────────

const TemplateIdSchema = z.enum(['sponsored_feature', 'new_tool_launch', 'affiliate_partnership'], {
  message: 'Invalid template ID.',
});

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
  return data.value as Record<string, MarketingTemplate>;
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

  for (const [rawKey, value] of Object.entries(vars)) {
    const key = rawKey.replace(/^\{\{|\}\}$/g, '').trim();
    let val = value || '';

    // If key is tool_name and we have tool_site_url or tool_url, and isHtml is true:
    if (key === 'tool_name' && isHtml) {
      const siteUrl = (vars.tool_site_url || vars.tool_url || '').trim();
      if (siteUrl && val.trim() && !val.includes('<a ')) {
        val = `<a href="${siteUrl}" target="_blank" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${val}</a>`;
      }
    }

    // Standard {{key}} or {{ key }}
    const standardRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(standardRegex, val);

    // URL encoded %7B%7Bkey%7D%7D (often produced in href attributes)
    const encodedRegex = new RegExp(`%7B%7B\\s*${key}\\s*%7D%7D`, 'gi');
    result = result.replace(encodedRegex, val);
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

    // Validate payload
    const payloadResult = UpdateTemplateSchema.safeParse(payload);
    if (!payloadResult.success) {
      const msg = payloadResult.error.issues[0]?.message || 'Invalid template data.';
      return { success: false, error: msg };
    }

    // Read current templates
    const templates = await readTemplatesFromDB();
    if (!templates || !templates[templateId]) {
      return { success: false, error: `Template "${templateId}" not found.` };
    }

    // If text was updated and html wasn't provided or was empty, auto-generate html from text
    const textValue = payloadResult.data.text ?? templates[templateId].text;
    const htmlValue =
      payloadResult.data.html && payloadResult.data.html.trim().length > 0
        ? payloadResult.data.html
        : textToEmailHtml(textValue);

    // Merge updates into the template
    const updatedTemplate: MarketingTemplate = {
      ...templates[templateId],
      ...payloadResult.data,
      html: htmlValue,
      updated_at: new Date().toISOString(),
    };

    templates[templateId] = updatedTemplate;

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

    const { templateId, recipients, variables = {}, customSubject, customBody, customHtml } = validated.data;

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

    const fromAddress = `${template.from_name} <${template.from_email}>`;

    // Send to each recipient individually for proper variable substitution
    const results: SendResult[] = [];

    for (const recipient of recipients) {
      const recipientName =
        recipient.name && recipient.name.trim().length > 0
          ? recipient.name.trim()
          : 'there';

      // Build substitution variables per recipient
      const recipientVars: Record<string, string> = {
        ...variables,
        recipient_name: recipientName,
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
