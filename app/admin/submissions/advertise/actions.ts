'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import {
  formatCanonicalSiteUrl,
  validateToolSiteUrlFormat,
  findAdvertisementToolBySiteUrl,
  findToolBySiteUrl,
} from '@/lib/url-normalize';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CheckAdvertiseSiteUrlResult {
  exists: boolean;
  type?: 'active_ad';
  message?: string;
  ad?: {
    id: number;
    tool_id?: number | string;
    tool_site_url: string;
    status: string;
    featured_type?: any;
    start_date?: string;
    end_date?: string;
  };
  matchedTool?: {
    tool_id: number;
    tool_name: string;
    tool_url: string;
    tool_site_url: string;
    status: string;
  };
}

/**
 * Check if an active advertisement or existing tool matches the site URL.
 */
export async function checkAdvertiseSiteUrlAvailabilityAction(
  params: {
    toolSiteUrl: string;
    excludeId?: number | string | null;
  },
  token: string
): Promise<ActionResponse<CheckAdvertiseSiteUrlResult>> {
  try {
    let auth = await verifyAdminPermission(token, 'advertise', 'view');
    if (!auth.authorized) {
      auth = await verifyAdminPermission(token, 'submissions', 'view');
    }
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { toolSiteUrl, excludeId } = params;
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

    // 1. Check for existing active campaign in advertisement_tools
    const existingAd = await findAdvertisementToolBySiteUrl(
      supabaseAdmin,
      toolSiteUrl,
      'id, tool_id, tool_site_url, status, featured_type, start_date, end_date',
      excludeId
    );

    // 2. Check matching tool in ai_tools for auto-linking
    const existingTool = await findToolBySiteUrl(
      supabaseAdmin,
      toolSiteUrl,
      'tool_id, tool_url, tool_site_url, tool_info, status'
    );

    const toolMatch = existingTool?.tool_id
      ? {
          tool_id: existingTool.tool_id,
          tool_name:
            existingTool.tool_info?.toolName ||
            existingTool.tool_info?.name ||
            `Tool #${existingTool.tool_id}`,
          tool_url: existingTool.tool_url || '',
          tool_site_url: existingTool.tool_site_url || '',
          status: existingTool.status || 'show',
        }
      : undefined;

    if (existingAd?.id) {
      const placement = Array.isArray(existingAd.featured_type)
        ? existingAd.featured_type.join(', ')
        : existingAd.featured_type || 'Unknown';
      return {
        success: true,
        data: {
          exists: true,
          type: 'active_ad',
          ad: {
            id: existingAd.id,
            tool_id: existingAd.tool_id,
            tool_site_url: existingAd.tool_site_url,
            status: existingAd.status,
            featured_type: existingAd.featured_type,
            start_date: existingAd.start_date,
            end_date: existingAd.end_date,
          },
          matchedTool: toolMatch,
          message: `Notice: An active campaign (#${existingAd.id}, Status: "${existingAd.status}", Placement: "${placement}") already exists for this website.`,
        },
      };
    }

    return {
      success: true,
      data: {
        exists: false,
        matchedTool: toolMatch,
      },
    };
  } catch (err: any) {
    console.error('checkAdvertiseSiteUrlAvailabilityAction error:', err);
    return { success: false, error: err?.message || 'Failed to check advertisement URL.' };
  }
}

/**
 * Create a new advertisement tool placement using Service Role Key.
 * Verifies caller permissions for 'advertise' (or parent 'submissions') insert.
 */
export async function createAdvertiseAction(
  payload: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'advertise', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const cleanPayload = { ...payload };
    if (cleanPayload.tool_site_url) {
      const val = validateToolSiteUrlFormat(cleanPayload.tool_site_url);
      if (!val.isValid) {
        return { success: false, error: val.error || 'Invalid Tool Site URL format.' };
      }
      cleanPayload.tool_site_url = formatCanonicalSiteUrl(cleanPayload.tool_site_url);
    }

    const { data, error } = await supabaseAdmin
      .from('advertisement_tools')
      .insert([{
        ...cleanPayload,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err: any) {
    console.error('createAdvertiseAction error:', err);
    return { success: false, error: err?.message || 'Failed to create advertisement.' };
  }
}

/**
 * Update an existing advertisement tool placement using Service Role Key.
 * Verifies caller permissions for 'advertise' (or parent 'submissions') update.
 */
export async function updateAdvertiseAction(
  id: number | string,
  payload: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'advertise', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const cleanPayload = { ...payload };
    if (cleanPayload.tool_site_url) {
      const val = validateToolSiteUrlFormat(cleanPayload.tool_site_url);
      if (!val.isValid) {
        return { success: false, error: val.error || 'Invalid Tool Site URL format.' };
      }
      cleanPayload.tool_site_url = formatCanonicalSiteUrl(cleanPayload.tool_site_url);
    }

    const { data, error } = await supabaseAdmin
      .from('advertisement_tools')
      .update({
        ...cleanPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err: any) {
    console.error('updateAdvertiseAction error:', err);
    return { success: false, error: err?.message || 'Failed to update advertisement.' };
  }
}

/**
 * Update status of an advertisement tool placement using Service Role Key.
 * Verifies caller permissions for 'advertise' (or parent 'submissions') update.
 */
export async function updateAdvertiseStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'advertise', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('advertisement_tools')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateAdvertiseStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update advertisement status.' };
  }
}

/**
 * Delete an advertisement tool placement using Service Role Key.
 * Verifies caller permissions for 'advertise' (or parent 'submissions') delete.
 */
export async function deleteAdvertiseAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'advertise', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('advertisement_tools')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteAdvertiseAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete advertisement.' };
  }
}
