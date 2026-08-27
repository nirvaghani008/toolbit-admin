/**
 * Toolbit Contact Response Email Template
 *
 * Aligned with the frontend email template architecture from toolbit/utils/email.ts.
 * Uses official Toolbit branding, Figtree font styling, and dual HTML + plain-text fallback.
 */

export interface ContactReplyTemplateParams {
  userName: string;
  userEmail: string;
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  submittedAt?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Escapes unsafe HTML characters to prevent XSS injections in email clients.
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats subject line ensuring consistent ending with "- Toolbit.ai" and removing redundant tags.
 */
export function formatEmailSubjectWithBrand(subject?: string | null): string {
  if (!subject) return 'Toolbit.ai';
  let clean = String(subject).replace(/[\r\n]+/g, ' ').trim();
  // Strip redundant inline "on Toolbit" / "at Toolbit"
  clean = clean.replace(/\s*(?:on|at|for|to)\s+toolbit(?:\.ai)?(?:\s*!*)?/gi, '');
  // Strip existing trailing Toolbit tags
  clean = clean.replace(/\s*[-–—|]\s*toolbit(?:\.ai)?\s*$/i, '').trim();

  const isReply = clean.toLowerCase().startsWith('re:');
  const base = isReply ? clean : `Re: ${clean}`;
  return `${base} - Toolbit.ai`;
}

/**
 * Converts plain text reply into clean HTML paragraphs with preserved line breaks.
 */
function formatReplyHtml(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs
    .map((para) => {
      const escaped = escapeHtml(para.trim()).replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #18181b;">${escaped}</p>`;
    })
    .join('');
}

/**
 * Generates the branded Toolbit contact response email matching toolbit/utils/email.ts.
 */
export function generateContactReplyEmail(params: ContactReplyTemplateParams): RenderedEmail {
  const {
    userName,
    originalSubject,
    originalMessage,
    replyMessage,
    submittedAt,
  } = params;

  const safeName = escapeHtml(userName || 'there');
  const safeSubject = escapeHtml(originalSubject || 'Your inquiry');
  const safeOriginalMessage = escapeHtml(originalMessage || '').replace(/\n/g, '<br />');
  const formattedReplyHtml = formatReplyHtml(replyMessage);

  const formattedDate = submittedAt
    ? new Date(submittedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : null;

  const emailSubject = formatEmailSubjectWithBrand(originalSubject);

  // --------------------------------------------------------------------------
  // HTML Template (Aligned with toolbit/utils/email.ts)
  // --------------------------------------------------------------------------
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(emailSubject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800;900&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #f9f8f6;
      font-family: 'Figtree', 'Figtree Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #18181b;
      line-height: 1.5;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f9f8f6; font-family: 'Figtree', 'Figtree Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9f8f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e2db;">
          
          <!-- Standard Toolbit Header -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; background-color: #fcfbfa; border-bottom: 1px solid #f4f4f5; text-align: left;">
              <a href="https://www.toolbit.ai/" style="text-decoration: none; display: inline-block;">
                <img src="https://www.toolbit.ai/logo-icon.png" alt="Toolbit.ai Logo" width="28" height="28" style="display: inline-block; vertical-align: middle; margin-right: 8px; width: 28px; height: 28px; border: 0;" />
                <span style="display: inline-block; vertical-align: middle; font-size: 20px; font-weight: 750; letter-spacing: -0.8px; color: #0d9488;">Toolbit.ai</span>
              </a>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px;">
              <!-- Personalized Greeting -->
              <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #18181b;">
                Hi ${safeName},
              </p>

              <!-- Standard Courteous Acknowledgment -->
              <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #52525b;">
                Thank you for reaching out!
              </p>

              <!-- Admin Response Message -->
              <div style="color: #18181b; margin-top: 16px;">
                ${formattedReplyHtml}
              </div>

              <!-- Sign-off -->
              <p style="margin: 28px 0 0 0; font-size: 14px; line-height: 1.5; color: #52525b;">
                Best regards,<br>
                <strong style="color: #18181b;">The Toolbit AI Team</strong><br>
                <a href="https://www.toolbit.ai" style="color: #0d9488; font-size: 13px; text-decoration: none; font-weight: 600;">toolbit.ai</a>
              </p>

              <!-- Quoted Original Inquiry (info-box style) -->
              <div style="background-color: #f4f4f5; border-left: 2px solid #18181b; padding: 16px 20px; margin: 28px 0 0 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.8px;">
                  In Reference to Your Message ${formattedDate ? `(${formattedDate})` : ''}
                </p>
                <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #18181b;">
                  Subject: ${safeSubject}
                </p>
                <div style="font-size: 13px; line-height: 1.6; color: #52525b; font-style: italic;">
                  &ldquo;${safeOriginalMessage}&rdquo;
                </div>
              </div>
            </td>
          </tr>

          <!-- Standard Toolbit Footer -->
          <tr>
            <td style="padding: 32px; background-color: #fcfbfa; border-top: 1px solid #f4f4f5; text-align: center;">
              <p style="margin: 0 0 12px 0; color: #a1a1aa; font-size: 12px; line-height: 1.5;">
                This is a response to your inquiry on Toolbit.ai. Have further questions? Reply directly to this email or reach us anytime at
                <a href="mailto:contact@toolbit.ai" style="color: #71717a; text-decoration: underline; font-weight: 600;">contact@toolbit.ai</a>.
              </p>
              <div style="margin-bottom: 16px;">
                <a href="https://www.toolbit.ai/" style="color: #71717a; text-decoration: none; font-weight: 600; font-size: 12px; margin: 0 4px;">Home</a> &middot;
                <a href="https://www.toolbit.ai/contact" style="color: #71717a; text-decoration: none; font-weight: 600; font-size: 12px; margin: 0 4px;">Contact</a>
              </div>
              <p style="margin: 0; color: #d4d4d8; font-size: 11px;">&copy; ${new Date().getFullYear()} Toolbit AI. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // --------------------------------------------------------------------------
  // Plain Text Version (High Deliverability Fallback)
  // --------------------------------------------------------------------------
  const text = `Hi ${userName || 'there'},

Thank you for reaching out to us at Toolbit.

${replyMessage.trim()}

---
Best regards,
The Toolbit Team
https://www.toolbit.ai
contact@toolbit.ai

==================================================
IN REFERENCE TO YOUR MESSAGE ${formattedDate ? `(${formattedDate})` : ''}:
Subject: ${originalSubject}

"${originalMessage}"
==================================================

Have further questions? Reply directly to this email.
© ${new Date().getFullYear()} Toolbit AI. All rights reserved.
`;

  return {
    subject: emailSubject,
    html,
    text,
  };
}
