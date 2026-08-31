'use server';

import { z } from 'zod';
import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { sanitizeSearchTerm } from '@/lib/postgrest-search';
import { Subscriber } from '@/components/newsletter/SubscriberTable';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  totalCount?: number;
  error?: string;
  stats?: {
    all: number;
    active: number;
    unsubscribed: number;
  };
  sparklines?: Record<string, number[]>;
}

export interface GetNewsletterParams {
  page: number;
  pageSize: number;
  search?: string;
  statusFilter?: 'all' | 'active' | 'unsubscribed';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Zod validation schemas for PostgREST input safety and boundary constraints
 */
const GetNewsletterParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional().default(''),
  statusFilter: z.enum(['all', 'active', 'unsubscribed']).catch('all'),
  sortOrder: z.enum(['asc', 'desc']).catch('desc'),
});

const UpdateStatusParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'Invalid subscriber ID provided.' }),
  newStatus: z.enum(['active', 'inactive', 'subscribed', 'unsubscribed'], {
    message: 'Invalid subscriber status value.',
  }),
});

const DeleteParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'Invalid subscriber ID provided.' }),
});

/**
 * Format and map PostgreSQL/PostgREST error codes into safe, friendly messages
 */
function formatPostgresError(error: any, defaultMsg: string): string {
  if (!error) return defaultMsg;
  const code = error.code;
  const message = error.message || '';
  const details = error.details || '';
  const combined = `${message} ${details}`.toLowerCase();

  if (code === '23505') {
    if (combined.includes('email') || combined.includes('newsletter_subscribers_email_key')) {
      return 'Duplicate email: This email address is already subscribed.';
    }
    return 'A duplicate record already exists in the database.';
  }

  if (code === '23514') {
    if (combined.includes('email_length_check')) {
      return 'Invalid email: Email length must be between 1 and 255 characters.';
    }
    return 'Validation failed against database constraints.';
  }

  if (code === '23502') {
    return `Required field missing: ${error.column || 'Please fill in all mandatory fields.'}`;
  }

  if (code === '22P02') {
    return 'Invalid data format or numeric ID provided.';
  }

  if (code === 'PGRST116') {
    return 'Subscriber record not found or has already been removed.';
  }

  return error.message || defaultMsg;
}

/**
 * Fetch paginated list of newsletter subscribers with search, status filtering, and sorting.
 * Securely authorizes both Super Admins and Sub-admins with newsletter or users view permission.
 */
export async function getNewsletterSubscribersAction(
  params: GetNewsletterParams,
  token: string
): Promise<ActionResponse<Subscriber[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'newsletter', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const validated = GetNewsletterParamsSchema.safeParse(params);
    if (!validated.success) {
      return { success: false, error: 'Invalid query parameters provided.' };
    }

    const { page, pageSize, search, statusFilter, sortOrder } = validated.data;

    let query = supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, email, status, created_at', { count: 'exact' });

    // Safe sanitized search against PostgREST syntax injection and wildcard abuse
    const cleanSearch = sanitizeSearchTerm(search).replace(/[%_]/g, '');
    if (cleanSearch) {
      query = query.ilike('email', `%${cleanSearch}%`);
    }

    // Status filtering handling canonical and legacy status values
    if (statusFilter === 'active') {
      query = query.in('status', ['active', 'subscribed']);
    } else if (statusFilter === 'unsubscribed') {
      query = query.in('status', ['inactive', 'unsubscribed']);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
      .order('created_at', { ascending: sortOrder === 'asc' })
      .order('id', { ascending: sortOrder === 'asc' })
      .range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to fetch newsletter subscribers.') };
    }

    return {
      success: true,
      data: (data as Subscriber[]) || [],
      totalCount: count ?? 0,
    };
  } catch (err: any) {
    console.error('getNewsletterSubscribersAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch newsletter subscribers.',
    };
  }
}

/**
 * Fetch counts and 7-day sparkline trend data for newsletter subscribers in 1 unified server call.
 * Uses Service Role Key (supabaseAdmin) securely after verifying admin/subadmin permissions.
 */
export async function getNewsletterStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'newsletter', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const days = 7;
    const dateKeys: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const startDateISO = dateKeys[0] + 'T00:00:00.000Z';

    const [allRes, activeRes, inactiveRes, recentRes] = await Promise.all([
      supabaseAdmin.from('newsletter_subscribers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).in('status', ['active', 'subscribed']),
      supabaseAdmin.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).in('status', ['inactive', 'unsubscribed']),
      supabaseAdmin.from('newsletter_subscribers').select('created_at, status').gte('created_at', startDateISO).limit(2000),
    ]);

    const sparklines: Record<string, number[]> = {
      all: new Array(days).fill(0),
      active: new Array(days).fill(0),
      unsubscribed: new Array(days).fill(0),
    };

    const statusMap: Record<string, Record<string, number>> = {
      all: {},
      active: {},
      unsubscribed: {},
    };
    dateKeys.forEach((dk) => {
      statusMap.all[dk] = 0;
      statusMap.active[dk] = 0;
      statusMap.unsubscribed[dk] = 0;
    });

    if (recentRes.data) {
      recentRes.data.forEach((row: any) => {
        if (!row.created_at) return;
        const dateStr = new Date(row.created_at).toISOString().slice(0, 10);
        if (statusMap.all[dateStr] !== undefined) statusMap.all[dateStr]++;

        const st = (row.status || '').toLowerCase();
        if (st === 'active' || st === 'subscribed') {
          if (statusMap.active[dateStr] !== undefined) statusMap.active[dateStr]++;
        } else if (st === 'inactive' || st === 'unsubscribed') {
          if (statusMap.unsubscribed[dateStr] !== undefined) statusMap.unsubscribed[dateStr]++;
        }
      });

      sparklines.all = dateKeys.map((dk) => statusMap.all[dk] || 0);
      sparklines.active = dateKeys.map((dk) => statusMap.active[dk] || 0);
      sparklines.unsubscribed = dateKeys.map((dk) => statusMap.unsubscribed[dk] || 0);
    }

    return {
      success: true,
      stats: {
        all: allRes.count ?? 0,
        active: activeRes.count ?? 0,
        unsubscribed: inactiveRes.count ?? 0,
      },
      sparklines,
    };
  } catch (err: any) {
    console.error('getNewsletterStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch newsletter statistics.',
    };
  }
}

/**
 * Update status of a newsletter subscriber using Service Role Key.
 * Verifies caller permissions for 'newsletter' (or parent 'users') update.
 * Note: updated_at column is omitted since newsletter_subscribers does not have this column.
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

    const validated = UpdateStatusParamsSchema.safeParse({ id, newStatus });
    if (!validated.success) {
      const errorMsg = validated.error.issues?.[0]?.message || 'Invalid parameters provided.';
      return { success: false, error: errorMsg };
    }

    const { id: numericId, newStatus: cleanStatus } = validated.data;

    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({
        status: cleanStatus,
      })
      .eq('id', numericId);

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to update subscriber status.') };
    }

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

    const validated = DeleteParamsSchema.safeParse({ id });
    if (!validated.success) {
      const errorMsg = validated.error.issues?.[0]?.message || 'Invalid parameters provided.';
      return { success: false, error: errorMsg };
    }

    const { id: numericId } = validated.data;

    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .delete()
      .eq('id', numericId);

    if (error) {
      return { success: false, error: formatPostgresError(error, 'Failed to delete subscriber.') };
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteNewsletterSubscriberAction error:', err);
    return { success: false, error: err?.message || 'Failed to delete subscriber.' };
  }
}
