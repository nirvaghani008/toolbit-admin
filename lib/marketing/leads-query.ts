import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  type BusinessEmailsMap,
  normalizeBusinessEmails,
} from '@/lib/marketing/business-emails';
import type { ConversationSummary, ConversationThread } from '@/lib/marketing/conversation';

export interface OutreachConversionEvent {
  id: string;
  type: 'page_visit' | 'signup' | 'login' | 'submission' | 'checkout' | 'purchase';
  at: string;
  session_id?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  data?: Record<string, any>;
  idempotency_key?: string | null;
}

export interface OutreachConversionSummary {
  visit_count?: number;
  signed_up?: boolean;
  toolbit_user_id?: string;
  toolbit_user_email?: string;
  submitted?: boolean;
  submitted_at?: string;
  submission_count?: number;
  last_submission_id?: string | number;
  checked_out?: boolean;
  purchased?: boolean;
  purchased_at?: string;
  purchase_count?: number;
  total_spent_usd?: number;
  /** @deprecated Removed from summary to avoid clutter; inspect conversions.events for visit timestamps */
  first_visit_at?: string;
  /** @deprecated Removed from summary to avoid clutter; inspect conversions.events for visit timestamps */
  last_visit_at?: string;
  /** @deprecated Removed from summary; inspect conversions.events for signup/login timestamps */
  signed_up_at?: string;
  /** @deprecated Removed from summary; inspect conversions.events for checkout timestamps */
  last_checkout_at?: string;
}

export interface MarketingOutreachLead {
  id: string;
  tool_name: string;
  tool_site_url: string;
  business_emails: BusinessEmailsMap;
  status: string;
  contact_page_url: string[];
  social_links: string[];
  marketing_medium: string[] | null;
  sources: Array<{ source?: string; listing_url?: string; [key: string]: any }> | null;
  /** Full history is lazy-loaded per lead (getOutreachLeadConversationAction). */
  conversation_history?: ConversationThread[];
  /** Lightweight summary from the `conversation_summary` computed field. */
  conversation_summary?: ConversationSummary | null;
  /** Unified website conversion tracking ({ summary, events }). */
  conversions?: {
    summary?: OutreachConversionSummary | null;
    events?: OutreachConversionEvent[];
  } | null;
  /** Full website conversion events history (backward-compatible alias). */
  conversion_events?: OutreachConversionEvent[];
  /** Materialized roll-up of conversion milestones (backward-compatible alias). */
  conversion_summary?: OutreachConversionSummary | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OutreachLeadsStats {
  total: number;
  withEmails: number;
  pending: number;
  emailed: number;
  replied: number;
}

export interface GetOutreachLeadsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  hasEmailOnly?: boolean;
  hasRepliesOnly?: boolean;
  isToolSubmissionOnly?: boolean;
}

export interface OutreachLeadsResult {
  leads: MarketingOutreachLead[];
  totalCount: number;
  stats: OutreachLeadsStats;
}

/** JSONB containment used for "has replies" (real replies, not auto-responders). Hits the GIN index. */
const HAS_REPLIES_FILTER = JSON.stringify([{ messages: [{ direction: 'inbound', is_auto_reply: false }] }]);

const LEAD_LIST_COLUMNS =
  'id, tool_name, tool_site_url, business_emails, status, contact_page_url, social_links, marketing_medium, sources, metadata, conversions, created_at, updated_at';

/**
 * Stat cards (totals over ALL leads, independent of list filters) in one query via
 * rpc marketing_outreach_lead_stats (migration 20260930120000).
 * Until that migration is applied, falls back to the previous per-card counts so the
 * page keeps working; the fallback can be removed afterwards.
 */
