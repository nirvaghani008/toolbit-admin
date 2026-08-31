/**
 * Returns true when captcha/verification checks should be skipped in dev/staging.
 *
 * To bypass verification, set in .env.local:
 *   NEXT_PUBLIC_SUBMIT_BYPASS=true
 *
 * Leave unset or set to "false" to enforce normal Turnstile verification.
 */
export function isBypassActive(): boolean {
  return process.env.NEXT_PUBLIC_SUBMIT_BYPASS === 'true';
}
