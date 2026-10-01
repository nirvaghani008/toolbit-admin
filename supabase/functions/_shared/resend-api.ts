/**
 * Minimal Resend Receiving API client for the Edge Function (runtime-agnostic:
 * API key and fetch are passed in, no Deno/Node globals).
 *
 * Docs: https://resend.com/docs/api-reference/emails/retrieve-received-email
 */

const RESEND_RECEIVING_URL = 'https://api.resend.com/emails/receiving';
const MAX_429_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 3000;

export interface ResendReceivedAttachment {
  id: string;
  filename?: string | null;
  content_type?: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
  size?: number | null;
}

export interface ResendReceivedEmail {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string | null;
  created_at?: string;
  message_id?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, unknown> | { name?: unknown; value?: unknown }[] | null;
  attachments?: ResendReceivedAttachment[];
}

export interface ReceivedEmailResult {
  ok: boolean;
  status: number;
  data?: ResendReceivedEmail;
  error?: string;
}

/**
 * GET /emails/receiving/:id?html_format=cid (inline images stay as cid: references).
 * Retries a 429 up to twice, honoring `retry-after` (Resend limit: 10 req/s per team).
 */
export async function fetchReceivedEmail(
  emailId: string,
  options: { apiKey: string; fetchImpl?: typeof fetch }
): Promise<ReceivedEmailResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${RESEND_RECEIVING_URL}/${encodeURIComponent(emailId)}?html_format=cid`;

  for (let attempt = 0; ; attempt++) {
    const response = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    });

    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      const retryAfterSec = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, MAX_RETRY_WAIT_MS) : 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        (body as { message?: string })?.message ||
        (body as { error?: { message?: string } })?.error?.message ||
        `Resend API error: ${response.status} ${response.statusText}`;
      return { ok: false, status: response.status, error: message };
    }
    return { ok: true, status: response.status, data: body as ResendReceivedEmail };
  }
}
