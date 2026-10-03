/**
 * Business emails deliverability status & mapping utilities (Design 1).
 */

export type EmailDeliverabilityStatus = 'unverified' | 'deliverable' | 'undeliverable';

export type ResendDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface EmailRecord {
  /** Deliverability status policy: 'unverified' | 'deliverable' | 'undeliverable' */
  status: EmailDeliverabilityStatus;

  /** Resend webhook delivery event (sent, delivered, bounced, etc.) */
  resend_status?: ResendDeliveryStatus;

  /** Reason reported by Resend on bounce/failure */
  bounce_reason?: string;

  /** Bounce classification from Resend (e.g. 'permanent' | 'transient') */
  bounce_type?: string;

  /** Timestamp when email was last dispatched */
  last_sent_at?: string;

  /** Timestamp when delivery was confirmed */
  last_delivered_at?: string;

  /** Timestamp when bounce occurred */
  last_bounced_at?: string;

  /** Resend email ID */
  last_resend_id?: string;

  /** Email verification provider (e.g. 'no2bounce') */
  verification_provider?: string;

  /** Deliverability score (0 - 100) */
  verification_score?: number;

  /** Score classification label from provider (e.g. 'Deliverable', 'Catch-All', 'Undeliverable') */
  verification_status?: string;

  /** Timestamp when email was verified */
  verified_at?: string;
}

/** Map of email address to its structured deliverability record */
export type BusinessEmailsMap = Record<string, EmailRecord>;

/** Defensive normalizer: converts legacy string arrays, raw string objects or structured objects to BusinessEmailsMap */
export function normalizeBusinessEmails(raw: unknown): BusinessEmailsMap {
  if (!raw) return {};

  const result: BusinessEmailsMap = {};

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const clean = item.trim().toLowerCase();
        if (clean) {
          result[clean] = { status: 'unverified' };
        }
      }
    }
    return result;
  }

  if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof key === 'string') {
        const cleanEmail = key.trim().toLowerCase();
        if (!cleanEmail) continue;

        // Case 1: Legacy string value: e.g. "deliverable", "unverified", "undeliverable"
        if (typeof value === 'string') {
          const cleanStatus = value.trim().toLowerCase();
          const status: EmailDeliverabilityStatus =
            cleanStatus === 'deliverable' || cleanStatus === 'undeliverable' || cleanStatus === 'unverified'
              ? cleanStatus
              : 'unverified';
          result[cleanEmail] = { status };
          continue;
        }

        // Case 2: Structured object value (Design 1)
        if (typeof value === 'object' && value !== null) {
          const valObj = value as Record<string, unknown>;
          const rawStatus = typeof valObj.status === 'string' ? valObj.status.trim().toLowerCase() : '';
          const status: EmailDeliverabilityStatus =
            rawStatus === 'deliverable' || rawStatus === 'undeliverable' || rawStatus === 'unverified'
              ? (rawStatus as EmailDeliverabilityStatus)
              : 'unverified';

          const record: EmailRecord = { status };

          if (typeof valObj.resend_status === 'string' && valObj.resend_status.trim()) {
            record.resend_status = valObj.resend_status.trim().toLowerCase() as ResendDeliveryStatus;
          }
          if (typeof valObj.bounce_reason === 'string' && valObj.bounce_reason.trim()) {
            record.bounce_reason = valObj.bounce_reason.trim();
          }
          if (typeof valObj.bounce_type === 'string' && valObj.bounce_type.trim()) {
            record.bounce_type = valObj.bounce_type.trim();
          }
          if (typeof valObj.last_sent_at === 'string' && valObj.last_sent_at.trim()) {
            record.last_sent_at = valObj.last_sent_at.trim();
          }
          if (typeof valObj.last_delivered_at === 'string' && valObj.last_delivered_at.trim()) {
            record.last_delivered_at = valObj.last_delivered_at.trim();
          }
          if (typeof valObj.last_bounced_at === 'string' && valObj.last_bounced_at.trim()) {
            record.last_bounced_at = valObj.last_bounced_at.trim();
          }
          if (typeof valObj.last_resend_id === 'string' && valObj.last_resend_id.trim()) {
            record.last_resend_id = valObj.last_resend_id.trim();
          }
          if (typeof valObj.verification_provider === 'string' && valObj.verification_provider.trim()) {
            record.verification_provider = valObj.verification_provider.trim();
          }
          if (
            valObj.verification_score !== undefined &&
            valObj.verification_score !== null &&
            typeof valObj.verification_score !== 'boolean' &&
            String(valObj.verification_score).trim() !== ''
          ) {
            const parsedScore = Number(valObj.verification_score);
            if (Number.isFinite(parsedScore)) {
              record.verification_score = Math.round(parsedScore);
            }
          }
          if (typeof valObj.verification_status === 'string' && valObj.verification_status.trim()) {
            record.verification_status = valObj.verification_status.trim();
          }
          if (typeof valObj.verified_at === 'string' && valObj.verified_at.trim()) {
            record.verified_at = valObj.verified_at.trim();
          }

          result[cleanEmail] = record;
        } else {
          result[cleanEmail] = { status: 'unverified' };
        }
      }
    }
    return result;
  }

  return {};
}

/** Convenience helper: return all email addresses on lead in order of priority */
export function getAllEmails(lead: { business_emails?: BusinessEmailsMap | null } | null | undefined): string[] {
  if (!lead || !lead.business_emails) return [];
  return Object.keys(lead.business_emails);
}

/** Convenience helper: return primary (first) email on lead in order of priority */
export function getPrimaryEmail(lead: { business_emails?: BusinessEmailsMap | null } | null | undefined): string | null {
  const emails = getAllEmails(lead);
  return emails.length > 0 ? emails[0] : null;
}

/** Convenience helper: return specific email record on lead */
export function getEmailRecord(
  lead: { business_emails?: BusinessEmailsMap | null } | null | undefined,
  email: string
): EmailRecord | null {
  if (!lead || !lead.business_emails || !email) return null;
  const clean = email.trim().toLowerCase();
  return lead.business_emails[clean] || null;
}

/** Convenience helper: check if an email record has bounced */
export function isEmailBounced(record: EmailRecord | null | undefined): boolean {
  if (!record) return false;
  return record.resend_status === 'bounced' || (record.status === 'undeliverable' && !!record.bounce_reason);
}

/** Convenience helper: return verified deliverable emails (excluding bounced) */
export function getDeliverableEmails(lead: { business_emails?: BusinessEmailsMap | null } | null | undefined): string[] {
  if (!lead || !lead.business_emails) return [];
  return Object.entries(lead.business_emails)
    .filter(([, r]) => r.status === 'deliverable' && r.resend_status !== 'bounced')
    .map(([e]) => e);
}

/** Convenience helper: return unverified emails (excluding bounced) */
export function getUnverifiedEmails(lead: { business_emails?: BusinessEmailsMap | null } | null | undefined): string[] {
  if (!lead || !lead.business_emails) return [];
  return Object.entries(lead.business_emails)
    .filter(([, r]) => r.status === 'unverified' && r.resend_status !== 'bounced')
    .map(([e]) => e);
}

/** Convenience helper: return undeliverable or bounced emails */
export function getUndeliverableEmails(lead: { business_emails?: BusinessEmailsMap | null } | null | undefined): string[] {
  if (!lead || !lead.business_emails) return [];
  return Object.entries(lead.business_emails)
    .filter(([, r]) => r.status === 'undeliverable' || r.resend_status === 'bounced')
    .map(([e]) => e);
}
