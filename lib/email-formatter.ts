/**
 * Utility to convert clean plain text / markdown / rich-text HTML email content
 * into responsive, well-formatted HTML email markup matching Toolbit.ai branding.
 *
 * Designed to exactly match the look and feel of Toolbit transactional templates:
 * - Background: #f9f8f6
 * - Container: #ffffff card with #e4e2db border & 12px radius
 * - Brand Color: #0d9488 (Teal)
 * - Typography: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes a plain-text value for HTML text and (quoted) attribute contexts.
 * Use for untrusted values (e.g. scraped tool names / URLs) inserted into email HTML.
 */
export function escapeHtml(value: string | null | undefined): string {
  return (value || '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Returns the URL if it is an absolute http(s) URL ("foo.ai/x" is treated as https://foo.ai/x),
 * otherwise ''. Prevents javascript:, data: and other schemes from ending up in links.
 */
export function safeHttpUrl(value: string | null | undefined): string {
  let url = (value || '').trim();
  if (!url || /\s/.test(url)) return '';
  if (!/^https?:\/\//i.test(url)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(url)) return '';
    url = `https://${url}`;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

/**
 * Formats a single text line: auto-links URLs and bold text.
 */
export function formatEmailLine(line: string): string {
  // Convert URLs to clickable links with Toolbit teal color
  let result = line.replace(
    /(https?:\/\/[^\s<"']+)/g,
    '<a href="$1" style="color: #0d9488; text-decoration: underline; font-weight: 500;" target="_blank">$1</a>'
  );
  // Convert markdown bold **text** to styled strong (font-weight: 600)
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #18181b; font-weight: 600;">$1</strong>');
  return result;
}

/**
 * Normalizes any email body content (TipTap HTML, raw HTML, or Markdown text)
 * into email-client compliant markup with mandatory inline styles for Gmail / Outlook.
 */
export function normalizeEmailBodyHtml(content: string): string {
  if (!content || !content.trim()) return '';

  const text = content.trim();

  // If it's pure markdown / plain text (no HTML tags like <p>, <div>, <br>)
  if (!/<(p|div|br|ul|ol|li|table|h[1-6])\b/i.test(text)) {
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs
      .map((para) => {
        const lines = para.trim().split('\n');

        // Check if paragraph is an ordered list (1. / 2.)
        if (lines.length > 0 && lines.every((l) => /^\d+[\.\)]\s+/.test(l.trim()))) {
          const items = lines
            .map((l) => `<li style="margin-bottom: 8px; list-style-type: decimal !important; display: list-item !important;">${formatEmailLine(l.replace(/^\d+[\.\)]\s+/, ''))}</li>`)
            .join('');
          return `<ol style="margin: 0 0 20px 0; padding-left: 24px; line-height: 1.65; color: #3f3f46; font-size: 15px; list-style-type: decimal !important; list-style: decimal outside !important;">${items}</ol>`;
        }

        // Check if paragraph is an unordered list (• / - / *)
        if (lines.length > 0 && lines.every((l) => /^[\-\*•]\s+/.test(l.trim()))) {
          const items = lines
            .map((l) => `<li style="margin-bottom: 8px; list-style-type: disc !important; display: list-item !important;">${formatEmailLine(l.replace(/^[\-\*•]\s+/, ''))}</li>`)
            .join('');
          return `<ul style="margin: 0 0 20px 0; padding-left: 24px; line-height: 1.65; color: #3f3f46; font-size: 15px; list-style-type: disc !important; list-style: disc outside !important;">${items}</ul>`;
        }

        // Check if signature block (starts with Best regards, Regards, Thanks, etc.)
        if (/^(Best regards|Regards|Thanks|Warm regards|Sincerely),?/i.test(lines[0])) {
          const formattedLines = lines.map((l) => formatEmailLine(l)).join('<br style="line-height: 1.65;" />');
          return `<div style="margin: 24px 0 0 0; line-height: 1.65; color: #3f3f46; font-size: 15px;">${formattedLines}</div>`;
        }

        // Regular paragraph
        const formattedLines = lines.map((l) => formatEmailLine(l)).join('<br style="line-height: 1.65;" />');
        return `<p style="margin: 0 0 18px 0; line-height: 1.65; color: #3f3f46; font-size: 15px;">${formattedLines}</p>`;
      })
      .join('');
  }

  // If it contains HTML (e.g. from TipTap editor or generated templates)
  let formattedHtml = text;

  // Remove any legacy border-top / divider line from closing regards
  formattedHtml = formattedHtml.replace(/border-top:\s*1px\s+solid\s+#[a-zA-Z0-9]+;?/gi, '');
  formattedHtml = formattedHtml.replace(/padding-top:\s*18px;?/gi, '');

  // Convert remaining markdown bold **text** to styled strong (font-weight: 600)
  formattedHtml = formattedHtml.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #18181b; font-weight: 600;">$1</strong>');

  // Convert raw URLs not inside href or tags into styled links
  formattedHtml = formattedHtml.replace(
    /(?<!href=["'])(https?:\/\/[^\s<"']+)/gi,
    '<a href="$1" style="color: #0d9488; text-decoration: underline; font-weight: 500;" target="_blank">$1</a>'
  );

  // Merge inline styles on <p> so text-align, font-size, etc. from TipTap are preserved
  formattedHtml = formattedHtml.replace(/<p(\s+[^>]*)?>/gi, (match, attrs) => {
    if (!attrs) {
      return '<p style="margin: 0 0 18px 0; line-height: 1.65; color: #3f3f46; font-size: 15px;">';
    }
    const styleMatch = attrs.match(/style=["']([^"']*)["']/i);
    if (styleMatch) {
      const existingStyle = styleMatch[1];
      const mergedStyle = `margin: 0 0 18px 0; line-height: 1.65; color: #3f3f46; font-size: 15px; ${existingStyle}`;
      return `<p ${attrs.replace(/style=["'][^"']*["']/i, `style="${mergedStyle}"`)}>`;
    }
    return `<p style="margin: 0 0 18px 0; line-height: 1.65; color: #3f3f46; font-size: 15px;" ${attrs}>`;
  });

  // Apply explicit inline styles to strong, a, ul, ol, li if not already styled (font-weight: 600)
  formattedHtml = formattedHtml
    .replace(/<strong(?:\s+[^>]*)?>/gi, '<strong style="color: #18181b; font-weight: 600;">')
    .replace(/<a\s+(?!style=)/gi, '<a style="color: #0d9488; text-decoration: underline; font-weight: 500;" ')
    .replace(/<ul(?:\s+[^>]*)?>/gi, '<ul style="margin: 0 0 20px 0; padding-left: 24px; line-height: 1.65; color: #3f3f46; font-size: 15px; list-style-type: disc !important; list-style: disc outside !important;">')
    .replace(/<ol(?:\s+[^>]*)?>/gi, '<ol style="margin: 0 0 20px 0; padding-left: 24px; line-height: 1.65; color: #3f3f46; font-size: 15px; list-style-type: decimal !important; list-style: decimal outside !important;">')
    .replace(/<li(?:\s+[^>]*)?>/gi, '<li style="margin-bottom: 8px; line-height: 1.65; list-style-type: inherit !important; display: list-item !important;">');

  return formattedHtml;
}

/**
 * Wraps rich inner HTML (from TipTap or custom WYSIWYG) inside the standard Toolbit email envelope.
 */
export function htmlBodyToFullEmailHtml(innerHtml: string): string {
  if (!innerHtml || !innerHtml.trim()) return '';

  const trimmed = innerHtml.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    // If full HTML, clean divider lines and center footer
    let cleaned = trimmed.replace(/border-top:\s*1px\s+solid\s+#[a-zA-Z0-9]+;?/gi, '');
    cleaned = cleaned.replace(/padding-top:\s*18px;?/gi, '');
    return cleaned;
  }

  const normalizedBody = normalizeEmailBodyHtml(trimmed);
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f9f8f6; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    p { margin: 0 0 18px 0 !important; line-height: 1.65 !important; color: #3f3f46 !important; font-size: 15px !important; }
    strong { color: #18181b !important; font-weight: 600 !important; }
    a { color: #0d9488 !important; text-decoration: underline !important; font-weight: 500 !important; }
    ul { margin: 0 0 20px 0 !important; padding-left: 24px !important; line-height: 1.65 !important; color: #3f3f46 !important; list-style-type: disc !important; list-style: disc outside !important; }
    ol { margin: 0 0 20px 0 !important; padding-left: 24px !important; line-height: 1.65 !important; color: #3f3f46 !important; list-style-type: decimal !important; list-style: decimal outside !important; }
    li { margin-bottom: 8px !important; display: list-item !important; list-style-type: inherit !important; }
    @media only screen and (max-width: 600px) {
      .responsive-table { width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f9f8f6;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9f8f6; width: 100%;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="responsive-table" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e2db; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 18px 32px; background-color: #fcfbfa; border-bottom: 1px solid #f4f4f5; text-align: left;" class="mobile-padding">
              <a href="https://www.toolbit.ai/" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://www.toolbit.ai/logo-icon.png" alt="Toolbit.ai Logo" width="28" height="28" style="display: inline-block; vertical-align: middle; margin-right: 8px; width: 28px; height: 28px; border: 0;" />
                <span style="display: inline-block; vertical-align: middle; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 20px; font-weight: 750; letter-spacing: -0.8px; color: #0d9488;">Toolbit.ai</span>
              </a>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 28px 32px; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.65; color: #3f3f46;" class="mobile-padding">
              ${normalizedBody}
            </td>
          </tr>

          <!-- Footer (Centered with Copyright on New Line) -->
          <tr>
            <td align="center" style="padding: 22px 24px 24px 24px; background-color: #fcfbfa; border-top: 1px solid #f4f4f5; text-align: center;" class="mobile-padding">
              <p style="margin: 0 0 0 0 !important; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 13px !important; color: #52525b !important; line-height: 1.4 !important; text-align: center;">
                You received this email regarding AI tool discovery and opportunities on Toolbit.ai.
              </p>
              <p style="margin: 4px 0 12px 0 !important; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 11px !important; color: #a1a1aa !important; line-height: 1.4 !important; text-align: center;">
                Feel free to reply this mail or reach out to us at <a href="mailto:contact@toolbit.ai" style="color: #a1a1aa !important; text-decoration: underline !important; font-weight: 400 !important;">contact@toolbit.ai</a>.
              </p>
              <div style="margin-bottom: 12px;">
                <a href="https://www.toolbit.ai/" style="color: #71717a; text-decoration: none; font-weight: 600; font-size: 12px; margin: 0 6px;" target="_blank">Home</a> &middot;
                <a href="https://www.toolbit.ai/contact" style="color: #71717a; text-decoration: none; font-weight: 600; font-size: 12px; margin: 0 6px;" target="_blank">Contact</a>
              </div>
              <p style="margin: 0 !important; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 11px !important; color: #94a3b8 !important; line-height: 1.4 !important; text-align: center;">
                &copy; ${currentYear} Toolbit AI. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Converts markdown / plain text into full responsive HTML email markup.
 */
export function textToEmailHtml(text: string): string {
  if (!text || !text.trim()) return '';
  return htmlBodyToFullEmailHtml(text);
}
