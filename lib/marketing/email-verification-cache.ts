/**
 * Email Deliverability Verification Service
 *
 * Stores and queries verification outcomes directly from marketing_outreach_leads.business_emails
 * as the single source of truth.
 *
 * Cross-lead optimization: If an email address has already been verified on ANY lead,
 * its deliverability status (deliverable or undeliverable) is automatically reused so
 * No2Bounce credits are never spent more than once for the same address.
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
 * Retrieves email verification records across all leads in marketing_outreach_leads.
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
    // 1. Primary: Fast RPC lookup directly on marketing_outreach_leads
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'marketing_get_lead_email_verifications',
      { p_emails: uniqueEmails }
    );

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
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
            verified_at: typeof row.verified_at === 'string' ? row.verified_at : new Date().toISOString(),
          });
        }
      }
      return cacheMap;
    }

    // 2. Direct fallback: Query marketing_outreach_leads directly via Supabase client
    for (const email of uniqueEmails) {
      const { data, error } = await supabaseAdmin
        .from('marketing_outreach_leads')
        .select('business_emails')
        .contains('business_emails', { [email]: {} })
        .limit(10);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const beMap = (row.business_emails || {}) as Record<string, any>;
          const rec = beMap[email];
          if (rec && (rec.status === 'deliverable' || rec.status === 'undeliverable')) {
            const hasScore =
              rec.verification_score !== undefined &&
              rec.verification_score !== null &&
              String(rec.verification_score).trim() !== '';
            const scoreNum = hasScore ? Number(rec.verification_score) : NaN;

            cacheMap.set(email, {
              email,
              status: rec.status,
              score: Number.isFinite(scoreNum) ? scoreNum : null,
              score_status:
                rec.verification_status ||
                (rec.resend_status === 'bounced' ? 'Bounced (Resend)' : null),
              provider: rec.verification_provider || (rec.resend_status ? 'resend' : 'no2bounce'),
              verified_at:
                rec.verified_at ||
                rec.last_bounced_at ||
                rec.last_delivered_at ||
                new Date().toISOString(),
            });
            break; // found definitive status for this address
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[EmailVerificationService] getCachedEmailVerifications degraded gracefully:', err?.message);
  }

  return cacheMap;
}

/**
 * Synchronizes verified email outcomes across all matching leads in marketing_outreach_leads.
 * Excludes transient failures ('unverified' / failOpen).
 */
export async function saveEmailVerifications(
  verifications: Array<No2BounceVerificationResult | CachedEmailVerification>
): Promise<void> {
  const validRecords = verifications.filter((v) => {
    const isFailOpen = 'failOpen' in v && v.failOpen === true;
    return !isFailOpen && (v.status === 'deliverable' || v.status === 'undeliverable');
  });

  if (validRecords.length === 0) return;

  try {
    for (const record of validRecords) {
      const email = record.email.trim().toLowerCase();
      const status = record.status;
      const score = record.score !== null && record.score !== undefined ? String(record.score) : '';
      const scoreStatus = ('scoreStatus' in record ? record.scoreStatus : record.score_status) || '';
      const provider = record.provider || 'no2bounce';
      const verifiedAt = ('verifiedAt' in record ? record.verifiedAt : record.verified_at) || new Date().toISOString();

      // 1. Try atomic sync RPC if deployed
      const { error: rpcErr } = await supabaseAdmin.rpc('marketing_sync_lead_email_verification', {
        p_email: email,
        p_status: status,
        p_score: score,
        p_score_status: scoreStatus,
        p_provider: provider,
        p_verified_at: verifiedAt,
      });

      if (!rpcErr) continue;

      // 2. Fallback: Query all leads having this email and update their business_emails directly
      const { data: matchingLeads, error: queryErr } = await supabaseAdmin
        .from('marketing_outreach_leads')
        .select('id, business_emails')
        .contains('business_emails', { [email]: {} });

      if (!queryErr && Array.isArray(matchingLeads) && matchingLeads.length > 0) {
        await Promise.all(
          matchingLeads.map(async (l) => {
            const currentMap = (l.business_emails || {}) as Record<string, any>;
            const existingRec = currentMap[email] || { status: 'unverified' };
            const updatedMap = {
              ...currentMap,
              [email]: {
                ...existingRec,
                status,
                verification_score: score,
                verification_status: scoreStatus,
                verification_provider: provider,
                verified_at: verifiedAt,
              },
            };
            await supabaseAdmin
              .from('marketing_outreach_leads')
              .update({
                business_emails: updatedMap,
                updated_at: new Date().toISOString(),
              })
              .eq('id', l.id);
          })
        );
      }
    }
  } catch (err: any) {
    console.warn('[EmailVerificationService] saveEmailVerifications degraded gracefully:', err?.message);
  }
}

