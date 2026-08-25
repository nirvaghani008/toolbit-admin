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
        <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--bg-surface)] border border-rose-500/20 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto shadow-md">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight uppercase">
            Access Restricted
          </h2>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The User & Sub-Admin Governance portal is restricted exclusively to Super Administrators. You do not have sufficient permissions to view or configure team roles.
          </p>
          <div className="pt-2">
            <Link href="/admin/dashboard">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-6 rounded-2xl shadow-md gap-2">
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
            <Badge variant="default" className="text-xs font-semibold bg-indigo-600 text-white">
              Super Admin Only
            </Badge>
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Create sub-admins and configure granular page-by-page and action-by-action (View, Insert, Update, Delete) permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="default"
            onClick={() => fetchTeamMembers(true)}
            disabled={isRefreshing}
            className="font-semibold shadow-xs gap-2 cursor-pointer"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[#6366f1] flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Total Team Size
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {users.length}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Super Admins
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {superAdminsCount}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
            <KeyRound size={22} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Restricted Sub-Admins
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {subAdminsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split-View Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[640px] items-start">
        {/* Left Column: Team Directory List (5 Cols on large screens) */}
        <div className="lg:col-span-5 h-[640px]">
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
        <div className="lg:col-span-7 h-[640px]">
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