export async function fetchOutreachLeadStats(): Promise<OutreachLeadsStats> {
  const { data, error } = await supabaseAdmin.rpc('marketing_outreach_lead_stats');
  if (!error && data && typeof data === 'object') {
    const s = data as Record<string, number>;
    return {
      total: s.total || 0,
      withEmails: s.with_emails || 0,
      pending: s.pending || 0,
      emailed: s.emailed || 0,
      replied: s.replied || 0,
    };
  }

  console.warn('marketing_outreach_lead_stats unavailable, using per-card counts:', error?.message);
  const countLeads = (apply: (q: any) => any = (q) => q) =>
    apply(supabaseAdmin.from('marketing_outreach_leads').select('id', { count: 'exact', head: true }));
  const [totalRes, withEmailsRes, pendingRes, emailedRes, repliedRes] = await Promise.all([
    countLeads(),
    countLeads((q) => q.neq('business_emails', '{}')),
    countLeads((q) => q.eq('status', 'pending')),
    countLeads((q) => q.eq('status', 'emailed')),
    countLeads((q) => q.eq('status', 'replied')),
  ]);
  return {
    total: totalRes.count || 0,
    withEmails: withEmailsRes.count || 0,
    pending: pendingRes.count || 0,
    emailed: emailedRes.count || 0,
    replied: repliedRes.count || 0,
  };
}

// Shared filter builder for the leads list (keeps the original filter semantics).
export function applyOutreachLeadFilters(query: any, params: GetOutreachLeadsParams): any {
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  if (params.source && params.source !== 'all') {
    if (params.source === 'producthunt') {
      query = query.or('sources.cs.[{"source":"producthunt.com"}],sources.cs.[{"source":"ProductHunt"}]');
    } else if (params.source === 'toolify') {
      query = query.filter('sources', 'cs', JSON.stringify([{ source: 'toolify.ai' }]));
    } else if (params.source === 'theresanaiforthat') {
      query = query.filter('sources', 'cs', JSON.stringify([{ source: 'theresanaiforthat.com' }]));
    } else if (params.source === 'codehype') {
      query = query.filter('sources', 'cs', JSON.stringify([{ source: 'codehype.ai' }]));
    } else if (params.source === 'tool_submission') {
      query = query.eq('metadata->>is_tool_submission', 'true');
    }
  }

  if (params.isToolSubmissionOnly) {
    query = query.eq('metadata->>is_tool_submission', 'true');
  }

  if (params.hasEmailOnly) {
    query = query.neq('business_emails', '{}');
  }

  const rawSearch = (params.search || '').trim();
  if (rawSearch) {
    const sanitized = rawSearch.replace(/[%_,]/g, '');
    if (sanitized) {
      if (sanitized.includes('@')) {
        const safeEmail = sanitized.toLowerCase().replace(/["\\]/g, '');
        query = query.or(
          `tool_name.ilike.%${sanitized}%,tool_site_url.ilike.%${sanitized}%,business_emails->>"${safeEmail}".not.is.null`
        );
      } else {
        query = query.or(
          `tool_name.ilike.%${sanitized}%,tool_site_url.ilike.%${sanitized}%`
        );
      }
    }
  }

  if (params.hasRepliesOnly) {
    query = query.filter('conversation_history', 'cs', HAS_REPLIES_FILTER);
  }

  return query;
}

export async function fetchMarketingOutreachLeads(
  params: GetOutreachLeadsParams = {}
): Promise<OutreachLeadsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Parallel fetch: paginated leads (+ `conversation_summary` computed field) and stat-card counts
  const [leadsRes, stats] = await Promise.all([
    applyOutreachLeadFilters(
      supabaseAdmin
        .from('marketing_outreach_leads')
        .select(`${LEAD_LIST_COLUMNS}, conversation_summary`, { count: 'exact' }),
      params
    )
      .order('created_at', { ascending: false })
      .range(from, to),
    fetchOutreachLeadStats(),
  ]);

  if (leadsRes.error) throw leadsRes.error;

  return {
    leads: ((leadsRes.data || []) as any[]).map((row) => ({
      ...row,
      business_emails: normalizeBusinessEmails(row.business_emails),
      conversion_summary: row.conversions?.summary || row.conversion_summary || null,
      conversion_events: Array.isArray(row.conversions?.events) ? row.conversions.events : (row.conversion_events || []),
    })) as MarketingOutreachLead[],
    totalCount: leadsRes.count || 0,
    stats,
  };
}
