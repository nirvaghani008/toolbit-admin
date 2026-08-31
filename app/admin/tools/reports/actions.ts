'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { buildSearchOrClause } from '@/lib/postgrest-search';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  reports?: any[];
  totalCount?: number;
  stats?: {
    all: number;
    notWorking: number;
    falseInfo: number;
    needsReview: number;
    detailMismatch: number;
    otherIssue: number;
  };
  sparklines?: Record<string, number[]>;
  tool?: any;
  error?: string;
}

export interface GetToolReportsParams {
  page?: number;
  pageSize?: number;
  typeFilter?: string;
  searchQuery?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated tool reports list with enriched submitter metadata using Service Role Key.
 * Verifies caller permissions for 'reports' (or parent 'tools') view.
 */
export async function getToolReportsAction(
  params: GetToolReportsParams,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reports', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const {
      page = 1,
      pageSize = 20,
      typeFilter = 'all',
      searchQuery = '',
      sortOrder = 'desc',
    } = params;

    let query = supabaseAdmin
      .from('tool_reports')
      .select(
        '*, ai_tools:tool_id(tool_id, favicon_url, tool_site_url, tool_url, tool_info)',
        { count: 'exact' }
      );

    const searchOrClause = buildSearchOrClause(
      ['report_type', 'description'],
      searchQuery
    );
    if (searchOrClause) {
      query = query.or(searchOrClause);
    }

    if (typeFilter !== 'all') {
      const normFilter = typeFilter.toLowerCase();
      if (normFilter === 'not working') {
        query = query.in('report_type', ['not working', 'not_working']);
      } else if (normFilter === 'false info') {
        query = query.in('report_type', ['false info', 'false_info']);
      } else if (normFilter === 'needs review' || normFilter === 'need review') {
        query = query.in('report_type', [
          'needs review',
          'need review',
          'needs_review',
          'need_review',
          'need to review',
          'need_to_review',
          'nees review',
          'nees_review',
        ]);
      } else if (normFilter === 'detail mismatch') {
        query = query.in('report_type', ['detail mismatch', 'detail_mismatch']);
      } else if (normFilter === 'other issue' || normFilter === 'other') {
        query = query.not(
          'report_type',
          'in',
          '("not working","not_working","false info","false_info","needs review","need review","needs_review","need_review","need to review","need_to_review","nees review","nees_review","detail mismatch","detail_mismatch")'
        );
      } else {
        const spaceFormat = typeFilter.replace(/_/g, ' ');
        const underscoreFormat = typeFilter.replace(/ /g, '_');
        query = query.in('report_type', [spaceFormat, underscoreFormat]);
      }
    }

    query = query
      .order('created_at', { ascending: sortOrder === 'asc' })
      .order('id', { ascending: sortOrder === 'asc' });

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Enrich submitter metadata for user_ids
    const userMap: Record<string, any> = {};
    const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      try {
        const { data: usersData, error: rpcErr } = await supabaseAdmin.rpc(
          'get_users_by_ids',
          { p_ids: userIds }
        );
        let list = usersData;
        if (rpcErr) {
          const { data: fallbackData } = await supabaseAdmin.rpc(
            'get_admin_users',
            { p_limit: 5000 }
          );
          list = fallbackData;
        }

        (list || []).forEach((u: any) => {
          if (u?.id) {
            userMap[String(u.id).toLowerCase()] = {
              id: u.id,
              email: u.email || null,
              full_name: u.full_name || u.name || null,
              avatar_url: u.avatar_url || u.picture || null,
            };
          }
        });
      } catch (e) {
        console.warn('Error fetching submitters via service role:', e);
      }
    }

    const enriched = (data || []).map((r: any) => {
      const sKey = r.user_id ? String(r.user_id).toLowerCase() : '';
      return {
        ...r,
        submitter: sKey ? userMap[sKey] || null : null,
      };
    });

    return {
      success: true,
      reports: enriched,
      totalCount: count || 0,
    };
  } catch (err: any) {
    console.error('getToolReportsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch tool reports.',
    };
  }
}

/**
 * Fetch tool report statistics and 7-day sparkline trends using Service Role Key.
 * Verifies caller permissions for 'reports' (or parent 'tools') view.
 */
