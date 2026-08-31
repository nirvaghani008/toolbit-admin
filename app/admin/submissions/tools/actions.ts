'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { buildSearchOrClause } from '@/lib/postgrest-search';
import { getWorkerFetchHeaders } from '@/lib/worker-headers';


export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: Record<string, number>;
  sparklines?: Record<string, number[]>;
}

export interface GetToolSubmissionsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: 'updated_at' | 'created_at' | 'tool_name' | 'id';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch paginated AI tool submissions using service_role key.
 * Verifies caller permissions for 'submissions' or 'tools'.
 */
export async function getToolSubmissionsAction(
  params: GetToolSubmissionsParams,
  token: string
): Promise<ActionResponse> {
  try {
    let auth = await verifyAdminPermission(token, 'submissions', 'view');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'tools', 'view');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { page, pageSize, search, status, sortBy = 'updated_at', sortOrder = 'desc' } = params;

    let query = supabaseAdmin
      .from('ai_tool_submissions')
      .select('*', { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const orClause = buildSearchOrClause(
      [
        'full_name',
        'business_email',
        'tool_site_url',
        'tool_domain',
        'tool_url',
        'tool_info->>toolName',
      ],
      search
    );
    if (orClause) {
      query = query.or(orClause);
    }

    // Map tool_name to the actual JSONB path for true alphabetical sorting
    if (sortBy === 'tool_name') {
      query = query.order('tool_info->>toolName', { ascending: sortOrder === 'asc' });
    } else {
      const validCol = ['updated_at', 'created_at', 'id'].includes(sortBy) ? sortBy : 'updated_at';
      query = query.order(validCol, { ascending: sortOrder === 'asc' });
    }

    // Secondary deterministic sort
    query = query.order('id', { ascending: sortOrder === 'asc' });

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
    console.error('getToolSubmissionsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch tool submissions.',
    };
  }
}

/**
 * Fetch exact stats and 7-day sparklines using optimized indexed queries.
 * Runs in parallel on the server; requires no custom database functions.
 * Verifies caller permissions for 'submissions' or 'tools'.
 */
export async function getToolSubmissionStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    let auth = await verifyAdminPermission(token, 'submissions', 'view');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'tools', 'view');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // 1. Generate 7-day date keys in YYYY-MM-DD format
    const days = 7;
    const dateKeys: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';

    const statuses = ['pending', 'approved', 'draft', 'rejected'];
    const sparklineMap: Record<string, Record<string, number>> = {
      all: {},
      pending: {},
      approved: {},
      draft: {},
      rejected: {},
    };

    ['all', ...statuses].forEach((k) => {
      dateKeys.forEach((dk) => {
        sparklineMap[k][dk] = 0;
      });
    });

    // 2. Execute parallel indexed counts and 7-day date range query on server
    const [
      { count: cAll },
      { count: cPending },
      { count: cApproved },
      { count: cDraft },
      { count: cRejected },
      { data: recentRows, error: rowsError },
    ] = await Promise.all([
      supabaseAdmin.from('ai_tool_submissions').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('ai_tool_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('ai_tool_submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabaseAdmin.from('ai_tool_submissions').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      supabaseAdmin.from('ai_tool_submissions').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabaseAdmin
        .from('ai_tool_submissions')
        .select('updated_at, status')
        .gte('updated_at', startDateISO),
    ]);

    if (rowsError) {
      console.warn('Error fetching 7-day tool submission records:', rowsError);
    }

    // 3. Populate 7-day daily sparkline buckets in memory on the server
    if (recentRows) {
      recentRows.forEach((row: any) => {
        if (!row.updated_at) return;
        const rowDate = new Date(row.updated_at).toISOString().slice(0, 10);

        if (sparklineMap.all[rowDate] !== undefined) {
          sparklineMap.all[rowDate]++;
        }

        const st = String(row.status || '').toLowerCase();
        if (sparklineMap[st] && sparklineMap[st][rowDate] !== undefined) {
          sparklineMap[st][rowDate]++;
        }
      });
    }

    const calculatedSparklines: Record<string, number[]> = {
      all: dateKeys.map((dk) => sparklineMap.all[dk] || 0),
      pending: dateKeys.map((dk) => sparklineMap.pending[dk] || 0),
      approved: dateKeys.map((dk) => sparklineMap.approved[dk] || 0),
      draft: dateKeys.map((dk) => sparklineMap.draft[dk] || 0),
      rejected: dateKeys.map((dk) => sparklineMap.rejected[dk] || 0),
    };

    return {
      success: true,
      stats: {
        all: cAll || 0,
        pending: cPending || 0,
        approved: cApproved || 0,
        draft: cDraft || 0,
        rejected: cRejected || 0,
      },
      sparklines: calculatedSparklines,
    };
  } catch (err: any) {
    console.error('getToolSubmissionStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch submission statistics.',
    };
  }
}

