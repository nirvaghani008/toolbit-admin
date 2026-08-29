'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import {
  formatCanonicalSiteUrl,
  validateToolSiteUrlFormat,
  findToolBySiteUrl,
  findSubmissionBySiteUrl,
} from '@/lib/url-normalize';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
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
