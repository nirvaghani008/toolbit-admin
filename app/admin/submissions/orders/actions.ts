'use server';

import { supabaseAdmin, verifyAdminPermission } from '@/lib/supabase-admin';
import { Order, Submitter } from '@/components/orders/OrderDetailsModal';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  stats?: {
    all: number;
    completed: number;
    pending: number;
    refunded: number;
  };
}

export interface GetOrdersParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: 'created_at' | 'updated_at' | 'amount_usd';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch stats counts for orders using service_role key.
 * Requires `orders.can_view` permission.
 */
export async function getOrderStatsAction(
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'orders', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const [
      { count: cAll },
      { count: cCompleted },
      { count: cPending },
      { count: cRefunded },
    ] = await Promise.all([
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      supabaseAdmin
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'refunded'),
    ]);

    return {
      success: true,
      stats: {
        all: cAll || 0,
        completed: cCompleted || 0,
        pending: cPending || 0,
        refunded: cRefunded || 0,
      },
    };
  } catch (err: any) {
    console.error('getOrderStatsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch order statistics.',
    };
  }
}

/**
 * Fetch paginated list of orders with search, filtering, sorting, and submitter enrichment.
 * Requires `orders.can_view` permission.
 */
export async function getOrdersAction(
  params: GetOrdersParams,
  token: string
): Promise<ActionResponse<Order[]>> {
  try {
    const auth = await verifyAdminPermission(token, 'orders', 'view');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const {
      page = 1,
      pageSize = 20,
      search = '',
      status = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params;

    let query = supabaseAdmin.from('orders').select('*', { count: 'exact' });

    const trimmedSearch = search.trim().replace(/,/g, '');
    if (trimmedSearch) {
      // Find matching user_ids by searching user names and emails from auth.users via get_admin_users
      let matchedUserIds: string[] = [];
      try {
        const { data: userMatches } = await supabaseAdmin.rpc('get_admin_users', {
          p_search: trimmedSearch,
          p_sort: 'created_at-desc',
          p_limit: 100,
          p_offset: 0,
        });
        if (userMatches && userMatches.length > 0) {
          matchedUserIds = userMatches.map((u: any) => u.id).filter(Boolean);
        }
      } catch (e) {
        console.warn('Error matching users by name/email:', e);
      }

      const orClauses: string[] = [
        `order_number.ilike.%${trimmedSearch}%`,
        `plan_id.ilike.%${trimmedSearch}%`,
        `payment_method.ilike.%${trimmedSearch}%`,
        `dodo_payment_id.ilike.%${trimmedSearch}%`,
        `metadata->>tool_name.ilike.%${trimmedSearch}%`,
        `metadata->>tool_url.ilike.%${trimmedSearch}%`,
      ];

      // Direct user_id match if term is a valid UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmedSearch
      );
      if (isUuid) {
        orClauses.push(`user_id.eq.${trimmedSearch}`);
      }

      // Match orders belonging to users found by name or email
      if (matchedUserIds.length > 0) {
        orClauses.push(`user_id.in.(${matchedUserIds.slice(0, 50).join(',')})`);
      }

      const lower = trimmedSearch.toLowerCase();
      if (lower.includes('launch')) orClauses.push('plan_id.ilike.%launch_tool%');
      if (lower.includes('update')) orClauses.push('plan_id.ilike.%update_tool%');
      if (lower.includes('guest')) orClauses.push('plan_id.ilike.%guest_post%');
      if (lower.includes('adver')) orClauses.push('plan_id.ilike.%advertise%');
      if (lower.includes('free')) orClauses.push('plan_id.ilike.%free_%');
      if (lower.includes('paid')) orClauses.push('plan_id.ilike.%paid_%');

      query = query.or(orClauses.join(','));
    }

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Fetch submitters using get_users_by_ids RPC with get_admin_users fallback
    const userMap: Record<string, Submitter> = {};
    const userIds = [
      ...new Set((data || []).map((o: any) => o.user_id).filter(Boolean)),
    ];

    if (userIds.length > 0) {
      try {
        const { data: usersData, error: rpcErr } = await supabaseAdmin.rpc(
          'get_users_by_ids',
          { p_ids: userIds }
        );
        let list = usersData;
        if (rpcErr || !list || list.length === 0) {
          const { data: fallbackData } = await supabaseAdmin.rpc('get_admin_users', {
            p_search: '',
            p_sort: 'created_at-desc',
            p_limit: 5000,
            p_offset: 0,
          });
          list = fallbackData;
        }

        (list || []).forEach((u: any) => {
          if (u?.id) {
            userMap[String(u.id).toLowerCase().trim()] = {
              id: u.id,
              email: u.email || null,
              full_name: u.full_name || u.name || null,
              avatar_url: u.avatar_url || u.picture || null,
            };
          }
        });
      } catch (e) {
        console.warn('Error fetching order submitters:', e);
      }
    }

    const enriched: Order[] = (data || []).map((o: any) => {
      const sKey = o.user_id ? String(o.user_id).toLowerCase().trim() : '';
      return {
        ...o,
        submitter: sKey ? userMap[sKey] || null : null,
      };
    });

    return {
      success: true,
      data: enriched,
      count: count ?? 0,
    };
  } catch (err: any) {
    console.error('getOrdersAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to fetch orders.',
    };
  }
}

/**
 * Safely update order status and metadata using service_role key.
 * Strictly prevents mutation of immutable financial & identity fields.
 * Requires `orders.can_update` permission.
 */
export async function updateOrderAction(
  orderId: string,
  payload: {
    status?: string;
    metadata?: any;
  },
  token: string
): Promise<ActionResponse<Order>> {
  try {
    const auth = await verifyAdminPermission(token, 'orders', 'update');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    // Only allow updating safe fields
    const safeUpdateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.status !== undefined) {
      safeUpdateData.status = payload.status;
    }

    if (payload.metadata !== undefined) {
      safeUpdateData.metadata = payload.metadata;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update(safeUpdateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: updated as Order,
    };
  } catch (err: any) {
    console.error('updateOrderAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to update order.',
    };
  }
}

/**
 * Permanently delete an order record using service_role key.
 * Requires `orders.can_delete` permission.
 */
export async function deleteOrderAction(
  orderId: string,
  token: string
): Promise<ActionResponse> {
  try {
    const auth = await verifyAdminPermission(token, 'orders', 'delete');
    if (!auth.authorized) {
      return { success: false, error: auth.error };
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error('deleteOrderAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to delete order.',
    };
  }
}
