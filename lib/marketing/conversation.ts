/**
 * Shared types + pure helpers for marketing_outreach_leads.conversation_history.
 *
 * Shape (see COMMENT ON COLUMN in migration 20260929150000):
 *   [{ email, status, last_message_at, messages: [{ direction, message_id, resend_email_id, status, timestamp, ... }] }]
 *
 * Safe to import from both client and server code (no server-only imports).
 */

export type ConversationDirection = 'outbound' | 'inbound';
export type ConversationStatus = 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
export type ConversationMatchType = 'message_id' | 'thread_email' | 'business_email';

export interface ConversationAttachment {
  id: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
}

export interface ConversationMessage {
  direction: ConversationDirection;
  timestamp: string;
  status?: ConversationStatus;
  message_id?: string | null;
  resend_email_id?: string | null;
  subject?: string;
  from?: string;
  to?: string;
  body_text?: string;
  body_html?: string;
  in_reply_to?: string | null;
  template_id?: string | null;
  attachments?: ConversationAttachment[];
  is_auto_reply?: boolean;
  match_type?: ConversationMatchType;
  truncated?: boolean;
  error?: string | null;
}

export interface ConversationThread {
  email: string;
  status: ConversationStatus;
  last_message_at?: string | null;
  messages: ConversationMessage[];
}

/** Returned by the `conversation_summary` PostgREST computed field. */
export interface ConversationSummary {
  thread_count: number;
  message_count: number;
  outbound_count: number;
  inbound_count: number;
  /** Inbound messages excluding auto-replies (out-of-office, etc.). */
  reply_count: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_direction: ConversationDirection | null;
}

const VALID_STATUSES: ReadonlySet<string> = new Set(['pending', 'sent', 'delivered', 'bounced', 'failed']);

/**
 * Defensive parse of the raw JSONB value into typed threads (tolerates legacy
 * object values and malformed entries without throwing).
 */
export function normalizeConversationHistory(raw: unknown): ConversationThread[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Object.keys(raw as object).length > 0
      ? [raw]
      : [];

  const threads: ConversationThread[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as Record<string, unknown>;
    const email = typeof t.email === 'string' ? t.email : '';
    if (!email) continue;

    const messages = (Array.isArray(t.messages) ? t.messages : [])
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .filter((m) => m.direction === 'outbound' || m.direction === 'inbound')
      .map((m) => m as unknown as ConversationMessage)
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

    const status = typeof t.status === 'string' && VALID_STATUSES.has(t.status)
      ? (t.status as ConversationStatus)
      : 'pending';

    threads.push({
      email,
      status,
      last_message_at: typeof t.last_message_at === 'string' ? t.last_message_at : null,
      messages,
    });
  }

  // Most recently active thread first
  return threads.sort((a, b) =>
    String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''))
  );
}

const QUOTE_MARKERS: RegExp[] = [
  /^On .{4,300}wrote:\s*$/m, // Gmail / Apple Mail (single line)
  /^On .{4,200}\n.{0,200}wrote:\s*$/m, // Gmail when the attribution wraps
  /^-{2,}\s*Original Message\s*-{2,}/im, // Outlook
  /^_{5,}\s*$/m, // Outlook separator line
  /^From:\s.+\n(?:Sent|Date):\s.+/im, // Outlook header block
];

/**
 * Splits a plain-text reply into the new content and the quoted history,
 * so the UI can collapse previously-sent text.
 */
export function splitQuotedReply(text: string): { visible: string; quoted: string } {
  if (!text) return { visible: '', quoted: '' };

  let cut = -1;
  for (const re of QUOTE_MARKERS) {
    const match = re.exec(text);
    if (match && (cut === -1 || match.index < cut)) cut = match.index;
  }

  // Trailing block of "> " quoted lines
  if (cut === -1) {
    const lines = text.split('\n');
    let i = lines.length - 1;
    while (i >= 0 && (lines[i].trim() === '' || lines[i].trimStart().startsWith('>'))) i--;
    const quotedStart = i + 1;
    const hasQuoted = lines.slice(quotedStart).some((l) => l.trimStart().startsWith('>'));
    if (hasQuoted && quotedStart > 0) {
      cut = lines.slice(0, quotedStart).join('\n').length;
    }
  }

  if (cut <= 0) return { visible: text.trim(), quoted: '' };
  return { visible: text.slice(0, cut).trim(), quoted: text.slice(cut).trim() };
}

/** "just now", "5m ago", "3h ago", "2d ago", or a short date for older values. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Full, human-readable timestamp for message headers. */
export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sandbox attributes for iframes that render untrusted email HTML: no scripts, no
 * same-origin access; links may open in a new, un-sandboxed tab.
 */
export const EMAIL_IFRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/**
 * Wraps untrusted email HTML for a sandboxed iframe. The CSP blocks every network
 * fetch (remote images, CSS, fonts = tracking pixels / read receipts) – only inline
 * styles and data: images are rendered.
 */
export function buildSandboxedEmailDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><base target="_blank"><meta name="referrer" content="no-referrer"><style>body{margin:0;padding:16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#18181b;background:#fff;word-break:break-word}img{max-width:100%;height:auto}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e4e4e7;color:#52525b}</style></head><body>${html}</body></html>`;
}
