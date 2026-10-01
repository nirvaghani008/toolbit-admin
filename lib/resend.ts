/**
 * Resend HTTP API wrapper — server-only module.
 *
 * Uses the Resend REST API directly (https://api.resend.com)
 * to send marketing emails and fetch live sent email history
 * without adding heavy dependencies.
 *
 * NEVER import this file from client components — the RESEND_API_KEY
 * must remain server-side only.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendSendOptions {
  from: string; // e.g. "Toolbit AI <team@mail.toolbit.ai>"
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  bcc?: string | string[];
  cc?: string | string[];
  /**
   * Resend email tags (echoed back in webhook payloads as `data.tags`).
   * Name/value: ASCII letters, numbers, `_` or `-`, max 256 chars.
   */
  tags?: { name: string; value: string }[];
}

export interface ResendSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ResendEmailListItem {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  last_event: 'delivered' | 'sent' | 'bounced' | 'complained' | 'delivery_delayed' | 'opened' | 'clicked' | string;
  bcc?: string[] | null;
  cc?: string[] | null;
  reply_to?: string[] | null;
  message_id?: string;
}

export interface ResendEmailDetails extends ResendEmailListItem {
  html?: string | null;
  text?: string | null;
}

/**
 * Helper to parse, sanitize, and deduplicate email addresses.
 * Removes empty values and optionally excludes primary recipient addresses.
 */
export function sanitizeEmailList(
  input?: string | string[] | null,
  exclude?: string | string[] | null
): string[] | undefined {
  if (!input) return undefined;

  const rawList = Array.isArray(input)
    ? input
    : input.split(/[,;\n]+/).map((s) => s.trim());

  const excludeSet = new Set<string>();
  if (exclude) {
    const rawExclude = Array.isArray(exclude)
      ? exclude
      : exclude.split(/[,;\n]+/).map((s) => s.trim());
    rawExclude.forEach((e) => {
      if (e) excludeSet.add(e.toLowerCase());
    });
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of rawList) {
    const email = item.trim();
    if (!email || !email.includes('@')) continue;
    const lower = email.toLowerCase();
    if (excludeSet.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    sanitized.push(email);
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Resolves the effective BCC recipient:
 * 1. Explicit BCC passed in the request takes precedence.
 * 2. If no explicit BCC is provided and ENABLE_DEFAULT_BCC is not 'false'/'0', falls back to DEFAULT_BCC_EMAIL.
 * 3. Returns undefined if disabled or unconfigured.
 */
export function resolveEffectiveBcc(
  explicitBcc?: string | string[] | null
): string | string[] | undefined {
  if (explicitBcc) return explicitBcc;

  const isBccEnabled =
    process.env.ENABLE_DEFAULT_BCC !== 'false' &&
    process.env.ENABLE_DEFAULT_BCC !== '0';

  if (isBccEnabled && process.env.DEFAULT_BCC_EMAIL) {
    const defaultEmail = process.env.DEFAULT_BCC_EMAIL.trim();
    if (defaultEmail) return defaultEmail;
  }

  return undefined;
}

/**
 * Validates that the RESEND_API_KEY environment variable is configured.
 */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Sends an email via the Resend REST API.
 */
export async function sendResendEmail(options: ResendSendOptions): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured. Please set it in your environment variables.',
    };
  }

  try {
    const toList = Array.isArray(options.to) ? options.to : [options.to];
    const sanitizedBcc = sanitizeEmailList(options.bcc, toList);
    const sanitizedCc = sanitizeEmailList(options.cc, toList);
    const normalizedFrom = (options.from || '').replace(/^Toolbit Team\b/i, 'Toolbit AI');

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: normalizedFrom,
        to: toList,
        subject: options.subject,
        html: options.html,
        text: options.text || undefined,
        reply_to: options.reply_to || undefined,
        bcc: sanitizedBcc,
        cc: sanitizedCc,
        tags: options.tags && options.tags.length > 0 ? options.tags : undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg =
        data?.message ||
        data?.error?.message ||
        `Resend API error: ${response.status} ${response.statusText}`;
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: data.id || undefined,
    };
  } catch (err: any) {
    console.error('Resend API request failed:', err);
    return {
      success: false,
      error: err?.message || 'Failed to send email via Resend. Please check your configuration.',
    };
  }
}

/**
 * Retrieves the list of sent emails directly from Resend API (Option A).
 */
export async function listResendEmails(): Promise<{
  success: boolean;
  data?: ResendEmailListItem[];
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured.',
    };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg =
        data?.message ||
        data?.error?.message ||
        `Resend API error: ${response.status} ${response.statusText}`;
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      data: Array.isArray(data?.data) ? data.data : [],
    };
  } catch (err: any) {
    console.error('listResendEmails error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch email list from Resend.',
    };
  }
}

