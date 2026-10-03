/**
 * No2Bounce Email Deliverability Verification Client
 *
 * Official API: https://connect.no2bounce.com
 * Authentication: apitoken in header
 * Flow:
 *   1. POST /v2/n2b_validate_email { email } -> trackingId
 *   2. GET /v2/n2b_validate_email?trackingId={id} -> { result: { score, scoreStatus } }
 *
 * Guarantees:
 *   - Strictly server-side (API keys never exposed to client).
 *   - Fail-open & resilient: if API experiences timeouts, rate limits, or network errors,
 *     it logs a warning and returns status 'unverified' with failOpen: true so outreach sending
 *     is never blocked or crashed.
 *   - High-performance bounded timeout per verification (default 5,000ms).
 */

export type No2BounceScoreStatus =
  | 'Deliverable'
  | 'Catch-All'
  | 'Undeliverable'
  | 'Invalid'
  | 'Disposable'
  | string;

export interface No2BounceVerificationResult {
  email: string;
  status: 'deliverable' | 'undeliverable' | 'unverified';
  score: number | null;
  scoreStatus: No2BounceScoreStatus | null;
  provider: 'no2bounce';
  verifiedAt: string;
  rawResponse?: Record<string, unknown>;
  error?: string;
  failOpen?: boolean;
}

/** Retrieves server-only No2Bounce base API URL (configured via NO2BOUNCE_BASE_URL in .env.local) */
export function getNo2BounceBaseUrl(): string {
  const configured = (process.env.NO2BOUNCE_BASE_URL || process.env.NEXT_PUBLIC_NO2BOUNCE_BASE_URL)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return 'https://connect.no2bounce.com';
}

/** Fallback constant evaluated at runtime */
export const NO2BOUNCE_BASE_URL = 'https://connect.no2bounce.com';

/** Checks whether No2Bounce API key is present in server environment */
export function isNo2BounceConfigured(): boolean {
  return Boolean(
    (process.env.NO2BOUNCE_API_KEY || process.env.NO2BOUNCE_API_TOKEN)?.trim()
  );
}

/** Retrieves server-only No2Bounce API token */
function getNo2BounceToken(): string {
  return (process.env.NO2BOUNCE_API_KEY || process.env.NO2BOUNCE_API_TOKEN)?.trim() || '';
}

/** Sleep utility for polling intervals */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface VerifySingleEmailOptions {
  /** Maximum total time in milliseconds before failing open (default: 12000ms) */
  timeoutMs?: number;
  /** Maximum number of polling attempts after initial submission (default: 12) */
  maxPollAttempts?: number;
  /** Interval in milliseconds between polling checks (default: 1000ms) */
  pollIntervalMs?: number;
}

/**
 * Verifies a single email address via No2Bounce API.
 * Uses a fail-open strategy: any timeout, HTTP failure, or API unavailability
 * returns a safe 'unverified' fallback result with failOpen: true.
 */
