/**
 * Resend webhook → marketing_outreach_leads.conversation_history
 *
 * Runtime-agnostic request handler used by the `resend-webhook` Edge Function.
 * All platform pieces (signature verifier, Supabase RPC, fetch, secrets) are
 * injected, so the same code runs in Deno (production) and in Node tests.
 *
 * Events (https://resend.com/docs/webhooks/event-types):
 *   email.sent / delivered / delivery_delayed / bounced / failed / suppressed
 *       → delivery status + Message-ID on the stored outbound message
 *         (rpc marketing_update_outbound_statuses; lead → 'emailed' on first delivery)
 *   email.received
 *       → GET /emails/receiving/:id, stored in the matching lead thread
 *         (rpc marketing_ingest_inbound_email; lead → 'replied' on first real reply)
 *
 * Responses:
 *   400 missing/invalid signature or JSON · 405 non-POST · 413 payload too large
 *   500 misconfiguration or transient failure → Resend retries (all writes are idempotent)
 *   503 outreach email not recorded yet (send/record race) → Resend retries in ~5s
 *   200 everything else, incl. data that can never be stored (logged, not retried)
 */

import {
  DEFAULT_OWN_EMAIL_DOMAINS,
  MAX_HTML_CHARS,
  MAX_TEXT_CHARS,
  OUTREACH_TAG_NAME,
  OUTREACH_TAG_VALUE,
  capText,
  extractEmailAddress,
  extractReferenceIds,
  getHeader,
  htmlToPlainText,
  isAutoReply,
  isOwnAddress,
  normalizeMessageId,
  parseMessageIds,
  sanitizeText,
  toIso,
  type HeaderBag,
} from './email-utils.ts';
import { fetchReceivedEmail, type ResendReceivedAttachment, type ResendReceivedEmail } from './resend-api.ts';

// Resend webhook payloads are metadata only (bodies are fetched via the API), so they are small.
export const MAX_BODY_BYTES = 256 * 1024;

/** How long to keep asking Resend to retry a delivery event whose send is not recorded yet. */
const RECORD_RACE_WINDOW_MS = 10 * 60 * 1000;

type ConversationStatus = 'sent' | 'delivered' | 'bounced' | 'failed';

const STATUS_BY_EVENT: Record<string, ConversationStatus> = {
  'email.sent': 'sent',
  'email.delivery_delayed': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.failed': 'failed',
  'email.suppressed': 'failed',
};

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

export type RpcFn = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export type SignatureVerifier = (payload: string, headers: Record<string, string>) => void;

export interface ResendWebhookDeps {
  /** RESEND_WEBHOOK_SECRET (whsec_…). */
  webhookSecret?: string;
  /** Full-access Resend API key (needed to read received emails). */
  resendApiKey?: string;
  /** Must throw for a malformed secret; the returned verifier must throw for an invalid signature. */
  createVerifier: (secret: string) => SignatureVerifier;
  /** Supabase RPC with a service-role / secret key client; null when Supabase is not configured. */
  rpc: RpcFn | null;
  fetchImpl?: typeof fetch;
  ownDomains?: string[];
  logger?: Pick<Console, 'error' | 'warn'>;
  now?: () => number;
}

export interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string> | { name: string; value: string }[];
    attachments?: Partial<ResendReceivedAttachment>[];
    bounce?: { message?: string; type?: string; subType?: string; diagnosticCode?: string[] };
    failed?: { reason?: string };
    suppressed?: { message?: string; type?: string };
    [key: string]: unknown;
  };
}

export interface WebhookOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

/** Transient failure: answer 5xx so Resend retries. */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

/** Fails identically on every retry (bad data / own validation): answer 200 and log. */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/** Postgres class 22 (data exception) and P0001 (RAISE EXCEPTION) never succeed on retry. */
function toStoreError(context: string, error: { message?: string; code?: string }): Error {
  const code = String(error?.code || '');
  const message = `${context}: ${error?.message || 'unknown error'}${code ? ` (${code})` : ''}`;
  return code.startsWith('22') || code === 'P0001' ? new NonRetryableError(message) : new RetryableError(message);
}

interface EventContext {
  rpc: RpcFn;
  resendApiKey?: string;
  fetchImpl?: typeof fetch;
  ownDomains: string[];
  now: () => number;
}

// ────────────────────────────────────────────────────────────────────────────
// Outbound delivery status
// ────────────────────────────────────────────────────────────────────────────

