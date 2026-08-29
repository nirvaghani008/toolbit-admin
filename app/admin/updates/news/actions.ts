'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new news article using Service Role Key.
 * Verifies caller permissions for 'news' insert.
 */
export async function createNewsAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    let insertPayload: Record<string, any> = { ...formData };
    if (!insertPayload.news_id) {
      const { data: maxIdData } = await supabaseAdmin
        .from('news')
        .select('news_id')
        .order('news_id', { ascending: false })
        .limit(1);
      if (maxIdData && maxIdData.length > 0 && maxIdData[0].news_id) {
        insertPayload.news_id = maxIdData[0].news_id + 1;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('news')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Duplicate news article. A news entry with this title or ID already exists.' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('createNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to create news article.' };
  }
}

/**
 * Update an existing news article using Service Role Key.
 * Verifies caller permissions for 'news' update.
 */
export async function updateNewsAction(
  newsId: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('news')
      .update(formData)
      .eq('news_id', newsId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Duplicate news article. A news entry with this title or ID already exists.' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('updateNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to update news article.' };
  }
}

/**
 * Update status of a news article using Service Role Key.
 * Verifies caller permissions for 'news' update.
 */
export async function updateNewsStatusAction(
  newsId: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('news')
      .update({ status: newStatus })
      .eq('news_id', newsId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateNewsStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update news status.' };
  }
}

/**
 * Delete a news article using Service Role Key.
 * Verifies caller permissions for 'news' delete.
 */
export async function deleteNewsAction(
  newsId: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'news', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('news')
      .delete()
      .eq('news_id', newsId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteNewsAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete news article.' };
  }
}
