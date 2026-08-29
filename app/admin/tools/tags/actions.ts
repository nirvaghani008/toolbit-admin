'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const ALLOWED_STATUSES = ['show', 'hide', 'draft', 'archived'] as const;
type TagStatus = typeof ALLOWED_STATUSES[number];

const TAG_RETURN_COLUMNS = 'id, name, slug, parent_tag, tool_count, views, status, updated_at, meta_title, meta_description, meta_keywords, description';

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
    if (combined.includes('hashtags_hashtag_name_key') || combined.includes('hashtags_hashtag_name_norm_unique') || combined.includes('name')) {
      return 'A tag with this name already exists.';
    }
    if (combined.includes('hashtags_hashtag_url_key') || combined.includes('slug')) {
      return 'A tag with this URL slug already exists. Please choose a unique slug.';
    }
    return 'A tag with this name or URL slug already exists.';
  }

  // Not null violations
  if (code === '23502') {
    return 'Required fields cannot be empty.';
  }

  // Check constraint violations
  if (code === '23514') {
    return 'Validation failed for tag attributes.';
  }

  // String length truncation
  if (code === '22001') {
    return 'Input text exceeds the maximum character limit.';
  }

  // Single row not found
  if (code === 'PGRST116') {
    return 'Tag record not found or already deleted.';
  }

  // Permission / Authorization errors
  if (code === '42501') {
    return 'Access denied: Insufficient database privileges.';
  }

  return error.message || fallbackMessage;
}

/**
 * Create a new tag using Service Role Key.
 * Verifies caller permissions for 'tags' (or parent 'tools') insert.
 */
export async function createTagAction(
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tags', 'insert');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const rawName = formData?.tag_name ?? formData?.name ?? '';
    const rawSlug = formData?.tag_url ?? formData?.slug ?? '';
    const rawParent = formData?.parent_tag ?? formData?.parent ?? '';

    const name = String(rawName).replace(/^#+/, '').trim();
    const slug = String(rawSlug).replace(/^#+/, '').trim().toLowerCase();
    const parentTag = String(rawParent).replace(/^#+/, '').trim() || null;

    if (!name) {
      return { success: false, error: 'Tag name is required.' };
    }

    if (name.length > 100) {
      return { success: false, error: 'Tag name cannot exceed 100 characters.' };
    }

    if (!slug) {
      return { success: false, error: 'URL slug is required.' };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { success: false, error: 'URL slug must contain only lowercase alphanumeric characters and hyphens.' };
    }

    if (slug.length > 100) {
      return { success: false, error: 'URL slug cannot exceed 100 characters.' };
    }

    const statusInput = String(formData?.status || 'show').toLowerCase();
    const statusVal: TagStatus = ALLOWED_STATUSES.includes(statusInput as TagStatus) ? (statusInput as TagStatus) : 'show';

    const metaKeywords = formData?.meta_keywords
      ? (Array.isArray(formData.meta_keywords) ? formData.meta_keywords.join(', ').trim() : String(formData.meta_keywords).trim()) || null
      : null;

    const dbPayload = {
      name,
      slug,
      parent_tag: parentTag,
      status: statusVal,
      meta_title: (formData?.meta_title ? String(formData.meta_title).trim() : '') || null,
      meta_description: (formData?.meta_description ? String(formData.meta_description).trim() : '') || null,
      meta_keywords: metaKeywords,
      description: (formData?.description ? String(formData.description).trim() : '') || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('tags')
      .insert([dbPayload])
      .select(TAG_RETURN_COLUMNS)
      .single();

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to create tag.') };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('createTagAction error:', err);
    return { success: false, error: err?.message || 'Failed to create tag.' };
  }
}

/**
 * Update an existing tag using Service Role Key.
 * Verifies caller permissions for 'tags' (or parent 'tools') update.
 */
export async function updateTagAction(
  id: number | string,
  formData: any,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tags', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid tag ID for update.' };
    }

    const rawName = formData?.tag_name ?? formData?.name ?? '';
    const rawSlug = formData?.tag_url ?? formData?.slug ?? '';
    const rawParent = formData?.parent_tag ?? formData?.parent ?? '';

    const name = String(rawName).replace(/^#+/, '').trim();
    const slug = String(rawSlug).replace(/^#+/, '').trim().toLowerCase();
    const parentTag = String(rawParent).replace(/^#+/, '').trim() || null;

    if (!name) {
      return { success: false, error: 'Tag name is required.' };
    }

    if (name.length > 100) {
      return { success: false, error: 'Tag name cannot exceed 100 characters.' };
    }

    if (!slug) {
      return { success: false, error: 'URL slug is required.' };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { success: false, error: 'URL slug must contain only lowercase alphanumeric characters and hyphens.' };
    }

    if (slug.length > 100) {
      return { success: false, error: 'URL slug cannot exceed 100 characters.' };
    }

    const statusInput = String(formData?.status || 'show').toLowerCase();
    const statusVal: TagStatus = ALLOWED_STATUSES.includes(statusInput as TagStatus) ? (statusInput as TagStatus) : 'show';

    const metaKeywords = formData?.meta_keywords
      ? (Array.isArray(formData.meta_keywords) ? formData.meta_keywords.join(', ').trim() : String(formData.meta_keywords).trim()) || null
      : null;

    const dbPayload = {
      name,
      slug,
      parent_tag: parentTag,
      status: statusVal,
      meta_title: (formData?.meta_title ? String(formData.meta_title).trim() : '') || null,
      meta_description: (formData?.meta_description ? String(formData.meta_description).trim() : '') || null,
      meta_keywords: metaKeywords,
      description: (formData?.description ? String(formData.description).trim() : '') || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('tags')
      .update(dbPayload)
      .eq('id', numId)
      .select(TAG_RETURN_COLUMNS)
      .single();

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to update tag.') };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('updateTagAction error:', err);
    return { success: false, error: err?.message || 'Failed to update tag.' };
  }
}

/**
 * Update status of a tag using Service Role Key.
 * Verifies caller permissions for 'tags' (or parent 'tools') update.
 */
export async function updateTagStatusAction(
  id: number | string,
  newStatus: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tags', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid tag ID.' };
    }

    const cleanStatus = (newStatus || '').trim().toLowerCase();
    if (!ALLOWED_STATUSES.includes(cleanStatus as TagStatus)) {
      return { success: false, error: `Invalid tag status. Allowed values: ${ALLOWED_STATUSES.join(', ')}.` };
    }

    const { error } = await supabaseAdmin
      .from('tags')
      .update({
        status: cleanStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', numId);

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to update tag status.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateTagStatusAction error:', err);
    return { success: false, error: err?.message || 'Failed to update tag status.' };
  }
}

/**
 * Delete a tag using Service Role Key.
 * Verifies caller permissions for 'tags' (or parent 'tools') delete.
 */
export async function deleteTagAction(
  id: number | string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'tags', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'Invalid tag ID.' };
    }

    const { error } = await supabaseAdmin
      .from('tags')
      .delete()
      .eq('id', numId);

    if (error) {
      return { success: false, error: mapDatabaseError(error, 'Failed to delete tag.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteTagAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete tag.' };
  }
}
