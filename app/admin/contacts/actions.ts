'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { buildSearchOrClause } from '@/lib/postgrest-search';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: {
    all: number;
    new: number;
    replied: number;
    hide: number;
  };
  sparklines?: Record<string, number[]>;
}

export interface GetContactsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated contact inquiries using Service Role Key.
 * Verifies caller permissions for 'contacts' view.
 */
export async function getContactsAction(
  params: GetContactsParams,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { page, pageSize, search, status, sortBy = 'created_at', sortOrder = 'desc' } = params;

    let query = supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact' });

    // Safe multi-column search across name, email, and subject
    const searchOrClause = buildSearchOrClause(['name', 'email', 'subject'], search);
    if (searchOrClause) {
      query = query.or(searchOrClause);
    }

    // Status filter handling
    if (status === 'new') {
      query = query.eq('status', 'new');
    } else if (status === 'replied') {
      query = query.eq('status', 'replied');
    } else if (status === 'hide') {
      query = query.or('status.eq.hide,status.eq.hidden');
    }

    // Deterministic sorting
    const sortCol = sortBy === 'name' ? 'name' : 'created_at';
    query = query
      .order(sortCol, { ascending: sortOrder === 'asc' })
      .order('contact_id', { ascending: sortOrder === 'asc' });

    // Pagination range
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: data || [],
      count: count || 0,
    };
  } catch (err: any) {
    console.error('getContactsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch contact inquiries.' };
  }
}

/**
 * Fetch exact stats and 7-day sparklines using Service Role Key.
 * Runs queries in parallel on the server and calculates real daily trend points.
 * Verifies caller permissions for 'contacts' view.
 */
export async function getContactStatsAction(token: string): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // Generate date keys for the last 7 days in YYYY-MM-DD format
    const days = 7;
    const dateKeys: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      new: new Array(days).fill(0),
      replied: new Array(days).fill(0),
      hide: new Array(days).fill(0),
    };

    const statusMap: Record<string, Record<string, number>> = {
      all: {},
      new: {},
      replied: {},
      hide: {},
    };

    ['all', 'new', 'replied', 'hide'].forEach((k) => {
      dateKeys.forEach((dk) => {
        statusMap[k][dk] = 0;
      });
    });

    // Run parallel exact count HEAD requests + 7-day sparkline range query
    const [
      { count: cAll, error: errAll },
      { count: cNew, error: errNew },
      { count: cReplied, error: errReplied },
      { count: cHide, error: errHide },
      { data: recentRows, error: sparkError },
    ] = await Promise.all([
      supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'replied'),
      supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }).or('status.eq.hide,status.eq.hidden'),
      supabaseAdmin
        .from('contacts')
        .select('created_at, status')
        .gte('created_at', startDateISO)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]);

    if (errAll) throw errAll;
    if (errNew) throw errNew;
    if (errReplied) throw errReplied;
    if (errHide) throw errHide;
    if (sparkError) throw sparkError;

    if (recentRows) {
      recentRows.forEach((row: any) => {
        if (!row.created_at) return;
        const dStr = new Date(row.created_at).toISOString().slice(0, 10);
        if (statusMap.all[dStr] !== undefined) statusMap.all[dStr]++;

        let st = (row.status || '').toLowerCase().trim();
        if (st === 'hidden') st = 'hide';
        if (statusMap[st] && statusMap[st][dStr] !== undefined) {
          statusMap[st][dStr]++;
        }
      });

      Object.keys(statusMap).forEach((k) => {
        sparklines[k] = dateKeys.map((dk) => statusMap[k][dk] || 0);
      });
    }

    return {
      success: true,
      stats: {
        all: cAll || 0,
        new: cNew || 0,
        replied: cReplied || 0,
        hide: cHide || 0,
      },
      sparklines,
    };
  } catch (err: any) {
    console.error('getContactStatsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch contact statistics.' };
  }
}

/**
 * Update status of a contact inquiry using Service Role Key.
 * Verifies caller permissions for 'contacts' update.
 */
export async function updateContactStatusAction(
  contactId: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .update({
        status: newStatus,
        replied_at: newStatus === 'replied' ? new Date().toISOString() : undefined,
      })
      .eq('contact_id', contactId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateContactStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update contact status.' };
  }
}

/**
 * Delete a contact inquiry using Service Role Key.
 * Verifies caller permissions for 'contacts' delete.
 */
export async function deleteContactAction(
  contactId: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('contact_id', contactId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteContactAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete contact inquiry.' };
  }
}
