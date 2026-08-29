'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
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
