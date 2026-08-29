'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Maps database and PostgREST errors into clean, user-friendly messages.
 */
function mapDatabaseError(error: any, fallbackMessage: string): string {
  if (!error) return fallbackMessage;

  const code = error.code;
  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();
  const combined = `${message} ${details}`;

  // Unique constraint violations
  if (code === '23505') {
    if (combined.includes('category_name') || combined.includes('categories_category_name_key') || combined.includes('name')) {
      return 'A category with this name already exists.';
    }
    if (combined.includes('category_url') || combined.includes('categories_category_url_key') || combined.includes('slug')) {
      return 'A category with this URL slug already exists.';
    }
    return 'A category with this name or URL slug already exists.';
  }

  // Not null violations
  if (code === '23502') {
    return 'Required fields cannot be empty.';
  }

  // Check constraint violations
  if (code === '23514') {
    return 'Validation failed for category attributes.';
  }

  // String length truncation
  if (code === '22001') {
    return 'Input text exceeds the maximum character limit.';
  }

  // Single row not found
  if (code === 'PGRST116') {
    return 'Category record not found or already deleted.';
  }

  // Permission / Authorization errors
  if (code === '42501') {
    return 'Access denied: Insufficient database privileges.';
  }

  return error.message || fallbackMessage;
}

/**
 * Create a new category using Service Role Key.
 * Verifies caller permissions for 'categories' (or parent 'tools') insert.
 */
export async function createCategoryAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'categories', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const name = (formData?.category_name || formData?.name || '').trim();
    const slug = (formData?.category_url || formData?.slug || '').trim().toLowerCase();

    if (!name) {
      return { success: false, error: 'Category name is required.' };
    }

    if (!slug) {
      return { success: false, error: 'URL slug is required.' };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { success: false, error: 'URL slug must contain only lowercase alphanumeric characters and hyphens.' };
    }

    const statusVal = formData?.status === 'show' || formData?.status === 'hide' ? formData.status : 'show';

    const dbPayload = {
      name,
      slug,
      parent: (formData?.parent_category || formData?.parent || '').trim() || null,
      status: statusVal,
      meta_title: (formData?.meta_title || '').trim() || null,
      meta_description: (formData?.meta_description || '').trim() || null,
      meta_keywords: formData?.meta_keywords
        ? (typeof formData.meta_keywords === 'string' ? formData.meta_keywords.trim() : formData.meta_keywords)
        : null,
      description: (formData?.description || '').trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert([dbPayload])
      .select('id, name, slug, parent, tool_count, views, status, updated_at, meta_title, meta_description, meta_keywords, description')
      .single();

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to create category.') };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('createCategoryAction error:', err);
    return { success: false, error: err?.message || 'Failed to create category.' };
  }
}

/**
 * Update an existing category using Service Role Key.
 * Verifies caller permissions for 'categories' (or parent 'tools') update.
 */
export async function updateCategoryAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'categories', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid category ID for update.' };
    }

    const name = (formData?.category_name || formData?.name || '').trim();
    const slug = (formData?.category_url || formData?.slug || '').trim().toLowerCase();

    if (!name) {
      return { success: false, error: 'Category name is required.' };
    }

    if (!slug) {
      return { success: false, error: 'URL slug is required.' };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { success: false, error: 'URL slug must contain only lowercase alphanumeric characters and hyphens.' };
    }

    const statusVal = formData?.status === 'show' || formData?.status === 'hide' ? formData.status : 'show';

    const dbPayload = {
      name,
      slug,
      parent: (formData?.parent_category || formData?.parent || '').trim() || null,
      status: statusVal,
      meta_title: (formData?.meta_title || '').trim() || null,
      meta_description: (formData?.meta_description || '').trim() || null,
      meta_keywords: formData?.meta_keywords
        ? (typeof formData.meta_keywords === 'string' ? formData.meta_keywords.trim() : formData.meta_keywords)
        : null,
      description: (formData?.description || '').trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update(dbPayload)
      .eq('id', numId)
      .select('id, name, slug, parent, tool_count, views, status, updated_at, meta_title, meta_description, meta_keywords, description')
      .single();

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to update category.') };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('updateCategoryAction error:', err);
    return { success: false, error: err?.message || 'Failed to update category.' };
  }
}

/**
 * Update status of a category using Service Role Key.
 * Verifies caller permissions for 'categories' (or parent 'tools') update.
 */
export async function updateCategoryStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'categories', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid category ID.' };
    }

    if (newStatus !== 'show' && newStatus !== 'hide') {
      return { success: false, error: 'Invalid category status. Must be "show" or "hide".' };
    }

    const { error } = await supabaseAdmin
      .from('categories')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', numId);

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to update category status.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateCategoryStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update category status.' };
  }
}

/**
 * Delete a category using Service Role Key.
 * Verifies caller permissions for 'categories' (or parent 'tools') delete.
 */
export async function deleteCategoryAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'categories', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid category ID.' };
    }

    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', numId);

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to delete category.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteCategoryAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete category.' };
  }
}
