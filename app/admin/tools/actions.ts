'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import {
  formatCanonicalSiteUrl,
  validateToolSiteUrlFormat,
  findToolBySiteUrl,
  findSubmissionBySiteUrl,
} from '@/lib/url-normalize';
import { getWorkerFetchHeaders } from '@/lib/worker-headers';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ExtractToolFieldsParams {
  url: string;
  targetFields: ('favicon' | 'screenshot' | 'tool_info' | 'pricing')[];
  existingFaviconUrl?: string | null;
  existingScreenshotUrl?: string | null;
  forceReextract?: boolean;
}

export interface ExtractToolFieldsResult {
  tool_site_url: string;
  favicon_url?: string | null;
  tool_screenshot_url?: string | null;
  tool_info?: Record<string, any>;
  pricing?: Record<string, any>;
  pricingModel?: string;
  truncation_stats?: Record<string, any>;
}


export interface CheckSiteUrlResult {
  exists: boolean;
  type?: 'published' | 'submission';
  message?: string;
  tool?: {
    tool_id: number;
    tool_name: string;
    tool_url: string;
    tool_site_url: string;
    status: string;
  };
  submission?: {
    id: number;
    tool_name: string;
    tool_url: string;
    tool_site_url: string;
    status: string;
  };
}

/**
 * Check if a tool site URL already exists in ai_tools or ai_tool_submissions.
 * Used for live validation in new and edit tool forms.
 */
export async function checkToolSiteUrlAvailabilityAction(
  params: {
    toolSiteUrl: string;
    excludeToolId?: number | string | null;
  },
  token: string
): Promise<ActionResponse<CheckSiteUrlResult>> {
  try {
    let auth = await verifyAdminPermission(token, 'tools', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { toolSiteUrl, excludeToolId } = params;
    if (!toolSiteUrl || !toolSiteUrl.trim()) {
      return { success: true, data: { exists: false } };
    }

    const valResult = validateToolSiteUrlFormat(toolSiteUrl);
    if (!valResult.isValid) {
      return {
        success: true,
        data: {
          exists: false,
          message: valResult.error,
        },
      };
    }

    // 1. Check published ai_tools (excluding current tool if editing)
    const existingTool = await findToolBySiteUrl(
      supabaseAdmin,
      toolSiteUrl,
      'tool_id, tool_url, tool_site_url, tool_info, status',
      excludeToolId
    );

    if (existingTool?.tool_id) {
      const toolName =
        existingTool.tool_info?.toolName ||
        existingTool.tool_info?.name ||
        'Unnamed Tool';
      return {
        success: true,
        data: {
          exists: true,
          type: 'published',
          tool: {
            tool_id: existingTool.tool_id,
            tool_name: toolName,
            tool_url: existingTool.tool_url || '',
            tool_site_url: existingTool.tool_site_url || '',
            status: existingTool.status || 'show',
          },
          message: `This website URL is already registered to "${toolName}" (ID: #${existingTool.tool_id}, slug: "${existingTool.tool_url}", status: "${existingTool.status || 'show'}").`,
        },
      };
    }

    // 2. Check submissions in ai_tool_submissions
    const existingSubmission = await findSubmissionBySiteUrl(
      supabaseAdmin,
      toolSiteUrl,
      'id, tool_url, tool_site_url, tool_info, status',
      ['pending', 'in_review', 'verified', 'approved', 'draft']
    );

    if (existingSubmission?.id) {
      const toolName =
        existingSubmission.tool_info?.toolName || 'Tool Submission';
      return {
        success: true,
        data: {
          exists: true,
          type: 'submission',
          submission: {
            id: existingSubmission.id,
            tool_name: toolName,
            tool_url: existingSubmission.tool_url || '',
            tool_site_url: existingSubmission.tool_site_url || '',
            status: existingSubmission.status || 'pending',
          },
          message: `Notice: A submission for this website exists in queue (Submission #${existingSubmission.id}, Status: "${existingSubmission.status}").`,
        },
      };
    }

    return {
      success: true,
      data: {
        exists: false,
      },
    };
  } catch (err: any) {
    console.error('checkToolSiteUrlAvailabilityAction error:', err);
    return { success: false, error: err?.message || 'Failed to check tool site URL.' };
  }
}

const VALID_AI_TOOLS_COLUMNS = new Set([
  'tool_url',
  'tool_site_url',
  'tool_screenshot_url',
  'favicon_url',
  'status',
  'scheduled_launch_date',
  'tool_info',
  'is_paid',
  'submission_tier',
  'sr_traffic',
  'view_counter',
  'visit_counter',
  'upvote_counter',
  'saved_counter',
  'analytics',
  'analytics_sep',
  'worker_response',
  'embedding',
  'affiliate',
  'created_at',
  'updated_at',
]);

/**
 * Filter out any fields not present on the `ai_tools` table
 * to prevent schema cache / unknown column errors.
 */
function sanitizeAiToolPayload(input: Record<string, any>): Record<string, any> {
  const cleanPayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (VALID_AI_TOOLS_COLUMNS.has(key) && value !== undefined) {
      cleanPayload[key] = value;
    }
  }
  return cleanPayload;
}

