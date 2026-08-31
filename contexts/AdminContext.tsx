'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export interface AdminProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type PermissionAction = 'view' | 'insert' | 'update' | 'delete';

export interface ModulePermission {
  can_view: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export type AdminRole = 'admin' | 'subadmin' | string;

interface AdminContextType {
  isAuthorized: boolean | null;
  adminData: AdminProfile | null;
  role: AdminRole | null;
  isSuperAdmin: boolean;
  permissions: Record<string, ModulePermission>;
  hasPermission: (module: string, action?: PermissionAction) => boolean;
  signOut: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// ── Cache key stored in sessionStorage ──────────────────────────────────────
const CACHE_KEY = 'tb_admin_verified';
const PERMS_CACHE_KEY = 'tb_admin_perms';

interface CachedAuth {
  userId: string;
  profile: AdminProfile;
  role: AdminRole;
  permissions?: Record<string, ModulePermission>;
}

function readCache(): CachedAuth | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, profile: AdminProfile, role: AdminRole, permissions: Record<string, ModulePermission> = {}) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId, profile, role, permissions }));
  } catch {
    /* ignore */
  }
}

function clearCache() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(PERMS_CACHE_KEY);
    localStorage.removeItem('admin_sidebar_collapsed');
  } catch {
    /* ignore */
  }
}

// Default super admin permissions set
export const ALL_MODULES = [
  'dashboard',
  'tools',
  'categories',
  'tags',
  'reviews',
  'reports',
  'blog_posts',
  'models',
  'news',
  'socials',
  'submissions',
  'advertise',
  'orders',
  'users',
  'newsletter',
  'contacts',
  'profiles',
  'manage_admins',
] as const;

export function getFullAdminPermissions(): Record<string, ModulePermission> {
  const perms: Record<string, ModulePermission> = {};
  ALL_MODULES.forEach((mod) => {
    perms[mod] = { can_view: true, can_insert: true, can_update: true, can_delete: true };
  });
  return perms;
}

