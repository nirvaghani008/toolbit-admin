'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Update status of a contact inquiry using Service Role Key.
 * Verifies caller permissions for 'contacts' update.
 */
export async function updateContactStatusAction(
  contactId: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('contact_id', contactId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateContactStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update contact status.' };
  }
}

/**
 * Delete a contact inquiry using Service Role Key.
 * Verifies caller permissions for 'contacts' delete.
 */
export async function deleteContactAction(
  contactId: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'contacts', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('contact_id', contactId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteContactAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete contact inquiry.' };
  }
}
