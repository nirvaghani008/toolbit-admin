'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new social post using Service Role Key.
 * Verifies caller permissions for 'socials' insert.
 */
export async function createSocialAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('socials')
      .insert([formData])
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err: any) {
    console.error('createSocialAction error:', err);
    return { success: false, error: err?.message || 'Failed to create social post.' };
  }
}

/**
 * Update an existing social post using Service Role Key.
 * Verifies caller permissions for 'socials' update.
 */
export async function updateSocialAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'socials', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('socials')
      .update(formData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
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

    const { error } = await supabaseAdmin
      .from('socials')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;

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

    const { error } = await supabaseAdmin
      .from('socials')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteSocialAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete social post.' };
  }
}
