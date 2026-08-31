'use server';

import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { SocialItem } from '@/components/socials/SocialTable';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: {
    all: number;
    show: number;
    hide: number;
    draft: number;
    featured: number;
  };
  sparklines?: Record<string, number[]>;
}

export interface GetSocialsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  platform?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const ALLOWED_PLATFORMS = ['YouTube', 'X (Twitter)', 'Twitter', 'Reddit', 'Instagram'] as const;

/**
 * Zod validation schema for querying socials with safe boundary constraints
 */
const GetSocialsParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().max(300).optional().default(''),
  status: z.string().max(50).optional().default('all'),
  platform: z.string().max(50).optional().default('all'),
  sortBy: z.enum(['id', 'title', 'published_date', 'created_at', 'status', 'platform']).catch('id'),
  sortOrder: z.enum(['asc', 'desc']).catch('desc'),
});

/**
 * Format and map PostgreSQL error codes into friendly user messages
 */
function formatPostgresError(error: any, defaultMsg: string): string {
  if (!error) return defaultMsg;
  const code = error.code;
  const message = error.message || '';
  const details = error.details || '';
  const combined = `${message} ${details}`.toLowerCase();

  if (code === '23505') {
    if (combined.includes('source_url') || combined.includes('socials_source_url_key')) {
      return 'Duplicate URL: A social update with this Source URL already exists.';
    }
    return 'A duplicate record already exists in the database.';
  }

  if (code === '23514') {
    if (combined.includes('content_type_check')) {
      return 'Invalid Content Type: Please select from the allowed content type options.';
    }
    if (combined.includes('socials_status_check')) {
      return 'Invalid Status: Allowed status values are Show or Hide.';
    }
    if (combined.includes('socials_source_url_check')) {
      return 'Source URL cannot be empty.';
    }
    if (combined.includes('socials_title_check')) {
      return 'Post title cannot be empty.';
    }
    return 'Validation failed against database constraints.';
  }

  if (code === '23502') {
    return `Required field missing: ${error.column || 'Please fill in all mandatory fields.'}`;
  }

  if (code === '22P02') {
    return 'Invalid data format or enum value provided.';
  }

  if (code === 'PGRST116') {
    return 'Social post record not found or has already been removed.';
  }

  return error.message || defaultMsg;
}

/**
 * Format and normalize platform string to match database enum
 */
function normalizePlatform(platform: string | undefined): 'YouTube' | 'X (Twitter)' | 'Reddit' | 'Instagram' {
  if (!platform) return 'X (Twitter)';
  const p = platform.trim().toLowerCase();
  if (p.includes('youtube')) return 'YouTube';
  if (p.includes('twitter') || p === 'x' || p.includes('x (twitter)')) return 'X (Twitter)';
  if (p.includes('reddit')) return 'Reddit';
  if (p.includes('instagram')) return 'Instagram';
  return 'X (Twitter)';
}

/**
 * Sanitize JSON metadata object to prevent malformed or unbounded objects
 */
function sanitizeJsonData(rawJson: any): Record<string, any> {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    return {};
  }
  const clean: Record<string, any> = {};
  const allowedKeys = [
    'source_name', 'video_id', 'author', 'subreddit',
    'content_kind', 'publish_date', 'duration', 'reference_tool_name',
    'thumbnails', 'oembedHtml', 'oembed_html', 'html', 'embed_code'
  ];

  Object.entries(rawJson).forEach(([key, val]) => {
    const trimmedKey = key.trim();
    if (!trimmedKey || trimmedKey.length > 100) return;

    if (trimmedKey === 'thumbnails' && Array.isArray(val)) {
      clean.thumbnails = val
        .filter((t: any) => t && typeof t === 'object' && typeof t.url === 'string' && t.url.trim() !== '')
        .slice(0, 10)
        .map((t: any) => ({
          url: t.url.trim(),
          ...(t.width && !isNaN(Number(t.width)) ? { width: Number(t.width) } : {}),
          ...(t.height && !isNaN(Number(t.height)) ? { height: Number(t.height) } : {}),
        }));
      return;
    }

    if (typeof val === 'string') {
      clean[trimmedKey] = val.trim();
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[trimmedKey] = val;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[trimmedKey] = val;
    }
  });

  return clean;
}

/**
 * Fetch paginated list of social posts with search, platform/status filtering, and sorting.
 * Requires `socials.can_view` permission.
 */