async function applyOutboundStatus(
  ctx: EventContext,
  update: { resendEmailId: string; status: ConversationStatus; messageId?: string | null; recipient?: string | null; error?: string | null }
): Promise<number> {
  const { data, error } = await ctx.rpc('marketing_update_outbound_statuses', {
    p_updates: [
      {
        resend_email_id: update.resendEmailId,
        status: update.status,
        message_id: normalizeMessageId(sanitizeText(update.messageId)),
        recipient: update.recipient ? extractEmailAddress(update.recipient) : null,
        error: update.error ? capText(update.error, 500).value : null,
      },
    ],
  });
  if (error) throw toStoreError('marketing_update_outbound_statuses failed', error);
  return typeof data === 'number' ? data : 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Inbound replies
// ────────────────────────────────────────────────────────────────────────────

interface ReceivedEmailMeta {
  from?: string;
  to?: string[];
  subject?: string;
  created_at?: string;
  message_id?: string;
  attachments?: Partial<ResendReceivedAttachment>[];
}

export type IngestStatus = 'processed' | 'duplicate' | 'unmatched' | 'ignored' | 'not_found';

function buildInboundMessage(email: ResendReceivedEmail, meta: ReceivedEmailMeta) {
  const headers = (email.headers || null) as HeaderBag;
  // htmlToPlainText caps its input itself; everything stored is sanitized for jsonb
  const rawText = email.text || (email.html ? htmlToPlainText(email.html) : '');
  const text = capText(rawText, MAX_TEXT_CHARS);
  const html = capText(email.html, MAX_HTML_CHARS);
  const subject = capText(email.subject ?? meta.subject ?? '', 1000).value;
  const displayFrom = capText(getHeader(headers, 'from') || email.from || meta.from || '', 500).value;
  const attachments = (email.attachments || meta.attachments || [])
    .filter((a) => a && a.id)
    .slice(0, 50)
    .map((a) => ({
      id: String(a.id),
      filename: a.filename ? capText(a.filename, 300).value : null,
      content_type: a.content_type ? capText(a.content_type, 200).value : null,
      size: typeof a.size === 'number' ? a.size : null,
    }));
  const inReplyTo = parseMessageIds(getHeader(headers, 'in-reply-to'))[0];

  const message = {
    message_id: normalizeMessageId(sanitizeText(email.message_id || meta.message_id)),
    in_reply_to: inReplyTo ? sanitizeText(inReplyTo) : null,
    timestamp: toIso(email.created_at || meta.created_at),
    subject,
    from: displayFrom,
    to: capText((email.to || meta.to || []).join(', '), 1000).value,
    body_text: text.value,
    body_html: html.value,
    attachments,
    is_auto_reply: isAutoReply(headers, subject),
    truncated: text.truncated || html.truncated || undefined,
  };

  return { message, references: extractReferenceIds(headers).map((r) => sanitizeText(r)) };
}

async function ingestReceivedEmail(
  ctx: EventContext,
  emailId: string,
  meta: ReceivedEmailMeta
): Promise<{ status: IngestStatus; leadStatusChanged: boolean }> {
  const senderFromMeta = extractEmailAddress(meta.from);
  if (senderFromMeta && isOwnAddress(senderFromMeta, ctx.ownDomains)) {
    return { status: 'ignored', leadStatusChanged: false }; // our own mail (BCC copies, internal forwards)
  }

  if (!ctx.resendApiKey) {
    // Configuration problem: retry once the secret is set
    throw new RetryableError('RESEND_API_KEY is not configured for the Edge Function.');
  }

  const res = await fetchReceivedEmail(emailId, { apiKey: ctx.resendApiKey, fetchImpl: ctx.fetchImpl });
  if (!res.ok || !res.data) {
    if (res.status === 404) return { status: 'not_found', leadStatusChanged: false };
    throw new RetryableError(`Resend GET /emails/receiving/${emailId} failed: ${res.error || res.status}`);
  }

  const email = res.data;
  const sender = extractEmailAddress(email.from || meta.from);
  if (!sender) return { status: 'unmatched', leadStatusChanged: false };
  if (isOwnAddress(sender, ctx.ownDomains)) return { status: 'ignored', leadStatusChanged: false };

  const { message, references } = buildInboundMessage(email, meta);
  const { data, error } = await ctx.rpc('marketing_ingest_inbound_email', {
    p_resend_email_id: emailId,
    p_from_email: sender,
    p_reference_ids: references,
    p_message: message,
  });
  if (error) throw toStoreError('marketing_ingest_inbound_email failed', error);

  const result = (data || {}) as { status?: string; lead_status_changed?: boolean };
  const status: IngestStatus =
    result.status === 'processed' || result.status === 'duplicate' ? result.status : 'unmatched';
  return { status, leadStatusChanged: Boolean(result.lead_status_changed) };
}

// ────────────────────────────────────────────────────────────────────────────
// Event routing
// ────────────────────────────────────────────────────────────────────────────

function hasOutreachTag(tags: NonNullable<ResendWebhookEvent['data']>['tags']): boolean {
  if (!tags) return false;
  if (Array.isArray(tags)) {
    return tags.some((t) => t?.name === OUTREACH_TAG_NAME && t?.value === OUTREACH_TAG_VALUE);
  }
  return tags[OUTREACH_TAG_NAME] === OUTREACH_TAG_VALUE;
}

function describeFailure(event: ResendWebhookEvent): string | null {
  const d = event.data || {};
  switch (event.type) {
    case 'email.bounced':
      return d.bounce?.message || d.bounce?.diagnosticCode?.[0] || 'Bounced';
    case 'email.failed':
      return d.failed?.reason || 'Failed to send';
    case 'email.suppressed':
      return d.suppressed?.message || 'Recipient is on the suppression list';
    default:
      return null;
  }
}

export async function handleResendWebhookEvent(event: ResendWebhookEvent, ctx: EventContext): Promise<WebhookOutcome> {
  const type = event?.type || '';
  const data = event?.data || {};
  const emailId = typeof data.email_id === 'string' ? data.email_id : '';

  if (!emailId) {
    return { httpStatus: 200, body: { ok: true, ignored: 'no email_id' } };
  }

  // ── Inbound reply ──
  if (type === 'email.received') {
    const result = await ingestReceivedEmail(ctx, emailId, {
      from: data.from,
      to: Array.isArray(data.to) ? data.to : undefined,
      subject: data.subject,
      created_at: data.created_at,
      message_id: data.message_id,
      attachments: Array.isArray(data.attachments) ? data.attachments : undefined,
    });
    return {
      httpStatus: 200,
      body: { ok: true, type, result: result.status, leadStatusChanged: result.leadStatusChanged },
    };
  }

  // ── Delivery status for an outbound email ──
  const status = STATUS_BY_EVENT[type];
  if (!status) {
    return { httpStatus: 200, body: { ok: true, ignored: type || 'unknown event' } };
  }

  const matchedLeads = await applyOutboundStatus(ctx, {
    resendEmailId: emailId,
    status,
    messageId: data.message_id,
    recipient: Array.isArray(data.to) ? data.to[0] : null,
    error: describeFailure(event),
  });

  // The webhook can beat the admin app's outbound logging by a few milliseconds. For our
  // own outreach emails ask Resend to retry (next attempt ~5s later) instead of losing
  // the Message-ID that reply matching depends on.
  const createdMs = Date.parse(data.created_at || event.created_at || '');
  const isRecent = !Number.isNaN(createdMs) && ctx.now() - createdMs < RECORD_RACE_WINDOW_MS;
  if (matchedLeads === 0 && hasOutreachTag(data.tags) && isRecent) {
    return { httpStatus: 503, body: { ok: false, retry: 'outbound message not recorded yet' } };
  }

  return { httpStatus: 200, body: { ok: true, type, matched: matchedLeads > 0 } };
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ────────────────────────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function createResendWebhookHandler(deps: ResendWebhookDeps): (req: Request) => Promise<Response> {
  const log = deps.logger ?? console;
  const ownDomains = deps.ownDomains && deps.ownDomains.length > 0 ? deps.ownDomains : DEFAULT_OWN_EMAIL_DOMAINS;
  const now = deps.now ?? (() => Date.now());
  let verifier: SignatureVerifier | null = null;

  return async function handleResendWebhook(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    const secret = deps.webhookSecret;
    if (!secret || !deps.rpc) {
      log.error('resend-webhook: RESEND_WEBHOOK_SECRET or Supabase credentials are not configured.');
      return json({ error: 'Webhook not configured' }, 500);
    }

    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
      return json({ error: 'Missing signature headers' }, 400);
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413);
    }

    // Raw body is required: re-serialized JSON would break the signature.
    const payload = await req.text();
    if (payload.length > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413);
    }

    if (!verifier) {
      try {
        verifier = deps.createVerifier(secret);
      } catch {
        // Malformed secret is a configuration problem, not a bad request
        log.error('resend-webhook: RESEND_WEBHOOK_SECRET is malformed (expected whsec_…).');
        return json({ error: 'Webhook not configured' }, 500);
      }
    }

    try {
      // Throws on a bad signature or a stale timestamp (replay protection)
      verifier(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      return json({ error: 'Invalid signature' }, 400);
    }

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(payload) as ResendWebhookEvent;
    } catch {
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    try {
      const outcome = await handleResendWebhookEvent(event, {
        rpc: deps.rpc,
        resendApiKey: deps.resendApiKey,
        fetchImpl: deps.fetchImpl,
        ownDomains,
        now,
      });
      return json(outcome.body, outcome.httpStatus);
    } catch (err) {
      const retryable = !(err instanceof NonRetryableError);
      // Log identifiers only (no email content / addresses).
      log.error('resend-webhook: processing failed', {
        svixId,
        type: event?.type,
        emailId: event?.data?.email_id,
        retryable,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!retryable) {
        // Would fail identically on every retry: acknowledge so Resend stops, keep the log.
        return json({ ok: false, dropped: true }, 200);
      }
      return json({ error: 'Processing failed' }, 500);
    }
  };
}
