'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Update status of a newsletter subscriber using Service Role Key.
 * Verifies caller permissions for 'newsletter' (or parent 'users') update.
 */
export async function updateNewsletterSubscriberStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'newsletter', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateNewsletterSubscriberStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update subscriber status.' };
  }
}

/**
 * Delete a newsletter subscriber using Service Role Key.
 * Verifies caller permissions for 'newsletter' (or parent 'users') delete.
 */
export async function deleteNewsletterSubscriberAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'newsletter', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteNewsletterSubscriberAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete subscriber.' };
  }
}