export async function getSocialsAction(
  params: GetSocialsParams,
  token: string
): Promise<ActionResponse<SocialItem[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const validated = GetSocialsParamsSchema.safeParse(params);
    if (!validated.success) {
      return { success: false, error: 'Invalid search or pagination parameters.' };
    }

    const {
      page,
      pageSize,
      search,
      status,
      platform,
      sortBy,
      sortOrder,
    } = validated.data;

    let query = supabaseAdmin
      .from('socials')
      .select('*', { count: 'exact' });

    // Status filtering
    if (status === 'show') {
      query = query.or('status.ilike.show%,status.ilike.active%,status.ilike.published%,status.is.null');
    } else if (status === 'featured') {
      query = query.eq('is_featured', true);
    } else if (status === 'hide') {
      query = query.ilike('status', 'hide%');
    } else if (status === 'draft') {
      query = query.ilike('status', 'draft%');
    } else if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Platform filtering
    if (platform !== 'all') {
      query = query.eq('platform', platform);
    }

    // Search query with PostgREST character sanitization
    const cleanSearch = search.replace(/[,()]/g, ' ').trim();
    if (cleanSearch) {
      const KNOWN_PLATFORMS = ['YouTube', 'Twitter', 'X (Twitter)', 'Reddit', 'Instagram'];
      const matched = KNOWN_PLATFORMS.filter(p => p.toLowerCase().includes(cleanSearch.toLowerCase()));
      if (matched.length > 0) {
        const platformConds = matched.map(p => `platform.eq.${p}`).join(',');
        query = query.or(`title.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%,${platformConds}`);
      } else {
        query = query.or(`title.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to fetch social posts.') };
    }

    return {
      success: true,
      data: (data as SocialItem[]) || [],
      count: count ?? 0,
    };
  } catch (err: any) {
    console.error('getSocialsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch social posts.' };
  }
}

/**
 * Fetch stats counts and 7-day sparkline trend data for socials in 1 unified server call.
 * Requires `socials.can_view` permission.
 */
export async function getSocialsStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'view');
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

    // Execute exact head counts and recent sparkline records concurrently in parallel
    const [totalRes, showRes, hideRes, draftRes, featuredRes, sparklineDataRes] = await Promise.all([
      supabaseAdmin.from('socials').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('socials').select('*', { count: 'exact', head: true }).or('status.ilike.show%,status.ilike.active%,status.ilike.published%,status.is.null'),
      supabaseAdmin.from('socials').select('*', { count: 'exact', head: true }).ilike('status', 'hide%'),
      supabaseAdmin.from('socials').select('*', { count: 'exact', head: true }).ilike('status', 'draft%'),
      supabaseAdmin.from('socials').select('*', { count: 'exact', head: true }).eq('is_featured', true),
      supabaseAdmin.from('socials').select('created_at, status, is_featured').gte('created_at', startDateISO).limit(2000),
    ]);

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      show: new Array(days).fill(0),
      hide: new Array(days).fill(0),
      draft: new Array(days).fill(0),
      featured: new Array(days).fill(0),
    };

    if (sparklineDataRes.data) {
      const statusMap: Record<string, Record<string, number>> = {
        all: {},
        show: {},
        hide: {},
        draft: {},
        featured: {},
      };
      dateKeys.forEach(dk => {
        statusMap.all[dk] = 0;
        statusMap.show[dk] = 0;
        statusMap.hide[dk] = 0;
        statusMap.draft[dk] = 0;
        statusMap.featured[dk] = 0;
      });

      sparklineDataRes.data.forEach((row: any) => {
        if (!row.created_at) return;
        const dateStr = new Date(row.created_at).toISOString().slice(0, 10);
        if (statusMap.all[dateStr] !== undefined) {
          statusMap.all[dateStr]++;
        }
        if (row.is_featured && statusMap.featured[dateStr] !== undefined) {
          statusMap.featured[dateStr]++;
        }

        const rawStatus = (row.status || '').toLowerCase();
        let targetKey: string | null = null;
        if (rawStatus.startsWith('show') || rawStatus === 'active' || rawStatus === 'published' || !row.status) {
          targetKey = 'show';
        } else if (rawStatus.startsWith('hide')) {
          targetKey = 'hide';
        } else if (rawStatus.startsWith('draft')) {
          targetKey = 'draft';
        }

        if (targetKey && statusMap[targetKey][dateStr] !== undefined) {
          statusMap[targetKey][dateStr]++;
        }
      });

      ['all', 'show', 'hide', 'draft', 'featured'].forEach(k => {
        sparklines[k] = dateKeys.map(dk => statusMap[k][dk] || 0);
      });
    }

    return {
      success: true,
      stats: {
        all: totalRes.count ?? 0,
        show: showRes.count ?? 0,
        hide: hideRes.count ?? 0,
        draft: draftRes.count ?? 0,
        featured: featuredRes.count ?? 0,
      },
      sparklines,
    };
  } catch (err: any) {
    console.error('getSocialsStatsAction error:', err);
    return { success: false, error: err?.message || 'Failed to fetch social statistics.' };
  }
}

/**
 * Create a new social post using Service Role Key with sanitized column whitelisting.
 * Verifies caller permissions for 'socials' insert.
 */
export async function createSocialAction(
  formData: any,
  token: string
): Promise<ActionResponse<SocialItem>> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    if (!formData || typeof formData !== 'object') {
      return { success: false, error: 'Invalid form data provided.' };
    }

    const title = typeof formData.title === 'string' ? formData.title.trim() : '';
    if (!title) {
      return { success: false, error: 'Post title is required.' };
    }

    const sourceUrl = typeof formData.source_url === 'string' ? formData.source_url.trim() : '';
    if (!sourceUrl) {
      return { success: false, error: 'Source URL is required.' };
    }

    const payload: Record<string, any> = {
      title,
      description: typeof formData.description === 'string' && formData.description.trim() ? formData.description.trim() : null,
      platform: normalizePlatform(formData.platform),
      content_type: Array.isArray(formData.content_type)
        ? formData.content_type.filter(Boolean)
        : [typeof formData.content_type === 'string' && formData.content_type ? formData.content_type : 'Announcement'],
      source_url: sourceUrl,
      published_date: (formData.published_date && !isNaN(Date.parse(formData.published_date)))
        ? new Date(formData.published_date).toISOString()
        : new Date().toISOString(),
      tags: Array.isArray(formData.tags)
        ? formData.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [],
      is_featured: Boolean(formData.is_featured),
      is_trending: Boolean(formData.is_trending),
      status: (formData.status || 'Show').toLowerCase().startsWith('h') ? 'Hide' : 'Show',
      json_data: sanitizeJsonData(formData.json_data),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('socials')
      .insert([payload])
      .select()
      .single();

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to create social post.') };
    }

    return { success: true, data: data as SocialItem };
  } catch (err: any) {
    console.error('createSocialAction error:', err);
    return { success: false, error: err?.message || 'Failed to create social post.' };
  }
}

/**
 * Update an existing social post using Service Role Key with sanitized payload.
 * Verifies caller permissions for 'socials' update.
 */
export async function updateSocialAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse<SocialItem>> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numericId = Number(id);
    if (!id || isNaN(numericId) || numericId <= 0) {
      return { success: false, error: 'Invalid social post ID.' };
    }

    if (!formData || typeof formData !== 'object') {
      return { success: false, error: 'Invalid form data provided.' };
    }

    const title = typeof formData.title === 'string' ? formData.title.trim() : '';
    if (!title) {
      return { success: false, error: 'Post title is required.' };
    }

    const sourceUrl = typeof formData.source_url === 'string' ? formData.source_url.trim() : '';
    if (!sourceUrl) {
      return { success: false, error: 'Source URL is required.' };
    }

    const payload: Record<string, any> = {
      title,
      description: typeof formData.description === 'string' && formData.description.trim() ? formData.description.trim() : null,
      platform: normalizePlatform(formData.platform),
      content_type: Array.isArray(formData.content_type)
        ? formData.content_type.filter(Boolean)
        : [typeof formData.content_type === 'string' && formData.content_type ? formData.content_type : 'Announcement'],
      source_url: sourceUrl,
      published_date: (formData.published_date && !isNaN(Date.parse(formData.published_date)))
        ? new Date(formData.published_date).toISOString()
        : null,
      tags: Array.isArray(formData.tags)
        ? formData.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [],
      is_featured: Boolean(formData.is_featured),
      is_trending: Boolean(formData.is_trending),
      status: (formData.status || 'Show').toLowerCase().startsWith('h') ? 'Hide' : 'Show',
      json_data: sanitizeJsonData(formData.json_data),
    };

    const { data, error } = await supabaseAdmin
      .from('socials')
      .update(payload)
      .eq('id', numericId)
      .select()
      .single();

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to update social post.') };
    }

    return { success: true, data: data as SocialItem };
  } catch (err: any) {
    console.error('updateSocialAction error:', err);
    return { success: false, error: err?.message || 'Failed to update social post.' };
  }
}

/**
 * Update status of a social post using Service Role Key.
 * Verifies caller permissions for 'socials' update.
 */
export async function updateSocialStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numericId = Number(id);
    if (!id || isNaN(numericId) || numericId <= 0) {
      return { success: false, error: 'Invalid social post ID.' };
    }

    const formattedStatus = (newStatus || 'Show').toLowerCase().startsWith('h') ? 'Hide' : 'Show';

    const { error } = await supabaseAdmin
      .from('socials')
      .update({ status: formattedStatus })
      .eq('id', numericId);

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to update social post status.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateSocialStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update social post status.' };
  }
}

/**
 * Delete a social post using Service Role Key.
 * Verifies caller permissions for 'socials' delete.
 */
export async function deleteSocialAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numericId = Number(id);
    if (!id || isNaN(numericId) || numericId <= 0) {
      return { success: false, error: 'Invalid social post ID.' };
    }

    const { error } = await supabaseAdmin
      .from('socials')
      .delete()
      .eq('id', numericId);

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to delete social post.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteSocialAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete social post.' };
  }
}
