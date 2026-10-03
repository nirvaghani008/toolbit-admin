/**
 * Server-only persistence for marketing_outreach_leads.conversation_history (admin app side).
 *
 *   recordOutboundMessage()  – right after each outreach send (server action)
 *   lookupInboundLinks()     – "Received" history view: which emails are linked to which lead
 *
 * Delivery statuses and inbound replies are written by the Supabase Edge Function
 * `resend-webhook` (supabase/functions/resend-webhook), which Resend calls directly.
 * Both sides share the dependency-free helpers in supabase/functions/_shared/email-utils.ts
 * (Resend tag contract + jsonb-safe text handling).
 *
 * All writes go through idempotent Postgres functions (migration 20260929150000).
 *
 * MUST only be imported from server code (uses the service-role client).
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ConversationMessage } from '@/lib/marketing/conversation';
import {
  MAX_HTML_CHARS,
  MAX_TEXT_CHARS,
  buildOutreachTags,
  capText,
  sanitizeText,
} from '@/supabase/functions/_shared/email-utils';

/** Resend tags that let the webhook recognise outreach emails (single definition, shared with the Edge Function). */
export { buildOutreachTags };

// ────────────────────────────────────────────────────────────────────────────
// Outbound
// ────────────────────────────────────────────────────────────────────────────

export interface OutboundMessageInput {
  leadId: string;
  toEmail: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  resendEmailId?: string;
  templateId?: string;
  error?: string;
}

/**
 * Appends one outbound email to the lead's thread for `toEmail`.
 * Never throws: a logging failure must not turn a sent email into an error.
 */
export async function recordOutboundMessage(input: OutboundMessageInput): Promise<void> {
  try {
    if (!input.leadId || !input.toEmail) return;

    const html = capText(input.html, MAX_HTML_CHARS);
    const text = capText(input.text, MAX_TEXT_CHARS);

    const message: ConversationMessage = {
      direction: 'outbound',
      status: input.resendEmailId ? 'sent' : 'failed',
      resend_email_id: input.resendEmailId || null,
      message_id: null, // filled by the email.sent / email.delivered webhook (Edge Function)
      timestamp: new Date().toISOString(),
      subject: sanitizeText(input.subject),
      from: sanitizeText(input.from),
      to: sanitizeText(input.toEmail),
      body_text: text.value,
      body_html: html.value,
      template_id:
        input.templateId === 'tool_relist' || input.templateId === 'relist_launch'
          ? 'tool_outreach'
          : input.templateId || null,
      truncated: html.truncated || text.truncated || undefined,
      error: input.error ? sanitizeText(input.error) : null,
    };

    const { error } = await supabaseAdmin.rpc('marketing_append_conversation_message', {
      p_lead_id: input.leadId,
      p_thread_email: input.toEmail,
      p_message: message,
    });
    if (error) throw error;
  } catch (err) {
    console.error('recordOutboundMessage error (email was still sent):', err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lookup for the "Received" history view
// ────────────────────────────────────────────────────────────────────────────

export interface InboundLink {
  resend_email_id: string;
  lead_id: string;
  tool_name: string;
  thread_email: string;
}

export async function lookupInboundLinks(ids: string[]): Promise<Record<string, InboundLink>> {
  const map: Record<string, InboundLink> = {};
  const clean = ids.filter((id) => typeof id === 'string' && id.trim()).slice(0, 200);
  if (clean.length === 0) return map;

  const { data, error } = await supabaseAdmin.rpc('marketing_lookup_inbound_links', {
    p_resend_email_ids: clean,
  });
  if (error) throw error;
  for (const row of (data || []) as InboundLink[]) map[row.resend_email_id] = row;
  return map;
}
