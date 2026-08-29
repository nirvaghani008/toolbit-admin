'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new blog post using Service Role Key.
 * Verifies caller permissions for 'blog_posts' insert.
 */
export async function createBlogPostAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'blog_posts', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .insert([formData])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Duplicate blog post slug. A post with this slug already exists.' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('createBlogPostAction error:', err);
    return { success: false, error: err?.message || 'Failed to create blog post.' };
  }
}

/**
 * Update an existing blog post using Service Role Key.
 * Verifies caller permissions for 'blog_posts' update.
 */
export async function updateBlogPostAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'blog_posts', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const payload = {
      ...formData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Duplicate blog post slug. A post with this slug already exists.' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('updateBlogPostAction error:', err);
    return { success: false, error: err?.message || 'Failed to update blog post.' };
  }
}

/**
 * Update status of a blog post using Service Role Key.
 * Verifies caller permissions for 'blog_posts' update.
 */
export async function updateBlogPostStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'blog_posts', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('blog_posts')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('updateBlogPostStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update blog post status.' };
  }
}

/**
 * Delete a blog post using Service Role Key.
 * Verifies caller permissions for 'blog_posts' delete.
 */
export async function deleteBlogPostAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'blog_posts', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteBlogPostAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete blog post.' };
  }
}