/**
 * Create a new AI tool using Service Role Key.
 * Verifies caller permissions for 'tools' insert.
 */
export async function createToolAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tools', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = sanitizeAiToolPayload(formData || {});

    // Validate and format site URL
    if (payload.tool_site_url) {
      const validation = validateToolSiteUrlFormat(payload.tool_site_url);
      if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid Tool Site URL.' };
      }
      payload.tool_site_url = formatCanonicalSiteUrl(payload.tool_site_url);

      // Check for duplicate tool site URL in ai_tools
      const existingTool = await findToolBySiteUrl(
        supabaseAdmin,
        payload.tool_site_url,
        'tool_id, tool_url, tool_info'
      );
      if (existingTool?.tool_id) {
        const conflictName =
          existingTool.tool_info?.toolName ||
          existingTool.tool_info?.name ||
          'Existing Tool';
        return {
          success: false,
          error: `A tool with this website URL already exists: "${conflictName}" (slug: "${existingTool.tool_url}").`,
        };
      }
    }

    if (!payload.created_at) {
      payload.created_at = new Date().toISOString();
    }
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ai_tools')
      .insert([payload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const detail = (error.details || error.message || '').toLowerCase();
        if (detail.includes('tool_site_url') || error.message?.includes('ai_tools_tool_url_key')) {
          return { success: false, error: 'Duplicate Tool Site URL. A tool with this website already exists.' };
        }
        return { success: false, error: 'Duplicate URL slug. This tool URL slug is already in use.' };
      }
      throw error;
    }

    // Trigger non-blocking background media enrichment if media assets are missing
    if (data?.tool_id && payload.tool_site_url) {
      const missingMedia: ('favicon' | 'screenshot')[] = [];
      if (!payload.favicon_url) missingMedia.push('favicon');
      if (!payload.tool_screenshot_url) missingMedia.push('screenshot');
      if (missingMedia.length > 0) {
        enrichToolMediaInBackground(data.tool_id, payload.tool_site_url, missingMedia);
      }
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('createToolAction error:', err);
    return { success: false, error: err?.message || 'Failed to create tool.' };
  }
}

/**
 * Update an existing AI tool using Service Role Key.
 * Verifies caller permissions for 'tools' update.
 */