export async function verifySingleEmail(
  email: string,
  options?: VerifySingleEmailOptions
): Promise<No2BounceVerificationResult> {
  const cleanEmail = email.trim().toLowerCase();
  const token = getNo2BounceToken();
  const now = new Date().toISOString();

  // Basic sanity check: if not even an email format, classify as undeliverable
  if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.startsWith('@') || cleanEmail.endsWith('@')) {
    return {
      email: cleanEmail,
      status: 'undeliverable',
      score: 0,
      scoreStatus: 'Invalid',
      provider: 'no2bounce',
      verifiedAt: now,
      error: 'Malformed email format',
    };
  }

  // If token is missing, fail open cleanly
  if (!token) {
    return {
      email: cleanEmail,
      status: 'unverified',
      score: null,
      scoreStatus: null,
      provider: 'no2bounce',
      verifiedAt: now,
      failOpen: true,
      error: 'NO2BOUNCE_API_KEY is not configured on server',
    };
  }

  const timeoutMs = options?.timeoutMs ?? 12000;
  const maxPollAttempts = options?.maxPollAttempts ?? 12;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  const baseUrl = getNo2BounceBaseUrl();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Step 1: Submit single email for validation
    const submitRes = await fetch(`${baseUrl}/v2/n2b_validate_email`, {
      method: 'POST',
      headers: {
        'apitoken': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail }),
      signal: controller.signal,
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => '');
      // 400 Bad Request usually indicates invalid email syntax according to No2Bounce
      if (submitRes.status === 400) {
        return {
          email: cleanEmail,
          status: 'undeliverable',
          score: 0,
          scoreStatus: 'Invalid',
          provider: 'no2bounce',
          verifiedAt: now,
          error: `API returned 400 Bad Request: ${errText}`,
        };
      }
      // For 401, 403, 500 etc. fail open
      console.warn(`[No2Bounce] Validation submission HTTP ${submitRes.status} for ${cleanEmail}: ${errText}`);
      return {
        email: cleanEmail,
        status: 'unverified',
        score: null,
        scoreStatus: null,
        provider: 'no2bounce',
        verifiedAt: now,
        failOpen: true,
        error: `HTTP ${submitRes.status}: ${errText}`,
      };
    }

    const submitJson = (await submitRes.json()) as any;
    const trackingId = submitJson?.data?.trackingId || submitJson?.trackingId;

    if (!trackingId || typeof trackingId !== 'string') {
      console.warn(`[No2Bounce] No trackingId in response for ${cleanEmail}:`, submitJson);
      return {
        email: cleanEmail,
        status: 'unverified',
        score: null,
        scoreStatus: null,
        provider: 'no2bounce',
        verifiedAt: now,
        failOpen: true,
        error: 'Missing trackingId in No2Bounce response',
      };
    }

    // Step 2: Poll for results using trackingId
    let attempts = 0;
    let pollData: any = null;

    while (attempts < maxPollAttempts) {
      if (controller.signal.aborted) break;

      attempts++;
      const pollRes = await fetch(
        `${baseUrl}/v2/n2b_validate_email?trackingId=${encodeURIComponent(trackingId)}`,
        {
          method: 'GET',
          headers: {
            'apitoken': token,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        }
      );

      if (pollRes.ok) {
        pollData = await pollRes.json();
        // Wait until overallStatus is Completed OR result has an actual scoreStatus
        const hasScoreStatus =
          typeof pollData?.result?.scoreStatus === 'string' && pollData.result.scoreStatus.trim() !== '';
        const isCompleted = pollData?.overallStatus === 'Completed' || hasScoreStatus;
        if (isCompleted) {
          break;
        }
      }

      // Wait before next poll attempt
      await wait(pollIntervalMs);
    }

    const rawResult = pollData?.result;
    const hasScoreStatus =
      typeof rawResult?.scoreStatus === 'string' && rawResult.scoreStatus.trim() !== '';
    const isCompleted = pollData?.overallStatus === 'Completed' || hasScoreStatus;

    if (!pollData || !rawResult || !isCompleted) {
      console.warn(
        `[No2Bounce] Polling incomplete for ${cleanEmail} after ${attempts} attempts (overallStatus: ${pollData?.overallStatus})`
      );
      return {
        email: cleanEmail,
        status: 'unverified',
        score: null,
        scoreStatus: null,
        provider: 'no2bounce',
        verifiedAt: now,
        failOpen: true,
        error: 'Polling timeout waiting for verification result',
      };
    }

    const scoreRaw = rawResult?.score;
    const hasValidScore =
      scoreRaw !== null && scoreRaw !== undefined && typeof scoreRaw !== 'boolean' && String(scoreRaw).trim() !== '';
    const scoreNum = hasValidScore ? Number(scoreRaw) : NaN;
    const score = Number.isFinite(scoreNum) ? Math.round(scoreNum) : null;
    const scoreStatus = typeof rawResult.scoreStatus === 'string' && rawResult.scoreStatus.trim() ? rawResult.scoreStatus.trim() : null;

    // Interpret deliverability status
    let status: 'deliverable' | 'undeliverable' | 'unverified' = 'unverified';
    const statusLower = (scoreStatus || '').toLowerCase();

    if (
      statusLower === 'deliverable' ||
      statusLower === 'catch-all' ||
      (statusLower.includes('deliverable') && !statusLower.includes('undeliverable'))
    ) {
      status = 'deliverable';
    } else if (
      statusLower.includes('undeliverable') ||
      statusLower.includes('invalid') ||
      statusLower.includes('disposable')
    ) {
      status = 'undeliverable';
    } else if (score !== null) {
      if (score < 30) {
        status = 'undeliverable';
      } else if (score >= 70) {
        status = 'deliverable';
      } else {
        // Between 30 and 70: default to deliverable for cold outreach
        status = 'deliverable';
      }
    }

    return {
      email: cleanEmail,
      status,
      score,
      scoreStatus,
      provider: 'no2bounce',
      verifiedAt: now,
      rawResponse: {
        score: rawResult.score,
        scoreStatus: rawResult.scoreStatus,
        overallStatus: pollData.overallStatus,
        trackingId,
      },
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError' || controller.signal.aborted;
    console.warn(`[No2Bounce] Fail-open: error verifying ${cleanEmail} (${isAbort ? 'Timeout' : err?.message})`);
    return {
      email: cleanEmail,
      status: 'unverified',
      score: null,
      scoreStatus: null,
      provider: 'no2bounce',
      verifiedAt: now,
      failOpen: true,
      error: isAbort ? `Verification timed out after ${timeoutMs}ms` : err?.message || 'Verification error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Batch verifies email addresses with controlled concurrency.
 * Ensures API rate limits are respected and timeouts are bounded.
 */
export async function verifyEmailsBatch(
  emails: string[],
  options?: {
    concurrency?: number;
    timeoutMs?: number;
  }
): Promise<Map<string, No2BounceVerificationResult>> {
  const results = new Map<string, No2BounceVerificationResult>();
  const uniqueEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  );

  if (uniqueEmails.length === 0) return results;

  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 10));
  const queue = [...uniqueEmails];

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift();
      if (!email) break;
      const res = await verifySingleEmail(email, { timeoutMs: options?.timeoutMs });
      results.set(email, res);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, uniqueEmails.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
