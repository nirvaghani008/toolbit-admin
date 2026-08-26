/**
 * Smoothly scroll to the first element with validation error and trigger visual highlight shadow.
 *
 * @param errors Object containing form validation errors
 */
export const scrollToError = (errors: Record<string, string>) => {
  const firstErrorKey = Object.keys(errors)[0];
  if (!firstErrorKey) return;

  // Defer execution slightly to allow collapsed accordion panels to expand
  setTimeout(() => {
    // Try standard selectors:
    // 1. By name attribute
    // 2. By ID
    // 3. By data-field or data-name
    // 4. By class name
    const element = document.querySelector(`[name="${firstErrorKey}"]`) ||
      document.getElementById(firstErrorKey) ||
      document.querySelector(`[data-field="${firstErrorKey}"]`) ||
      document.querySelector(`.${firstErrorKey}`);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Attempt to focus standard input/textarea/select
      if (typeof (element as any).focus === 'function') {
        (element as any).focus();
      }

      // Add visual border highlight pulse
      element.classList.add('saas-input-error-highlight');

      // Remove class after 3 pulses complete (0.45s x 3 = 1350ms)
      setTimeout(() => {
        element.classList.remove('saas-input-error-highlight');
      }, 1400);
    }
  }, 100);
};

/**
 * Convert any string into a clean, URL-safe slug.
 * Example: "My AI Tool 2026!" -> "my-ai-tool-2026"
 */
export const slugify = (text: string): string => {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/@/g, 'at')
    .replace(/[\/'"’‘]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'in', 'on', 'of', 'to', 'with',
  'at', 'by', 'from', 'is', 'are', 'was', 'were', 'how', 'what', 'why', 'where',
  'which', 'this', 'that', 'these', 'those', 'your', 'my', 'our', 'their', 'be',
  'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'as', 'it', 'its',
  'into', 'over', 'after', 'about', 'via', 'through', 'using', 'used', 'when',
  'who', 'whom', 'can', 'will', 'should', 'could', 'would', 'all', 'any', 'some'
]);

/**
 * Convert a long title into a concise, clean, and readable URL slug.
 * Removes common filler/stop words and caps the word count to keep slugs short and aesthetic.
 *
 * @param text Title string
 * @param maxWords Maximum number of words in slug (default: 5)
 * @param maxCharLength Maximum total character length of slug (default: 50)
 */
export const shortSlugify = (text: string, maxWords: number = 5, maxCharLength: number = 50): string => {
  if (!text) return '';

  const cleanText = text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
    .replace(/[\/'"’‘]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[\s_-]+/g, ' ')
    .trim();

  if (!cleanText) return '';

  const words = cleanText.split(' ').filter(Boolean);

  // Filter out filler/stop words
  const meaningfulWords = words.filter(w => !STOP_WORDS.has(w));

  // Fall back to original words if filtering leaves fewer than 2 words
  const targetWords = meaningfulWords.length >= 2 ? meaningfulWords : words;

  // Cap to maxWords
  const cappedWords = targetWords.slice(0, maxWords);

  let result = cappedWords.join('-');

  // Ensure result does not exceed maxCharLength
  if (result.length > maxCharLength) {
    result = result.substring(0, maxCharLength);
    const lastDash = result.lastIndexOf('-');
    if (lastDash > 10) {
      result = result.substring(0, lastDash);
    }
  }

  return result.replace(/^-+|-+$/g, '');
};


