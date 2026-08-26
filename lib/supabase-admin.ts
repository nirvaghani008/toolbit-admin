import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
}

if (!supabaseServiceRoleKey) {
  console.warn('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Server-side admin operations will fail.');
}

/**
 * Server-only Supabase client initialized with the SERVICE_ROLE key.
 * This client bypasses Row Level Security (RLS) policies completely.
 * MUST NEVER be imported in client components or exposed to the browser.
 */
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export type AdminAction = 'view' | 'insert' | 'update' | 'delete';

export interface VerifyAuthResult {
  authorized: boolean;
  error?: string;
  user?: {
    id: string;
    email?: string;
  };
  role?: 'admin' | 'subadmin';
}

/**
 * Server-side RBAC verification helper.
 * Validates the caller's JWT token via Supabase Auth and checks whether their
 * role in `admin_roles` grants permission to perform the specified action on the target module.
 */
export async function verifyAdminPermission(
  token: string | undefined | null,
  module: string,
  action: AdminAction
): Promise<VerifyAuthResult> {
  if (!token || typeof token !== 'string') {
    return {
      authorized: false,
      error: 'Authentication required. Missing or invalid access token.',
    };
  }

  // 1. Authenticate user cryptographically against Supabase Auth
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user) {
    return {
      authorized: false,
      error: userError?.message || 'Invalid or expired session. Please log in again.',
    };
  }

  const userId = userData.user.id;

  // 2. Fetch role and granular permissions from public.admin_roles
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from('admin_roles')
    .select('role_name, permissions')
    .eq('user_id', userId)
    .single();

  if (roleError || !roleData) {
    return {
      authorized: false,
      error: 'Access denied: No administrative role found for this account.',
    };
  }

  const roleName = roleData.role_name;

  // Super Admin has unrestricted access to all modules and actions
  if (roleName === 'admin') {
    return {
      authorized: true,
      user: {
        id: userId,
        email: userData.user.email,
      },
      role: 'admin',
    };
  }

  // Sub-admin check against granular permissions JSONB
  if (roleName === 'subadmin') {
    const perms = (roleData.permissions || {}) as Record<string, any>;
    const modulePerms = perms[module];
    const permKey = `can_${action}`;

    const isPermitted = modulePerms && Boolean(modulePerms[permKey]);

    if (isPermitted) {
      return {
        authorized: true,
        user: {
          id: userId,
          email: userData.user.email,
        },
        role: 'subadmin',
      };
    }

    return {
      authorized: false,
      error: `Access denied: Sub-admin account does not have permission to ${action} ${module}.`,
    };
  }

  return {
    authorized: false,
    error: 'Access denied: Unauthorized role.',
  };
}
