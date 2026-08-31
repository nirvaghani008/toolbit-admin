'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { buildSearchOrClause } from '@/lib/postgrest-search';
import { NewsItem } from '@/components/news/NewsTable';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: {
    all: number;
    published: number;
    hide: number;
  };
  sparklines?: Record<string, number[]>;
}

export interface GetNewsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated list of news articles with search, sorting, and status filtering.
 * Requires `news.can_view` permission.
 */
export async function getNewsAction(
  params: GetNewsParams,
  token: string
): Promise<ActionResponse<NewsItem[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const {
      page = 1,
      pageSize = 12,
      search = '',
      status = 'all',
      sortBy = 'news_id',
      sortOrder = 'desc',
    } = params;

    let query = supabaseAdmin
      .from('news')
      .select('news_id, title, summary, source_name, source_url, favicon_url, published_date, categories, status, created_at', { count: 'exact' });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const orClause = buildSearchOrClause(['title', 'summary', 'source_name'], search);
    if (orClause) {
      query = query.or(orClause);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const validSortCols = ['news_id', 'title', 'source_name', 'published_date', 'created_at', 'status'];
    const sortCol = validSortCols.includes(sortBy) ? sortBy : 'news_id';

    query = query.order(sortCol, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: (data as NewsItem[]) || [],
      count: count ?? 0,
    };
  } catch (err: any) {
    console.error('getNewsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch news articles.',
    };
  }
}

/**
 * Fetch stats counts and 7-day sparkline trend data for news.
 * Requires `news.can_view` permission.
 */
export async function getNewsStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'view');
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

    // 1. Execute head counts and recent sparkline date records concurrently in parallel
    const [totalRes, publishedRes, hideRes, sparklineDataRes] = await Promise.all([
      supabaseAdmin.from('news').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('news').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabaseAdmin.from('news').select('*', { count: 'exact', head: true }).eq('status', 'hide'),
      supabaseAdmin.from('news').select('created_at, status').gte('created_at', startDateISO).limit(2000),
    ]);

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      published: new Array(days).fill(0),
      hide: new Array(days).fill(0),
    };

    if (sparklineDataRes.data) {
      const statusMap: Record<string, Record<string, number>> = {
        all: {},
        published: {},
        hide: {},
      };
      dateKeys.forEach((dk) => {
        statusMap.all[dk] = 0;
        statusMap.published[dk] = 0;
        statusMap.hide[dk] = 0;
      });

      sparklineDataRes.data.forEach((row: any) => {
        if (!row.created_at) return;
        const dateStr = new Date(row.created_at).toISOString().slice(0, 10);
        if (statusMap.all[dateStr] !== undefined) {
          statusMap.all[dateStr]++;
        }
        const st = (row.status || '').toLowerCase();
        if (statusMap[st] && statusMap[st][dateStr] !== undefined) {
          statusMap[st][dateStr]++;
        }
      });

      ['all', 'published', 'hide'].forEach((k) => {
        sparklines[k] = dateKeys.map((dk) => statusMap[k][dk] || 0);
      });
    }

    return {
      success: true,
      stats: {
        all: totalRes.count ?? 0,
        published: publishedRes.count ?? 0,
        hide: hideRes.count ?? 0,
      },
      sparklines,
    };
  } catch (err: any) {
    console.error('getNewsStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch news statistics.',
    };
  }
}

/**
 * Create a new news article using Service Role Key.
 * Verifies caller permissions for 'news' insert.
 */
export async function createNewsAction(
  formData: any,
  token: string
): Promise<ActionResponse<NewsItem>> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload: Record<string, any> = {
      title: formData.title,
      summary: formData.summary || null,
      source_name: formData.source_name || null,
      source_url: formData.source_url || null,
      favicon_url: formData.favicon_url || null,
      published_date: formData.published_date || new Date().toISOString(),
      status: formData.status || 'published',
      categories: Array.isArray(formData.categories) ? formData.categories : [],
      created_at: new Date().toISOString(),
    };

    if (formData.news_id) {
      payload.news_id = formData.news_id;
    } else {
      // Safe fallback for live database before IDENTITY migration is executed:
      const { data: maxIdData } = await supabaseAdmin
        .from('news')
        .select('news_id')
        .order('news_id', { ascending: false })
        .limit(1);
      if (maxIdData && maxIdData.length > 0 && maxIdData[0].news_id) {
        payload.news_id = maxIdData[0].news_id + 1;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('news')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const detail = (error.details || error.message || '').toLowerCase();
        if (detail.includes('source_url') || error.message?.includes('news_source_url_key')) {
          return { success: false, error: 'Duplicate News URL: An article with this source URL already exists.' };
        }
        return { success: false, error: 'A duplicate news article already exists.' };
      }
      throw error;
    }

    return { success: true, data: data as NewsItem };
  } catch (err: any) {
    console.error('createNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to create news article.' };
  }
}

/**
 * Update an existing news article using Service Role Key.
 * Verifies caller permissions for 'news' update.
 */
export async function updateNewsAction(
  newsId: number | string,
  formData: any,
  token: string
): Promise<ActionResponse<NewsItem>> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload: Record<string, any> = {
      title: formData.title,
      summary: formData.summary || null,
      source_name: formData.source_name || null,
      source_url: formData.source_url || null,
      favicon_url: formData.favicon_url || null,
      published_date: formData.published_date || null,
      status: formData.status || 'published',
      categories: Array.isArray(formData.categories) ? formData.categories : [],
    };

    const { data, error } = await supabaseAdmin
      .from('news')
      .update(payload)
      .eq('news_id', newsId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const detail = (error.details || error.message || '').toLowerCase();
        if (detail.includes('source_url') || error.message?.includes('news_source_url_key')) {
          return { success: false, error: 'Duplicate News URL: An article with this source URL already exists.' };
        }
        return { success: false, error: 'A duplicate news article already exists.' };
      }
      throw error;
    }

    return { success: true, data: data as NewsItem };
  } catch (err: any) {
    console.error('updateNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to update news article.' };
  }
}

/**
 * Update status of a news article using Service Role Key.
 * Verifies caller permissions for 'news' update.
 */
export async function updateNewsStatusAction(
  newsId: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('news')
      .update({ status: newStatus })
      .eq('news_id', newsId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateNewsStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update news status.' };
  }
}

/**
 * Delete a news article using Service Role Key.
 * Verifies caller permissions for 'news' delete.
 */
export async function deleteNewsAction(
  newsId: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('news')
      .delete()
      .eq('news_id', newsId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete news article.' };
  }
}