export async function getToolReportStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reports', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const days = 7;
    const dateKeys: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';

    const [
      { count: cAll },
      { count: cNW },
      { count: cFI },
      { count: cNR },
      { count: cDM },
      { data: recentRecords },
    ] = await Promise.all([
      supabaseAdmin.from('tool_reports').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['not working', 'not_working']),
      supabaseAdmin.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['false info', 'false_info']),
      supabaseAdmin.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', [
        'needs review', 'need review', 'needs_review', 'need_review',
        'need to review', 'need_to_review', 'nees review', 'nees_review'
      ]),
      supabaseAdmin.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['detail mismatch', 'detail_mismatch']),
      supabaseAdmin
        .from('tool_reports')
        .select('created_at, report_type')
        .gte('created_at', startDateISO)
        .limit(5000),
    ]);

    const knownCount = (cNW || 0) + (cFI || 0) + (cNR || 0) + (cDM || 0);
    const cOther = Math.max(0, (cAll || 0) - knownCount);

    const stats = {
      all: cAll || 0,
      notWorking: cNW || 0,
      falseInfo: cFI || 0,
      needsReview: cNR || 0,
      detailMismatch: cDM || 0,
      otherIssue: cOther,
    };

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      notWorking: new Array(days).fill(0),
      falseInfo: new Array(days).fill(0),
      needsReview: new Array(days).fill(0),
      detailMismatch: new Array(days).fill(0),
      otherIssue: new Array(days).fill(0),
    };

    if (recentRecords && Array.isArray(recentRecords)) {
      const trendMaps: Record<string, Record<string, number>> = {
        all: {},
        notWorking: {},
        falseInfo: {},
        needsReview: {},
        detailMismatch: {},
        otherIssue: {},
      };

      Object.keys(trendMaps).forEach((k) => {
        dateKeys.forEach((dk) => {
          trendMaps[k][dk] = 0;
        });
      });

      recentRecords.forEach((r: any) => {
        if (!r.created_at) return;
        const rDate = new Date(r.created_at).toISOString().slice(0, 10);
        if (trendMaps.all[rDate] !== undefined) {
          trendMaps.all[rDate]++;
        }

        const norm = (r.report_type || '').toLowerCase().trim();
        if (norm === 'not working' || norm === 'not_working') {
          if (trendMaps.notWorking[rDate] !== undefined) trendMaps.notWorking[rDate]++;
        } else if (norm === 'false info' || norm === 'false_info') {
          if (trendMaps.falseInfo[rDate] !== undefined) trendMaps.falseInfo[rDate]++;
        } else if (
          norm === 'needs review' || norm === 'need review' ||
          norm === 'needs_review' || norm === 'need_review' ||
          norm === 'need to review' || norm === 'need_to_review' ||
          norm === 'nees review' || norm === 'nees_review'
        ) {
          if (trendMaps.needsReview[rDate] !== undefined) trendMaps.needsReview[rDate]++;
        } else if (norm === 'detail mismatch' || norm === 'detail_mismatch') {
          if (trendMaps.detailMismatch[rDate] !== undefined) trendMaps.detailMismatch[rDate]++;
        } else {
          if (trendMaps.otherIssue[rDate] !== undefined) trendMaps.otherIssue[rDate]++;
        }
      });

      sparklines.all = dateKeys.map((dk) => trendMaps.all[dk] || 0);
      sparklines.notWorking = dateKeys.map((dk) => trendMaps.notWorking[dk] || 0);
      sparklines.falseInfo = dateKeys.map((dk) => trendMaps.falseInfo[dk] || 0);
      sparklines.needsReview = dateKeys.map((dk) => trendMaps.needsReview[dk] || 0);
      sparklines.detailMismatch = dateKeys.map((dk) => trendMaps.detailMismatch[dk] || 0);
      sparklines.otherIssue = dateKeys.map((dk) => trendMaps.otherIssue[dk] || 0);
    }

    return {
      success: true,
      stats,
      sparklines,
    };
  } catch (err: any) {
    console.error('getToolReportStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch report statistics.',
    };
  }
}

/**
 * Fetch complete AI tool record for editing directly from report.
 * Verifies caller permissions for 'reports' or 'tools' view.
 */
export async function getToolByIdAction(
  toolId: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reports', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('ai_tools')
      .select('*')
      .eq('tool_id', toolId)
      .single();

    if (error) throw error;

    return { success: true, tool: data };
  } catch (err: any) {
    console.error('getToolByIdAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch tool record.',
    };
  }
}

/**
 * Permanently delete a tool report using service_role key.
 * Requires `reports.can_delete` permission.
 */
export async function deleteToolReportAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reports', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('tool_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteToolReportAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete tool report.',
    };
  }
}

/**
 * Update a tool report using service_role key.
 * Requires `reports.can_update` permission.
 */
export async function updateToolReportAction(
  id: number | string,
  payload: any,
  token: string
): Promise<ActionResponse<any>> {
  try {
    const auth = await verifyAdminPermission(token, 'reports', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('tool_reports')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    console.error('updateToolReportAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to update tool report.',
    };
  }
}

