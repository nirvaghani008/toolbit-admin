'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  RefreshCw,
  Lock,
  ArrowLeft,
  Users,
  Shield,
  KeyRound,
  Layers,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import AdminUsersList from '@/components/manage-admins/AdminUsersList';
import PermissionsMatrix from '@/components/manage-admins/PermissionsMatrix';
import AddSubAdminModal from '@/components/manage-admins/AddSubAdminModal';
import DeleteAdminDialog from '@/components/manage-admins/DeleteAdminDialog';
import { AdminUser, ModulePermission, ADMIN_MODULES } from '@/components/manage-admins/types';
import Sparkline from '@/components/common/Sparkline';
import { Spinner } from '@/components/ui/spinner';

export default function ManageAdminsPage() {
  const { isSuperAdmin, isAuthorized, role } = useAdmin();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<AdminUser | null>(null);

  // Fetch admin and sub-admin team members
  const fetchTeamMembers = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // 1. Try get_admin_team_members RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_team_members');

      if (!rpcError && Array.isArray(rpcData)) {
        const mappedUsers: AdminUser[] = rpcData.map((u: any) => ({
          id: u.id,
          email: u.email || '—',
          full_name: u.full_name || null,
          avatar_url: u.avatar_url || null,
          role: u.role || 'subadmin',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          granted_by: u.granted_by,
          granted_at: u.granted_at,
          permissions: u.permissions || {},
        }));

        setUsers(mappedUsers);

        // Keep selected user or select first user
        setSelectedUser((prev) => {
          if (!prev) return mappedUsers[0] || null;
          const found = mappedUsers.find((item) => item.id === prev.id);
          return found || mappedUsers[0] || null;
        });
      } else {
        // Fallback: Query admin_roles directly with permissions
        const { data: rolesData, error: rolesError } = await supabase
          .from('admin_roles')
          .select('id, user_id, role_name, permissions, granted_by, granted_at, created_at')
          .in('role_name', ['admin', 'subadmin']);

        if (rolesError) throw rolesError;

        const fallbackUsers: AdminUser[] = (rolesData || []).map((r: any) => ({
          id: r.user_id,
          email: r.role_name === 'admin' ? 'admin@toolbit.ai' : `user-${r.user_id.substring(0, 6)}@toolbit.ai`,
          full_name: r.role_name === 'admin' ? 'Super Admin' : 'Sub Admin',
          role: r.role_name as 'admin' | 'subadmin',
          created_at: r.created_at || new Date().toISOString(),
          granted_by: r.granted_by,
          granted_at: r.granted_at,
          permissions: (r.permissions as Record<string, ModulePermission>) || {},
        }));

        setUsers(fallbackUsers);
        setSelectedUser((prev) => {
          if (!prev) return fallbackUsers[0] || null;
          const found = fallbackUsers.find((item) => item.id === prev.id);
          return found || fallbackUsers[0] || null;
        });
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTeamMembers();
    }
  }, [isSuperAdmin, fetchTeamMembers]);

  // If unauthorized or sub-admin trying to access this page
  if (isAuthorized && !isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--bg-surface)] border border-zinc-200 dark:border-zinc-800 text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto shadow-2xs">
            <Lock size={24} />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Access Restricted
          </h2>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The User & Sub-Admin Governance portal is restricted exclusively to Super Administrators. You do not have sufficient permissions to view or configure team roles.
          </p>
          <div className="pt-2">
            <Link href="/admin/dashboard">
              <Button className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold h-11 px-6 rounded-xl shadow-xs gap-2">
                <ArrowLeft size={16} />
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const superAdminsCount = users.filter((u) => u.role === 'admin').length;
  const subAdminsCount = users.filter((u) => u.role === 'subadmin').length;

  return (
    <div className="animate-fade-in max-w-[1700px] mx-auto p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              Manage Admins & Access
            </h1>
            <Badge variant="slate" className="text-[10px] font-bold uppercase tracking-wider">
              Admin Only
            </Badge>
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Configure granular page-by-page and action-by-action (View, Insert, Update, Delete) permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fetchTeamMembers(true)}
            disabled={isRefreshing}
            className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            suppressHydrationWarning
          >
            {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Team Size */}
        <div className="group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col rounded-2xl border bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30 shadow-2xs">
          <Sparkline color="text-[#364954] dark:text-zinc-400" id="team-size" />
          <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700">
              <Users size={17} />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700">
              All Members
            </span>
          </div>
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 relative z-10 w-full space-y-1 pointer-events-none">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
              Total Team Size
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
              {users.length}
            </div>
          </div>
        </div>

        {/* Admins */}
        <div className="group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col rounded-2xl border bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30 shadow-2xs">
          <Sparkline color="text-[#8a652a] dark:text-amber-400" id="super-admins" />
          <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20">
              <ShieldCheck size={17} />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
              Full Access
            </span>
          </div>
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 relative z-10 w-full space-y-1 pointer-events-none">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
              Super Admins
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
              {superAdminsCount}
            </div>
          </div>
        </div>

        {/* Sub-Admins */}
        <div className="group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col rounded-2xl border bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30 shadow-2xs">
          <Sparkline color="text-[#3c5748] dark:text-emerald-400" id="sub-admins" />
          <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20">
              <KeyRound size={17} />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
              Custom Roles
            </span>
          </div>
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 relative z-10 w-full space-y-1 pointer-events-none">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
              Sub-Admins
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
              {subAdminsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split-View Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Team Directory List (5 Cols on large screens) */}
        <div className="lg:col-span-5 h-[800px]">
          <AdminUsersList
            users={users}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenDeleteDialog={(u) => setDeleteTargetUser(u)}
            isLoading={isLoading}
          />
        </div>

        {/* Right Column: Permissions Matrix (7 Cols on large screens) */}
        <div className="lg:col-span-7 h-[800px]">
          <PermissionsMatrix
            user={selectedUser}
            onPermissionsUpdated={() => fetchTeamMembers(false)}
          />
        </div>
      </div>

      {/* Modals */}
      <AddSubAdminModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          fetchTeamMembers(false);
        }}
      />

      <DeleteAdminDialog
        user={deleteTargetUser}
        isOpen={!!deleteTargetUser}
        onClose={() => setDeleteTargetUser(null)}
        onSuccess={() => {
          fetchTeamMembers(false);
        }}
      />
    </div>
  );
}