/**
 * Permanently delete an AI tool submission using service_role key.
 * Verifies caller permissions for 'submissions' or 'tools'.
 */
export async function deleteToolSubmissionAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    let auth = await verifyAdminPermission(token, 'submissions', 'delete');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'tools', 'delete');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('ai_tool_submissions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteToolSubmissionAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete tool submission.',
    };
  }
}

/**
 * Update an AI tool submission using service_role key.
 * Verifies caller permissions for 'submissions' or 'tools'.
 */
export async function updateToolSubmissionAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse<any>> {
  try {
    let auth = await verifyAdminPermission(token, 'submissions', 'update');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'tools', 'update');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = {
      ...formData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('ai_tool_submissions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'Duplicate URL slug. This tool URL slug is already in use.',
        };
      }
      throw error;
    }

    // Trigger non-blocking background media enrichment if media assets are missing
    if (id && payload.tool_site_url) {
      const missingMedia: ('favicon' | 'screenshot')[] = [];
      if (!payload.favicon_url) missingMedia.push('favicon');
      if (!payload.tool_screenshot_url) missingMedia.push('screenshot');
      if (missingMedia.length > 0) {
        enrichSubmissionMediaInBackground(id, payload.tool_site_url, missingMedia);
      }
    }

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    console.error('updateToolSubmissionAction error:', err);
    return {
      success: false,
      error: err?.message || 'An error occurred while saving the submission.',
    };
  }
}

/**
 * Asynchronously enriches missing favicon or screenshot for a submission in the background.
 * Calls the `ai-tool-info` worker in pure extraction mode and updates
 * the `ai_tool_submissions` row directly using supabaseAdmin.
 */
export async function enrichSubmissionMediaInBackground(
  submissionId: number | string,
  toolSiteUrl: string,
  missingFields: ('favicon' | 'screenshot')[]
): Promise<void> {
  const targetFields = missingFields.filter((f) => f === 'favicon' || f === 'screenshot');
  if (targetFields.length === 0) return;

  const workerUrl = process.env.AI_TOOL_INFO_WORKER_URL;
  const workerSecret = process.env.AI_TOOL_INFO_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    console.warn('[enrichSubmissionMediaInBackground] Missing AI_TOOL_INFO_WORKER configuration; skipping background media enrichment.');
    return;
  }

  // Fire and forget in the background
  (async () => {
    try {
      console.log(`[enrichSubmissionMediaInBackground] Fetching missing media for submission #${submissionId} (${toolSiteUrl}). Fields: ${targetFields.join(', ')}`);

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: getWorkerFetchHeaders(workerSecret),
        body: JSON.stringify({
          url: toolSiteUrl,
          is_screenshot: targetFields.includes('screenshot'),
          target_fields: targetFields,
        }),
        signal: AbortSignal.timeout(2.5 * 60 * 1000), // 2.5 min max for background crawl
      });

      if (!response.ok) {
        console.warn(`[enrichSubmissionMediaInBackground] Worker returned status ${response.status} for submission #${submissionId}`);
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        favicon_url?: string | null;
        screenshot_url?: string | null;
      };

      if (!result.success) {
        console.warn(`[enrichSubmissionMediaInBackground] Worker extraction unsuccessful for submission #${submissionId}`);
        return;
      }

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      const resolvedFavicon = result.favicon_url || (result as any).data?.favicon_url || (result as any).data?.faviconUrl;
      const resolvedScreenshot = result.screenshot_url || (result as any).data?.tool_screenshot_url || (result as any).data?.screenshotUrl;

      if (targetFields.includes('favicon') && resolvedFavicon) {
        updatePayload.favicon_url = resolvedFavicon;
      }

      if (targetFields.includes('screenshot') && resolvedScreenshot) {
        updatePayload.tool_screenshot_url = resolvedScreenshot;
      }


      if (Object.keys(updatePayload).length <= 1) {
        console.log(`[enrichSubmissionMediaInBackground] No new media URLs extracted for submission #${submissionId}`);
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from('ai_tool_submissions')
        .update(updatePayload)
        .eq('id', submissionId);

      if (updateError) {
        console.error(`[enrichSubmissionMediaInBackground] Failed to update submission #${submissionId} with media URLs:`, updateError.message);
      } else {
        console.log(`[enrichSubmissionMediaInBackground] Successfully updated submission #${submissionId} with media:`, {
          favicon: updatePayload.favicon_url ? 'updated' : 'unchanged',
          screenshot: updatePayload.tool_screenshot_url ? 'updated' : 'unchanged',
        });
      }
    } catch (err) {
      console.error(`[enrichSubmissionMediaInBackground] Background media enrichment error for submission #${submissionId}:`, err);
    }
  })();
}

