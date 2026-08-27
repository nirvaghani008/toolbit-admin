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
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
    const info = await transporter.sendMail({
      from: defaultFrom,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || defaultFrom,
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
