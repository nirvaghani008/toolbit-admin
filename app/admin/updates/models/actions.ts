'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { Model } from '@/components/models/ModelTable';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: {
    all: number;
    show: number;
    hide: number;
    delete: number;
  };
  sparklines?: Record<string, number[]>;
}

export interface GetModelsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated list of models with search, sorting, and status filtering.
 * Requires `models.can_view` permission.
 */
export async function getModelsAction(
  params: GetModelsParams,
  token: string
): Promise<ActionResponse<Model[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const {
      page = 1,
      pageSize = 12,
      search = '',
      status = 'all',
      sortBy = 'id',
      sortOrder = 'desc',
    } = params;

    let query = supabaseAdmin.from('models').select('*', { count: 'exact' });

    if (status === 'show') {
      query = query.or(
        'status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null'
      );
    } else if (status !== 'all') {
      query = query.eq('status', status);
    }

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      query = query.or(
        `name.ilike.%${trimmedSearch}%,provider.ilike.%${trimmedSearch}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortCol = sortBy === 'created_at' || sortBy === 'id' ? 'id' : sortBy;

    query = query.order(sortCol, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: (data as Model[]) || [],
      count: count ?? 0,
    };
  } catch (err: any) {
    console.error('getModelsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch models.',
    };
  }
}

/**
 * Fetch stats counts and 7-day sparkline trend data for models.
 * Requires `models.can_view` permission.
 */
export async function getModelStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // 1. Total models count
    const { count: totalCount } = await supabaseAdmin
      .from('models')
      .select('*', { count: 'exact', head: true });

    // 2. Active / Show models count
    const { count: showCount } = await supabaseAdmin
      .from('models')
      .select('*', { count: 'exact', head: true })
      .or(
        'status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null'
      );

    // 3. Hide count
    const { count: hideCount } = await supabaseAdmin
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'hide');

    // 4. Delete count
    const { count: deleteCount } = await supabaseAdmin
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'delete');

    // 5. 7-day sparkline date keys
    const days = 7;
    const dateKeys: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }

    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';
    const { data: recentRecords } = await supabaseAdmin
      .from('models')
      .select('release_date, status')
      .gte('release_date', startDateISO)
      .limit(2000);

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      show: new Array(days).fill(0),
      hide: new Array(days).fill(0),
      delete: new Array(days).fill(0),
    };

    if (recentRecords) {
      const statusMap: Record<string, Record<string, number>> = {
        all: {},
        show: {},
        hide: {},
        delete: {},
      };
      dateKeys.forEach((dk) => {
        statusMap.all[dk] = 0;
        statusMap.show[dk] = 0;
        statusMap.hide[dk] = 0;
        statusMap.delete[dk] = 0;
      });

      recentRecords.forEach((row: any) => {
        if (!row.release_date) return;
        const dateStr = new Date(row.release_date).toISOString().slice(0, 10);
        if (statusMap.all[dateStr] !== undefined) {
          statusMap.all[dateStr]++;
        }

        const rawStatus = (row.status || '').toLowerCase();
        let targetKey: string | null = null;
        if (rawStatus === 'show' || rawStatus === 'published' || rawStatus === 'active' || rawStatus.startsWith('show')) {
          targetKey = 'show';
        } else if (rawStatus === 'hide') {
          targetKey = 'hide';
        } else if (rawStatus === 'delete') {
          targetKey = 'delete';
        }

        if (targetKey && statusMap[targetKey][dateStr] !== undefined) {
          statusMap[targetKey][dateStr]++;
        }
      });

      ['all', 'show', 'hide', 'delete'].forEach((k) => {
        sparklines[k] = dateKeys.map((dk) => statusMap[k][dk] || 0);
      });
    }

    return {
      success: true,
      stats: {
        all: totalCount ?? 0,
        show: showCount ?? 0,
        hide: hideCount ?? 0,
        delete: deleteCount ?? 0,
      },
      sparklines,
    };
  } catch (err: any) {
    console.error('getModelStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch model statistics.',
    };
  }
}

/**
 * Create a new AI model record using service_role key.
 * Requires `models.can_insert` permission.
 */
export async function createModelAction(
  data: Partial<Model>,
  token: string
): Promise<ActionResponse<Model>> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload: any = {
      ...data,
      slug: data.model_id_slug || data.slug,
    };

    const { data: created, error } = await supabaseAdmin
      .from('models')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Duplicate URL slug. This AI model URL slug is already in use.',
        };
      }
      throw error;
    }

    return {
      success: true,
      data: created as Model,
    };
  } catch (err: any) {
    console.error('createModelAction error:', err);
    return {
      success: false,
      error: err?.message || 'An error occurred while creating the model.',
    };
  }
}

/**
 * Update an existing AI model record using service_role key.
 * Requires `models.can_update` permission.
 */
export async function updateModelAction(
  id: number | string,
  data: Partial<Model>,
  token: string
): Promise<ActionResponse<Model>> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload: any = {
      ...data,
      slug: data.model_id_slug || data.slug,
    };

    const { data: updated, error } = await supabaseAdmin
      .from('models')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Duplicate URL slug. This AI model URL slug is already in use.',
        };
      }
      throw error;
    }

    return {
      success: true,
      data: updated as Model,
    };
  } catch (err: any) {
    console.error('updateModelAction error:', err);
    return {
      success: false,
      error: err?.message || 'An error occurred while saving the model.',
    };
  }
}

/**
 * Update the status of an AI model record using service_role key.
 * Requires `models.can_update` permission.
 */
export async function updateModelStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('models')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateModelStatusAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to update model status.',
    };
  }
}

/**
 * Permanently delete an AI model record using service_role key.
 * Requires `models.can_delete` permission.
 */
export async function deleteModelAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'models', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('models')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteModelAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete model.',
    };
  }
}
