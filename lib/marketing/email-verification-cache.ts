/**
 * Cross-Lead Email Deliverability Verification Cache
 *
 * Utilizes public.marketing_email_verifications table and RPCs
 * (marketing_get_email_verifications, marketing_save_email_verifications)
 * to persist verification results cross-lead, preventing redundant API calls
 * and credit consumption.
 *
 * Resilient: If RPCs or tables are temporarily missing or undergoing migration,
 * queries degrade gracefully without disrupting the marketing outreach pipeline.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EmailDeliverabilityStatus } from './business-emails';
import type { No2BounceVerificationResult } from '@/lib/no2bounce';

export interface CachedEmailVerification {
  email: string;
  status: EmailDeliverabilityStatus;
  score: number | null;
  score_status: string | null;
  provider: string;
  raw_response?: Record<string, unknown> | null;
  verified_at: string;
  updated_at?: string;
}

/**
 * Retrieves cached email verification records for the given email addresses.
 * Returns a Map keyed by lowercase email address.
 */
export async function getCachedEmailVerifications(
  emails: string[]
): Promise<Map<string, CachedEmailVerification>> {
  const cacheMap = new Map<string, CachedEmailVerification>();
  const uniqueEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  );

  if (uniqueEmails.length === 0) return cacheMap;

  try {
    // 1. Primary: Query via RPC
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'marketing_get_email_verifications',
      { p_emails: uniqueEmails }
    );

    if (!rpcError && Array.isArray(rpcData)) {
      for (const row of rpcData as any[]) {
        if (row && typeof row.email === 'string') {
          const email = row.email.toLowerCase();
          const rawStatus = typeof row.status === 'string' ? row.status.toLowerCase() : '';
          const status: EmailDeliverabilityStatus =
            rawStatus === 'deliverable' || rawStatus === 'undeliverable'
              ? rawStatus
              : 'unverified';

          const hasScore =
            row.score !== null &&
            row.score !== undefined &&
            typeof row.score !== 'boolean' &&
            String(row.score).trim() !== '';
          const scoreNum = hasScore ? Number(row.score) : NaN;
          const score = Number.isFinite(scoreNum) ? scoreNum : null;

          cacheMap.set(email, {
            email,
            status,
            score,
            score_status: typeof row.score_status === 'string' ? row.score_status : null,
            provider: typeof row.provider === 'string' ? row.provider : 'no2bounce',
            raw_response: row.raw_response && typeof row.raw_response === 'object' ? row.raw_response : null,
            verified_at: typeof row.verified_at === 'string' ? row.verified_at : new Date().toISOString(),
            updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
          });
        }
      }
      return cacheMap;
    }

    // 2. Fallback: Direct table select if RPC is not present
    const { data: tableData, error: tableError } = await supabaseAdmin
      .from('marketing_email_verifications')
      .select('email, status, score, score_status, provider, raw_response, verified_at, updated_at')
      .in('email', uniqueEmails);

    if (!tableError && Array.isArray(tableData)) {
      for (const row of tableData as any[]) {
        if (row && typeof row.email === 'string') {
          const email = row.email.toLowerCase();
          const rawStatus = typeof row.status === 'string' ? row.status.toLowerCase() : '';
          const status: EmailDeliverabilityStatus =
            rawStatus === 'deliverable' || rawStatus === 'undeliverable'
              ? rawStatus
              : 'unverified';

          const hasScore =
            row.score !== null &&
            row.score !== undefined &&
            typeof row.score !== 'boolean' &&
            String(row.score).trim() !== '';
          const scoreNum = hasScore ? Number(row.score) : NaN;
          const score = Number.isFinite(scoreNum) ? scoreNum : null;

          cacheMap.set(email, {
            email,
            status,
            score,
            score_status: typeof row.score_status === 'string' ? row.score_status : null,
            provider: typeof row.provider === 'string' ? row.provider : 'no2bounce',
            raw_response: row.raw_response && typeof row.raw_response === 'object' ? row.raw_response : null,
            verified_at: typeof row.verified_at === 'string' ? row.verified_at : new Date().toISOString(),
            updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
          });
        }
      }
    }
  } catch (err: any) {
    // Fail-safe: caching error should never crash callers
    console.warn('[EmailVerificationCache] getCachedEmailVerifications degraded gracefully:', err?.message);
  }

  return cacheMap;
}

/**
 * Saves or updates email verifications in the persistent cache.
 * Excludes transient failures ('unverified' / failOpen).
 */
export async function saveEmailVerifications(
  verifications: Array<No2BounceVerificationResult | CachedEmailVerification>
): Promise<void> {
  // Only persist definitive deliverability outcomes (deliverable or undeliverable)
  const validRecords = verifications.filter((v) => {
    const isFailOpen = 'failOpen' in v && v.failOpen === true;
    return !isFailOpen && (v.status === 'deliverable' || v.status === 'undeliverable');
  });

  if (validRecords.length === 0) return;

  const payload = validRecords.map((r) => ({
    email: r.email.trim().toLowerCase(),
    status: r.status,
    score: r.score ?? null,
    score_status: ('scoreStatus' in r ? r.scoreStatus : r.score_status) ?? null,
    provider: r.provider || 'no2bounce',
    raw_response: ('rawResponse' in r ? r.rawResponse : ('raw_response' in r ? r.raw_response : null)) || null,
  }));

  try {
    // 1. Primary: Save via RPC
    const { error: rpcError } = await supabaseAdmin.rpc('marketing_save_email_verifications', {
      p_verifications: payload,
    });

    if (!rpcError) return;

    // 2. Fallback: Direct table upsert
    const upsertRows = payload.map((p) => ({
      email: p.email,
      status: p.status,
      score: p.score,
      score_status: p.score_status,
      provider: p.provider,
      raw_response: p.raw_response,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: tableError } = await supabaseAdmin
      .from('marketing_email_verifications')
      .upsert(upsertRows, { onConflict: 'email' });

    if (tableError) {
      console.warn('[EmailVerificationCache] saveEmailVerifications fallback error:', tableError.message);
    }
  } catch (err: any) {
    console.warn('[EmailVerificationCache] saveEmailVerifications degraded gracefully:', err?.message);
  }
}
