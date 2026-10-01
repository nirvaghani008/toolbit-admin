/**
 * Shared display helpers for marketing_outreach_leads.status.
 * Used by the leads table (StatusChangeControl) and the lead details dialog.
 *
 * Safe to import from both client and server code (no server-only imports).
 */

// Pipeline order: pending → emailed → replied → launched.
// 'emailed' and 'replied' are also set automatically (forward-only) by the Resend webhook.
export const LEAD_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'emailed', label: 'Emailed' },
  { value: 'replied', label: 'Replied' },
  { value: 'launched', label: 'Launched' },
] as const;

export type LeadStatusVariant = 'success' | 'violet' | 'info' | 'warning';

export function getLeadStatusVariant(status: string): LeadStatusVariant {
  const s = (status || '').toLowerCase();
  if (s === 'emailed') return 'success';
  if (s === 'replied') return 'violet';
  if (s === 'launched') return 'info';
  return 'warning';
}

export function formatLeadStatus(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'emailed') return 'Emailed';
  if (s === 'replied') return 'Replied';
  if (s === 'launched') return 'Launched';
  return 'Pending';
}

export function getLeadStatusDotColor(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'emailed') return 'bg-emerald-500';
  if (s === 'replied') return 'bg-violet-500';
  if (s === 'launched') return 'bg-sky-500';
  return 'bg-amber-500';
}

const AUTOMATION_REASON_LABELS: Record<string, string> = {
  'email.delivered': 'on delivery',
  'email.received': 'on reply',
};

/** Shows "Auto · on reply" when the current status was set by the Resend webhook. */
export function getLeadAutomationHint(lead: {
  status: string;
  metadata?: Record<string, any> | null;
}): { label: string; title: string } | null {
  const auto = lead.metadata?.status_automation;
  if (!auto || typeof auto !== 'object') return null;
  if ((auto.status || '').toLowerCase() !== (lead.status || '').toLowerCase()) return null; // changed manually since
  const reason = AUTOMATION_REASON_LABELS[auto.reason] || 'automatically';
  const when = auto.at ? new Date(auto.at).toLocaleString('en-US') : '';
  return {
    label: `Auto · ${reason}`,
    title: `Set automatically by the Resend webhook${when ? ` on ${when}` : ''}${
      auto.previous_status ? ` (was ${auto.previous_status})` : ''
    }`,
  };
}
