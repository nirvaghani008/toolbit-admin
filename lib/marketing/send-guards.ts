/**
 * Outreach send guards shared by the send modal (warnings) and sendOutreachLeadEmailAction
 * (enforcement), so both apply exactly the same rules:
 *
 *   existing_tool          tool already in ai_tools / ai_tool_submissions   never sent
 *   lead_not_found         lead no longer exists                            never sent
 *   recipient_not_on_lead  address is not one of the lead's business emails never sent
 *   duplicate_recipient    same lead + address twice in one batch           sent once
 *   replied                lead already replied (or status replied/launched) only with explicit confirmation
 *   template_already_sent  lead already received the selected template      only with explicit confirmation
 *
 * History comes from the `outreach_send_history` computed field
 * (migration 20260930170000_add_outreach_send_history.sql).
 *
 * Safe to import from both client and server code (no server-only imports).
 */

import type { ExistingToolMatch } from './existing-tools';

export interface OutreachTemplateSendInfo {
  /** Outbound messages with this template that were not failed / bounced. */
  count: number;
  lastSentAt: string | null;
  lastSentTo: string | null;
}

export interface OutreachSendHistory {
  /** Real replies (auto-replies excluded). */
  replyCount: number;
  lastReplyAt: string | null;
  templates: Record<string, OutreachTemplateSendInfo>;
}

/** Per-lead guard data returned by the send pre-check. */
export interface OutreachLeadGuard {
  status: string;
  existing: ExistingToolMatch[];
  history: OutreachSendHistory;
}

export type OutreachSkipReason =
  | 'existing_tool'
  | 'lead_not_found'
  | 'recipient_not_on_lead'
  | 'undeliverable_recipient'
  | 'duplicate_recipient'
  | 'replied'
  | 'template_already_sent';

export interface OutreachHistoryFlags {
  /** Why the lead counts as "already replied", or null. */
  replied: string | null;
  /** Why the lead already received the selected template, or null. */
  templateSent: string | null;
}

/** Pipeline statuses that mean the lead already responded to us. */
const REPLIED_LEAD_STATUSES: ReadonlySet<string> = new Set(['replied', 'launched']);

const SKIP_REASON_LABELS: Record<OutreachSkipReason, string> = {
  existing_tool: 'already on Toolbit',
  lead_not_found: 'lead not found',
  recipient_not_on_lead: 'address not on the lead',
  undeliverable_recipient: 'email marked as undeliverable',
  duplicate_recipient: 'duplicate recipient',
  replied: 'already replied',
  template_already_sent: 'already received this template',
};

/** Keys that must never be used as plain-object keys (prototype pollution / inherited lookups). */
const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Defensive parse of the `outreach_send_history` JSON. Returns null for anything that is not an object. */
export function parseOutreachSendHistory(raw: unknown): OutreachSendHistory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const templates: Record<string, OutreachTemplateSendInfo> = {};
  if (r.templates && typeof r.templates === 'object' && !Array.isArray(r.templates)) {
    for (const [templateId, info] of Object.entries(r.templates as Record<string, unknown>)) {
      if (!templateId || UNSAFE_KEYS.has(templateId) || !info || typeof info !== 'object') continue;
      const i = info as Record<string, unknown>;
      templates[templateId] = {
        count: Math.max(1, toCount(i.count)),
        lastSentAt: toText(i.last_sent_at),
        lastSentTo: toText(i.last_sent_to),
      };
    }
  }

  return { replyCount: toCount(r.reply_count), lastReplyAt: toText(r.last_reply_at), templates };
}

/** "Sep 30, 2026" (UTC, so server and browser render the same date). */
export function formatGuardDate(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** History-based flags for one lead and the selected template (template may be empty). */
export function evaluateOutreachHistory(
  status: string | null | undefined,
  history: OutreachSendHistory,
  templateId: string
): OutreachHistoryFlags {
  let replied: string | null = null;
  if (history.replyCount > 0) {
    const date = formatGuardDate(history.lastReplyAt);
    const count = `${history.replyCount} ${history.replyCount === 1 ? 'reply' : 'replies'}`;
    replied = `Already replied (${count}${date ? `, last on ${date}` : ''})`;
  } else {
    const s = (status || '').trim().toLowerCase();
    if (REPLIED_LEAD_STATUSES.has(s)) replied = `Lead status is "${s}"`;
  }

  let templateSent: string | null = null;
  const aliasTemplateId =
    templateId === 'tool_outreach' ? 'tool_relist' : templateId === 'tool_relist' ? 'tool_outreach' : null;
  const sent =
    templateId && hasOwn(history.templates, templateId)
      ? history.templates[templateId]
      : aliasTemplateId && hasOwn(history.templates, aliasTemplateId)
      ? history.templates[aliasTemplateId]
      : undefined;
  if (sent) {
    const date = formatGuardDate(sent.lastSentAt);
    const times = sent.count > 1 ? ` ${sent.count} times` : '';
    const details = [date ? `last on ${date}` : '', sent.lastSentTo ? `to ${sent.lastSentTo}` : '']
      .filter(Boolean)
      .join(' ');
    templateSent = `Already received this template${times}${details ? ` (${details})` : ''}`;
  }

  return { replied, templateSent };
}

/** "2 already on Toolbit, 1 already replied" */
export function summarizeSkipReasons(reasons: OutreachSkipReason[]): string {
  const counts = new Map<OutreachSkipReason, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) || 0) + 1);
  return Array.from(counts, ([reason, n]) => `${n} ${SKIP_REASON_LABELS[reason]}`).join(', ');
}