// ── Derive initial state SYNCHRONOUSLY from cache + Supabase localStorage ───
function getInitialState(): {
  isAuthorized: boolean | null;
  adminData: AdminProfile | null;
  role: AdminRole | null;
  permissions: Record<string, ModulePermission>;
} {
  if (typeof window === 'undefined') return { isAuthorized: null, adminData: null, role: null, permissions: {} };
  const cached = readCache();
  if (!cached) return { isAuthorized: null, adminData: null, role: null, permissions: {} };

  try {
    const keys = Object.keys(localStorage);
    const sessionKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!sessionKey) return { isAuthorized: null, adminData: null, role: null, permissions: {} };

    const sessionRaw = localStorage.getItem(sessionKey);
    if (!sessionRaw) return { isAuthorized: null, adminData: null, role: null, permissions: {} };

    const sessionData = JSON.parse(sessionRaw);
    const userId = sessionData?.user?.id;

    if (userId && userId === cached.userId) {
      return {
        isAuthorized: true,
        adminData: cached.profile,
        role: cached.role,
        permissions: cached.permissions || (cached.role === 'admin' ? getFullAdminPermissions() : {}),
      };
    }
  } catch {
    /* ignore parse errors */
  }

  return { isAuthorized: null, adminData: null, role: null, permissions: {} };
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const initial = useRef(getInitialState());

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(initial.current.isAuthorized);
  const [adminData, setAdminData] = useState<AdminProfile | null>(initial.current.adminData);
  const [role, setRole] = useState<AdminRole | null>(initial.current.role);
  const [permissions, setPermissions] = useState<Record<string, ModulePermission>>(initial.current.permissions);
  const router = useRouter();

  const isSuperAdmin = role === 'admin';

  const hasPermission = useCallback(
    (module: string, action: PermissionAction = 'view'): boolean => {
      // manage_admins is strictly restricted to Super Admin role
      if (module === 'manage_admins') {
        return role === 'admin';
      }

      if (!role) return false;

      // Direct module check
      const modPerm = permissions[module];
      if (modPerm) {
        if (action === 'view') return !!modPerm.can_view;
        if (action === 'insert') return !!modPerm.can_insert;
        if (action === 'update') return !!modPerm.can_update;
        if (action === 'delete') return !!modPerm.can_delete;
      }

      // Group fallback checks for sub-modules
      if (['categories', 'tags', 'reviews', 'reports'].includes(module)) {
        const directPerm = permissions[module];
        if (directPerm) {
          if (action === 'view') return !!directPerm.can_view;
          if (action === 'insert') return !!directPerm.can_insert;
          if (action === 'update') return !!directPerm.can_update;
          if (action === 'delete') return !!directPerm.can_delete;
        }

        const parentPerm = permissions['tools'];
        if (parentPerm) {
          if (action === 'view') return !!parentPerm.can_view;
          if (action === 'insert') return !!parentPerm.can_insert;
          if (action === 'update') return !!parentPerm.can_update;
          if (action === 'delete') return !!parentPerm.can_delete;
        }
      }

      if (module === 'newsletter') {
        const parentPerm = permissions['users'];
        if (parentPerm) {
          if (action === 'view') return !!parentPerm.can_view;
          if (action === 'insert') return !!parentPerm.can_insert;
          if (action === 'update') return !!parentPerm.can_update;
          if (action === 'delete') return !!parentPerm.can_delete;
        }
      }

      if (['tool_submissions', 'advertise', 'orders'].includes(module)) {
        const parentPerm = permissions['submissions'];
        if (parentPerm) {
          if (action === 'view') return !!parentPerm.can_view;
          if (action === 'insert') return !!parentPerm.can_insert;
          if (action === 'update') return !!parentPerm.can_update;
          if (action === 'delete') return !!parentPerm.can_delete;
        }
      }

      // If Super Admin and no custom permissions object restricts this module, default to true
      if (role === 'admin') {
        return true;
      }

      return false;
    },
    [role, permissions]
  );

  // ── Full auth & role verification ──────────────────────────────────────────
  const verifyAdmin = useCallback(
    async (silent = false) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          clearCache();
          setIsAuthorized(false);
          setAdminData(null);
          setRole(null);
          setPermissions({});
          router.push('/login');
          return;
        }

        const cached = readCache();
        if (silent && cached?.userId === session.user.id && cached.role) {
          return;
        }

        // Verify role and permissions in admin_roles table
        const { data: roleData, error: roleError } = await supabase
          .from('admin_roles')
          .select('role_name, permissions')
          .eq('user_id', session.user.id)
          .single();

        if (roleError || !roleData || !['admin', 'subadmin'].includes(roleData.role_name)) {
          clearCache();
          await supabase.auth.signOut();
          setIsAuthorized(false);
          setAdminData(null);
          setRole(null);
          setPermissions({});
          router.push('/login');
          return;
        }

        const currentRole = roleData.role_name as AdminRole;
        const profile: AdminProfile = {
          id: session.user.id,
          email: session.user.email ?? (session.user.user_metadata?.email as string) ?? null,
          full_name:
            (session.user.user_metadata?.full_name as string) ||
            (session.user.user_metadata?.name as string) ||
            session.user.email?.split('@')[0] ||
            'Admin',
          avatar_url:
            (session.user.user_metadata?.avatar_url as string) ||
            (session.user.user_metadata?.picture as string) ||
            null,
        };

        let userPerms: Record<string, ModulePermission> = {};

        if (roleData.permissions && Object.keys(roleData.permissions).length > 0) {
          userPerms = roleData.permissions as Record<string, ModulePermission>;
        } else if (currentRole === 'admin') {
          userPerms = getFullAdminPermissions();
        } else {
          userPerms = {};
        }

        writeCache(session.user.id, profile, currentRole, userPerms);

        setIsAuthorized(true);
        setRole(currentRole);
        setAdminData(profile);
        setPermissions(userPerms);
      } catch (err) {
        console.error('Admin auth verification error:', err);
        if (!initial.current.isAuthorized) {
          setIsAuthorized(false);
          setAdminData(null);
          setRole(null);
          setPermissions({});
        }
      }
    },
    [router]
  );

  useEffect(() => {
    let active = true;
    const silentMode = initial.current.isAuthorized === true;
    if (active) verifyAdmin(silentMode);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session) {
        clearCache();
        setIsAuthorized(false);
        setAdminData(null);
        setRole(null);
        setPermissions({});
        router.push('/login');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [verifyAdmin, router]);

  const signOut = useCallback(async () => {
    clearCache();
    setIsAuthorized(false);
    setAdminData(null);
    setRole(null);
    setPermissions({});
    await supabase.auth.signOut();
    router.push('/login');
  }, [router]);

  const refreshAdmin = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const profile: AdminProfile = {
      id: user.id,
      email: user.email ?? (user.user_metadata?.email as string) ?? null,
      full_name:
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split('@')[0] ||
        'Admin',
      avatar_url:
        (user.user_metadata?.avatar_url as string) ||
        (user.user_metadata?.picture as string) ||
        null,
    };

    setAdminData(profile);
  }, []);

  return (
    <AdminContext.Provider
      value={{
        isAuthorized,
        adminData,
        role,
        isSuperAdmin,
        permissions,
        hasPermission,
        signOut,
        refreshAdmin,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
