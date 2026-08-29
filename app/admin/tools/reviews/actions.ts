'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Update an existing review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') update.
 */
export async function updateReviewAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = {
      ...formData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (err: any) {
    console.error('updateReviewAction error:', err);
    return { success: false, error: err?.message || 'Failed to update review.' };
  }
}

/**
 * Update status of a review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') update.
 */
export async function updateReviewStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateReviewStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update review status.' };
  }
}

/**
 * Delete a review using Service Role Key.
 * Verifies caller permissions for 'reviews' (or parent 'tools') delete.
 */
export async function deleteReviewAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'reviews', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteReviewAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete review.' };
  }
}
