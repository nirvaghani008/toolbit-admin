/**
 * Pure, dependency-free email helpers shared by:
 *   - the Supabase Edge Function `resend-webhook` (Deno)
 *   - the Next.js admin app (outbound logging + Resend tags)
 *
 * Keep this file free of imports and runtime globals (no Deno.*, no process.*)
 * so it runs unchanged in Deno, Node and the Next.js bundler.
 */

export const MAX_HTML_CHARS = 200_000;
export const MAX_TEXT_CHARS = 50_000;

/**
 * Resend tag that marks emails sent from the Outreach Leads flow. It is set when
 * sending (Next.js) and read back from webhook payloads (Edge Function), so both
 * sides must use this single definition.
 */
export const OUTREACH_TAG_NAME = 'toolbit_source';
export const OUTREACH_TAG_VALUE = 'outreach_lead';

export const DEFAULT_OWN_EMAIL_DOMAINS = ['mail.toolbit.ai', 'toolbit.ai'];

/** Resend tag values allow only ASCII letters, numbers, `_` and `-` (max 256). */
function toTagValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

export function buildOutreachTags(leadId: string): { name: string; value: string }[] {
  return [
    { name: OUTREACH_TAG_NAME, value: OUTREACH_TAG_VALUE },
    { name: 'lead_id', value: toTagValue(leadId) },
  ];
}

/**
 * Makes a string safe for Postgres jsonb: removes NUL characters and replaces lone
 * UTF-16 surrogates (e.g. an emoji cut in half) with U+FFFD. Both are rejected by jsonb.
 */
export function sanitizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    // deno-lint-ignore no-control-regex -- NUL is exactly what must be removed (jsonb rejects it)
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/** Truncates to `max` UTF-16 units without splitting a surrogate pair; always sanitized. */
export function capText(value: string | null | undefined, max: number): { value: string; truncated: boolean } {
  const v = value || '';
  if (v.length <= max) return { value: sanitizeText(v), truncated: false };
  let end = max;
  const code = v.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return { value: sanitizeText(v.slice(0, end)), truncated: true };
}

/**
 * Fallback plain text when a reply has HTML only. Input is capped and every
 * pattern is linear-time, so hostile HTML cannot stall the webhook.
 */
export function htmlToPlainText(html: string): string {
  return html
    .slice(0, MAX_HTML_CHARS)
    .replace(/<(style|script|head)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^<>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Jane Doe <Jane@Acme.com>" → "jane@acme.com" */
export function extractEmailAddress(value: string | null | undefined): string {
  const raw = (value || '').trim();
  const angle = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = angle ? angle[1] : raw.match(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/)?.[0] || raw;
  return candidate.trim().toLowerCase();
}

/** Ensures the RFC 5322 `<id@host>` form used by In-Reply-To / References. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  if (!v) return null;
  return v.startsWith('<') && v.endsWith('>') ? v : `<${v.replace(/^<|>$/g, '')}>`;
}

export type HeaderBag = Record<string, unknown> | { name?: unknown; value?: unknown }[] | null | undefined;

/** Case-insensitive header lookup; accepts an object map (documented) or a [{ name, value }] list. */
export function getHeader(headers: HeaderBag, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  const entries: [string, unknown][] = Array.isArray(headers)
    ? headers.map((h) => [String(h?.name ?? ''), h?.value])
    : Object.entries(headers);
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value.map(String).join(' ');
    if (value === null || value === undefined) return null;
    return String(value);
  }
  return null;
}

export function parseMessageIds(value: string | null): string[] {
  if (!value) return [];
  const bracketed = value.match(/<[^<>\s]+>/g);
  if (bracketed && bracketed.length > 0) return bracketed;
  return value
    .split(/\s+/)
    .map((v) => normalizeMessageId(v))
    .filter((v): v is string => Boolean(v));
}

/** In-Reply-To first, then References newest → oldest (de-duplicated). */
export function extractReferenceIds(headers: HeaderBag): string[] {
  const inReplyTo = parseMessageIds(getHeader(headers, 'in-reply-to'));
  const references = parseMessageIds(getHeader(headers, 'references')).reverse();
  return Array.from(new Set([...inReplyTo, ...references])).slice(0, 25);
}

/** RFC 3834 + common vendor headers for out-of-office / auto responders. */
export function isAutoReply(headers: HeaderBag, subject?: string): boolean {
  const autoSubmitted = (getHeader(headers, 'auto-submitted') || '').trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (getHeader(headers, 'x-autoreply') || getHeader(headers, 'x-autorespond')) return true;
  const precedence = (getHeader(headers, 'precedence') || '').trim().toLowerCase();
  if (['auto_reply', 'bulk', 'junk'].includes(precedence)) return true;
  return /^\s*(auto(matic)?[\s-]?reply|out of (the )?office|autoreply)\b/i.test(subject || '');
}

/** "a.com, B.com" → ['a.com', 'b.com']; falls back to the Toolbit domains. */
export function parseOwnDomains(raw: string | null | undefined): string[] {
  const list = (raw || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_OWN_EMAIL_DOMAINS;
}

export function isOwnAddress(email: string, ownDomains: string[]): boolean {
  const domain = email.split('@')[1] || '';
  return ownDomains.includes(domain);
}

export function toIso(value: string | null | undefined): string {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
}