export async function updateToolAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tools', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = sanitizeAiToolPayload(formData || {});

    // Validate and format site URL
    if (payload.tool_site_url) {
      const validation = validateToolSiteUrlFormat(payload.tool_site_url);
      if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid Tool Site URL.' };
      }
      payload.tool_site_url = formatCanonicalSiteUrl(payload.tool_site_url);

      // Check for collision with any other tool in ai_tools
      const existingTool = await findToolBySiteUrl(
        supabaseAdmin,
        payload.tool_site_url,
        'tool_id, tool_url, tool_info',
        id
      );
      if (existingTool?.tool_id) {
        const conflictName =
          existingTool.tool_info?.toolName ||
          existingTool.tool_info?.name ||
          'Another Tool';
        return {
          success: false,
          error: `Another tool is already using this website URL: "${conflictName}" (slug: "${existingTool.tool_url}").`,
        };
      }
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ai_tools')
      .update(payload)
      .eq('tool_id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const detail = (error.details || error.message || '').toLowerCase();
        if (detail.includes('tool_site_url') || error.message?.includes('ai_tools_tool_url_key')) {
          return { success: false, error: 'Duplicate Tool Site URL. A tool with this website already exists.' };
        }
        return { success: false, error: 'Duplicate URL slug. This tool URL slug is already in use.' };
      }
      throw error;
    }

    // Trigger non-blocking background media enrichment if media assets are missing
    if (id && payload.tool_site_url) {
      const missingMedia: ('favicon' | 'screenshot')[] = [];
      if (!payload.favicon_url) missingMedia.push('favicon');
      if (!payload.tool_screenshot_url) missingMedia.push('screenshot');
      if (missingMedia.length > 0) {
        enrichToolMediaInBackground(id, payload.tool_site_url, missingMedia);
      }
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('updateToolAction error:', err);
    return { success: false, error: err?.message || 'Failed to update tool.' };
  }
}

/**
 * Update status of an AI tool using Service Role Key.
 * Verifies caller permissions for 'tools' update.
 */
export async function updateToolStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tools', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('ai_tools')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('tool_id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateToolStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update tool status.' };
  }
}

/**
 * Delete an AI tool using Service Role Key.
 * Verifies caller permissions for 'tools' delete.
 */
export async function deleteToolAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tools', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('ai_tools')
      .delete()
      .eq('tool_id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteToolAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete tool.' };
  }
}

/**
 * Asynchronously enriches missing favicon or screenshot in the background.
 * Calls the `ai-tool-info` worker in pure extraction mode and updates
 * the `ai_tools` row directly using supabaseAdmin.
 */
export async function enrichToolMediaInBackground(
  toolId: number | string,
  toolSiteUrl: string,
  missingFields: ('favicon' | 'screenshot')[]
): Promise<void> {
  const targetFields = missingFields.filter((f) => f === 'favicon' || f === 'screenshot');
  if (targetFields.length === 0) return;

  const workerUrl = process.env.AI_TOOL_INFO_WORKER_URL;
  const workerSecret = process.env.AI_TOOL_INFO_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    console.warn('[enrichToolMediaInBackground] Missing AI_TOOL_INFO_WORKER configuration; skipping background media enrichment.');
    return;
  }

  // Fire and forget in the background
  (async () => {
    try {
      console.log(`[enrichToolMediaInBackground] Fetching missing media for tool #${toolId} (${toolSiteUrl}). Fields: ${targetFields.join(', ')}`);

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
        console.warn(`[enrichToolMediaInBackground] Worker returned status ${response.status} for tool #${toolId}`);
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        favicon_url?: string | null;
        screenshot_url?: string | null;
      };

      if (!result.success) {
        console.warn(`[enrichToolMediaInBackground] Worker extraction unsuccessful for tool #${toolId}`);
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
        console.log(`[enrichToolMediaInBackground] No new media URLs extracted for tool #${toolId}`);
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from('ai_tools')
        .update(updatePayload)
        .eq('tool_id', toolId);

      if (updateError) {
        console.error(`[enrichToolMediaInBackground] Failed to update tool #${toolId} with media URLs:`, updateError.message);
      } else {
        console.log(`[enrichToolMediaInBackground] Successfully updated tool #${toolId} with media:`, {
          favicon: updatePayload.favicon_url ? 'updated' : 'unchanged',
          screenshot: updatePayload.tool_screenshot_url ? 'updated' : 'unchanged',
        });
      }
    } catch (err) {
      console.error(`[enrichToolMediaInBackground] Background media enrichment error for tool #${toolId}:`, err);
    }
  })();
}

/**
 * Server action to extract selected fields via the ai-tool-info worker in Pure Extraction Mode.
 * Verifies admin permissions and returns data to the caller without performing DB mutations.
 */
