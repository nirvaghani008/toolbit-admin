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
  from: string; // e.g. "Toolbit Team <team@mail.toolbit.ai>"
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
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
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || undefined,
        reply_to: options.reply_to || undefined,
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
