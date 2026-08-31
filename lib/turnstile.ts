import crypto from 'crypto';
import { isBypassActive } from '@/lib/bypass';

/**
 * Derives a deterministic UUID-v4-like string from the Turnstile token
 * to serve as an idempotency key during Cloudflare siteverify requests.
 */
function siteverifyIdempotencyKey(token: string): string {
  const hex = crypto.createHash('sha256').update(token).digest('hex');
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Server-side verification for Cloudflare Turnstile tokens.
 * Works seamlessly in both Cloud and Self-Hosted modes.
 */
export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  // ─── DEV/BYPASS MODE: skip verification if enabled ────────────────────────
  if (isBypassActive()) return true;
  // ──────────────────────────────────────────────────────────────────────────

  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '';
  if (!secret || !token) return false;

  try {
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('idempotency_key', siteverifyIdempotencyKey(token));

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(10_000),
    });

    const json = (await resp.json()) as { success?: boolean };
    return !!json.success;
  } catch (error) {
    console.error('[Turnstile] Token verification network error:', error);
    return false;
  }
}