export async function extractToolFieldsAction(
  params: ExtractToolFieldsParams,
  token: string
): Promise<ActionResponse<ExtractToolFieldsResult>> {
  try {
    let auth = await verifyAdminPermission(token, 'tools', 'view');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'submissions', 'view');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { url, targetFields, existingFaviconUrl, existingScreenshotUrl, forceReextract } = params;

    if (!url || !url.trim()) {
      return { success: false, error: 'Target URL is required.' };
    }

    const valResult = validateToolSiteUrlFormat(url.trim());
    if (!valResult.isValid) {
      return { success: false, error: valResult.error || 'Invalid Target URL format.' };
    }
    const cleanUrl = valResult.cleaned || formatCanonicalSiteUrl(url.trim());

    if (!targetFields || !Array.isArray(targetFields) || targetFields.length === 0) {
      return { success: false, error: 'At least one target field must be selected.' };
    }

    const validOptions = ['favicon', 'screenshot', 'tool_info', 'pricing'];
    const invalid = targetFields.filter(f => !validOptions.includes(f));
    if (invalid.length > 0) {
      return { success: false, error: `Invalid target fields: ${invalid.join(', ')}` };
    }

    const hasFavicon = Boolean(existingFaviconUrl && existingFaviconUrl.trim());
    const hasScreenshot = Boolean(existingScreenshotUrl && existingScreenshotUrl.trim());

    // If only requesting media that already exists and re-extract is not forced, return immediately
    const onlyMediaRequested = targetFields.every(f => f === 'favicon' || f === 'screenshot');
    if (!forceReextract && onlyMediaRequested && (!targetFields.includes('favicon') || hasFavicon) && (!targetFields.includes('screenshot') || hasScreenshot)) {
      return {
        success: true,
        data: {
          tool_site_url: cleanUrl,
          favicon_url: existingFaviconUrl || null,
          tool_screenshot_url: existingScreenshotUrl || null,
        },
      };
    }

    const workerUrl = process.env.AI_TOOL_INFO_WORKER_URL;
    const workerSecret = process.env.AI_TOOL_INFO_WORKER_SECRET;

    if (!workerUrl || !workerSecret) {
      return { success: false, error: 'AI crawl worker is not configured on the server.' };
    }

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: getWorkerFetchHeaders(workerSecret),
      body: JSON.stringify({
        url: cleanUrl,
        target_fields: targetFields,
        is_screenshot: targetFields.includes('screenshot'),
      }),
      signal: AbortSignal.timeout(3.5 * 60 * 1000), // 3.5 minutes timeout
    });

    if (!response.ok) {
      try {
        const errorJson = (await response.json()) as Record<string, any>;
        if (errorJson && errorJson.error) {
          return { success: false, error: errorJson.error };
        }
      } catch {}
      const errorText = await response.text();
      return { success: false, error: `AI worker failed (HTTP ${response.status}): ${errorText || 'Unknown error'}` };
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error || 'AI extraction failed.' };
    }

    const resolvedFaviconUrl = result.favicon_url || result.data?.favicon_url || result.data?.faviconUrl || (hasFavicon ? existingFaviconUrl : null);
    const resolvedScreenshotUrl = result.screenshot_url || result.data?.tool_screenshot_url || result.data?.screenshotUrl || (hasScreenshot ? existingScreenshotUrl : null);

    return {
      success: true,
      data: {
        tool_site_url: cleanUrl,
        favicon_url: resolvedFaviconUrl,
        tool_screenshot_url: resolvedScreenshotUrl,
        tool_info: result.data || {},
        pricing: result.data?.pricing,
        pricingModel: result.data?.pricingModel,
        truncation_stats: result.truncation_stats,
      },
    };
  } catch (err: any) {
    console.error('extractToolFieldsAction error:', err);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { success: false, error: 'The AI worker timed out while crawling the website. Please check the URL and try again.' };
    }
    return { success: false, error: err?.message || 'Failed to extract tool fields.' };
  }
}