/**
 * Retrieves full details of a specific sent email by ID from Resend.
 */
export async function getResendEmail(emailId: string): Promise<{
  success: boolean;
  data?: ResendEmailDetails;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured.',
    };
  }

  try {
    const response = await fetch(`${RESEND_API_URL}/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg =
        data?.message ||
        data?.error?.message ||
        `Resend API error: ${response.status} ${response.statusText}`;
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    console.error('getResendEmail error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve email from Resend.',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Receiving API helpers ("Received" history view in the admin app).
// The Supabase Edge Function `resend-webhook` has its own client in
// supabase/functions/_shared/resend-api.ts.
// Docs: https://resend.com/docs/api-reference/emails/list-received-emails
//       https://resend.com/docs/api-reference/emails/retrieve-received-email
// ────────────────────────────────────────────────────────────────────────────

const RESEND_RECEIVING_URL = `${RESEND_API_URL}/receiving`;
const MAX_429_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 3000;

export interface ResendListParams {
  /** 1–100 (Resend maximum). */
  limit?: number;
  /** Cursor: return items after this id (older). Cannot be combined with `before`. */
  after?: string;
  /** Cursor: return items before this id (newer). Cannot be combined with `after`. */
  before?: string;
}

export interface ResendListPage<T> {
  success: boolean;
  data?: T[];
  hasMore?: boolean;
  error?: string;
  status?: number;
}

export interface ResendReceivedAttachment {
  id: string;
  filename: string | null;
  content_type: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
  size: number | null;
}

export interface ResendReceivedEmailListItem {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  bcc?: string[] | null;
  cc?: string[] | null;
  reply_to?: string[] | null;
  message_id?: string | null;
  attachments?: ResendReceivedAttachment[];
}

export interface ResendReceivedEmail extends ResendReceivedEmailListItem {
  html?: string | null;
  html_format?: 'data_uri' | 'cid';
  text?: string | null;
  headers?: Record<string, unknown> | null;
  received_for?: string[];
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
}

function buildListQuery(params?: ResendListParams): string {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(Math.min(100, Math.max(1, Math.floor(params.limit)))));
  if (params?.after) qs.set('after', params.after);
  else if (params?.before) qs.set('before', params.before);
  const str = qs.toString();
  return str ? `?${str}` : '';
}

/**
 * GET helper with bounded retry on 429 (Resend default limit: 10 req/s per team),
 * honoring the `retry-after` response header.
 */
async function resendGetJson(url: string): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, data: null, error: 'RESEND_API_KEY is not configured.' };
  }

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      const retryAfterSec = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, MAX_RETRY_WAIT_MS)
        : 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg =
        data?.message ||
        data?.error?.message ||
        `Resend API error: ${response.status} ${response.statusText}`;
      return { ok: false, status: response.status, data, error: errorMsg };
    }
    return { ok: true, status: response.status, data };
  }
}

/**
 * One page of received (inbound) emails. Metadata only: no body, no headers.
 */
export async function listReceivedEmails(
  params: ResendListParams = { limit: 100 }
): Promise<ResendListPage<ResendReceivedEmailListItem>> {
  try {
    const res = await resendGetJson(`${RESEND_RECEIVING_URL}${buildListQuery(params)}`);
    if (!res.ok) return { success: false, error: res.error, status: res.status };
    return {
      success: true,
      data: Array.isArray(res.data?.data) ? res.data.data : [],
      hasMore: Boolean(res.data?.has_more),
    };
  } catch (err: any) {
    console.error('listReceivedEmails error:', err);
    return { success: false, error: err?.message || 'Failed to list received emails from Resend.' };
  }
}

/**
 * Full received email (html, text, headers, attachments metadata).
 * Defaults to `html_format=cid` so inline images stay as `cid:` references
 * instead of large base64 data URIs.
 */
export async function getReceivedEmail(
  emailId: string,
  options: { htmlFormat?: 'cid' | 'data_uri' } = {}
): Promise<{ success: boolean; data?: ResendReceivedEmail; error?: string; status?: number }> {
  try {
    const htmlFormat = options.htmlFormat || 'cid';
    const res = await resendGetJson(
      `${RESEND_RECEIVING_URL}/${encodeURIComponent(emailId)}?html_format=${htmlFormat}`
    );
    if (!res.ok) return { success: false, error: res.error, status: res.status };
    return { success: true, data: res.data as ResendReceivedEmail };
  } catch (err: any) {
    console.error('getReceivedEmail error:', err);
    return { success: false, error: err?.message || 'Failed to retrieve received email from Resend.' };
  }
}
