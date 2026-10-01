import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
const port = parseInt(process.env.SMTP_PORT || '465', 10);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
/**
 * Resolves sender address formatted with the official Toolbit brand display name.
 * e.g., "Contact - Toolbit.ai <contact@toolbit.ai>"
 */
function resolveSenderAddress(): string {
  const raw = (process.env.SMTP_FROM_CONTACT || process.env.SMTP_USER || 'contact@toolbit.ai').trim();
  const match = raw.match(/<([^>]+)>/);
  const email = match ? match[1].trim() : raw;
  return `Contact - Toolbit.ai <${email}>`;
}

const defaultFrom = resolveSenderAddress();

/**
 * Validates that all required SMTP environment variables are configured.
 */
export function isSMTPConfigured(): boolean {
  return Boolean(host && port && user && pass);
}

/**
 * Singleton Nodemailer transport instance.
 * Configured with SSL (port 465) and connection pooling for optimal performance.
 */
export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for 465, false for 587/other
  auth: {
    user,
    pass,
  },
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  connectionTimeout: 10000, // 10s connection timeout
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  bcc?: string | string[];
  cc?: string | string[];
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
 * Sends an email using the configured Hostinger SMTP transporter.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  bcc,
  cc,
}: SendMailOptions): Promise<SendMailResult> {
  if (!isSMTPConfigured()) {
    const missing = [
      !host && 'SMTP_HOST',
      !port && 'SMTP_PORT',
      !user && 'SMTP_USER',
      !pass && 'SMTP_PASS',
    ]
      .filter(Boolean)
      .join(', ');
    return {
      success: false,
      error: `SMTP is not configured properly. Missing environment variable(s): ${missing}`,
    };
  }

  try {
    const sanitizedBcc = sanitizeEmailList(bcc, to);
    const sanitizedCc = sanitizeEmailList(cc, to);

    const info = await transporter.sendMail({
      from: defaultFrom,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || defaultFrom,
      bcc: sanitizedBcc,
      cc: sanitizedCc,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error('Error dispatching email via SMTP:', err);
    return {
      success: false,
      error: err?.message || 'Failed to send email. Please check your SMTP configuration.',
    };
  }
}
