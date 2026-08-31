'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { buildSearchOrClause } from '@/lib/postgrest-search';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  reviews?: any[];
  totalCount?: number;
  stats?: {
    all: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  sparklines?: Record<string, number[]>;
  error?: string;
}

export interface GetReviewsParams {
  page?: number;
  pageSize?: number;
  statusFilter?: 'all' | 'approved' | 'rejected' | 'pending';
  searchQuery?: string;
  sortBy?: 'review_date' | 'reviewer_name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated reviews list using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') view.
 */
export async function getReviewsAction(
  params: GetReviewsParams,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const {
      page = 1,
      pageSize = 20,
      statusFilter = 'all',
      searchQuery = '',
      sortBy = 'review_date',
      sortOrder = 'desc',
    } = params;

    let query = supabaseAdmin
      .from('reviews')
      .select(
        `
        *,
        ai_tools:tool_id (
          tool_id,
          tool_site_url,
          favicon_url,
          tool_info
        )
      `,
        { count: 'exact' }
      );

    // Apply search filter if present
    const searchOrClause = buildSearchOrClause(
      ['reviewer_name', 'review_text'],
      searchQuery
    );
    if (searchOrClause) {
      query = query.or(searchOrClause);
    }

    // Apply status filter
    if (statusFilter === 'approved') {
      query = query.or('status.eq.show,status.eq.approved');
    } else if (statusFilter === 'rejected') {
      query = query.or('status.eq.hide,status.eq.rejected');
    } else if (statusFilter === 'pending') {
      query = query.eq('status', 'pending');
    }

    // Apply sorting and pagination
    const sortCol = sortBy === 'review_date' ? 'review_date' : 'reviewer_name';
    query = query
      .order(sortCol, { ascending: sortOrder === 'asc' })
      .order('review_id', { ascending: sortOrder === 'asc' });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      success: true,
      reviews: data || [],
      totalCount: count || 0,
    };
  } catch (err: any) {
    console.error('getReviewsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch reviews.',
    };
  }
}

/**
 * Fetch reviews statistics and 7-day sparkline trends using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') view.
 */
export async function getReviewStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'view');
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
      { count: cApproved },
      { count: cShow },
      { count: cRejected },
      { count: cHide },
      { count: cPending },
      { data: recentReviews },
    ] = await Promise.all([
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'show'),
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'hide'),
      supabaseAdmin.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin
        .from('reviews')
        .select('review_date, status')
        .gte('review_date', startDateISO)
        .limit(5000),
    ]);

    const all = cAll || 0;
    const approved = (cApproved || 0) + (cShow || 0);
    const rejected = (cRejected || 0) + (cHide || 0);
    const pending = cPending || 0;

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      approved: new Array(days).fill(0),
      rejected: new Array(days).fill(0),
      pending: new Array(days).fill(0),
    };

    if (recentReviews && Array.isArray(recentReviews)) {
      const trendMaps: Record<string, Record<string, number>> = {
        all: {},
        approved: {},
        rejected: {},
        pending: {},
      };

      dateKeys.forEach((dk) => {
        trendMaps.all[dk] = 0;
        trendMaps.approved[dk] = 0;
        trendMaps.rejected[dk] = 0;
        trendMaps.pending[dk] = 0;
      });

      recentReviews.forEach((r: any) => {
        if (!r.review_date) return;
        const rDate = new Date(r.review_date).toISOString().slice(0, 10);
        if (trendMaps.all[rDate] !== undefined) {
          trendMaps.all[rDate]++;
        }

        const rawStatus = (r.status || '').toLowerCase().trim();
        if (rawStatus === 'approved' || rawStatus === 'show') {
          if (trendMaps.approved[rDate] !== undefined) trendMaps.approved[rDate]++;
        } else if (rawStatus === 'rejected' || rawStatus === 'hide') {
          if (trendMaps.rejected[rDate] !== undefined) trendMaps.rejected[rDate]++;
        } else if (rawStatus === 'pending') {
          if (trendMaps.pending[rDate] !== undefined) trendMaps.pending[rDate]++;
        }
      });

      sparklines.all = dateKeys.map((dk) => trendMaps.all[dk] || 0);
      sparklines.approved = dateKeys.map((dk) => trendMaps.approved[dk] || 0);
      sparklines.rejected = dateKeys.map((dk) => trendMaps.rejected[dk] || 0);
      sparklines.pending = dateKeys.map((dk) => trendMaps.pending[dk] || 0);
    }

    return {
      success: true,
      stats: { all, approved, rejected, pending },
      sparklines,
    };
  } catch (err: any) {
    console.error('getReviewStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch review statistics.',
    };
  }
}

/**
 * Update an existing review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') update.
 */
export async function updateReviewAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = {
      ...formData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err: any) {
    console.error('updateReviewAction error:', err);
    return { success: false, error: err?.message || 'Failed to update review.' };
  }
}

/**
 * Update status of a review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') update.
 */
export async function updateReviewStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateReviewStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update review status.' };
  }
}

/**
 * Delete a review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') delete.
 */
export async function deleteReviewAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteReviewAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete review.' };
  }
}

