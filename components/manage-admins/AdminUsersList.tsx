'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  UserPlus,
  Shield,
  ShieldCheck,
  UserCheck,
  Trash2,
  Lock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { AdminUser, ADMIN_MODULES } from './types';

interface AdminUsersListProps {
  users: AdminUser[];
  selectedUser: AdminUser | null;
  onSelectUser: (user: AdminUser) => void;
  onOpenAddModal: () => void;
  onOpenDeleteDialog: (user: AdminUser) => void;
  isLoading: boolean;
}

export default function AdminUsersList({
  users,
  selectedUser,
  onSelectUser,
  onOpenAddModal,
  onOpenDeleteDialog,
  isLoading,
}: AdminUsersListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'subadmin'>('all');

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = filterRole === 'all' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const getEnabledModulesCount = (user: AdminUser): number => {
    if (user.role === 'admin') return ADMIN_MODULES.length;
    if (!user.permissions) return 0;
    return Object.values(user.permissions).filter((p) => p.can_view).length;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-xs">
      {/* List Header */}
      <div className="p-5 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              Team Members
              <Badge variant="outline" className="text-[10px] font-bold">
                {users.length}
              </Badge>
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Admins & Sub-Admins directory</p>
          </div>
          <Button
            onClick={onOpenAddModal}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-3.5 rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <UserPlus size={14} />
            <span>Add Sub-Admin</span>
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          />
          <Input
            type="text"
            placeholder="Filter by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 pl-9.5 text-xs bg-[var(--bg-surface)] rounded-xl shadow-xs"
          />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)]/60">
          {(
            [
              { id: 'all', label: 'All', count: users.length },
              { id: 'admin', label: 'Admins', count: users.filter((u) => u.role === 'admin').length },
              {
                id: 'subadmin',
                label: 'Sub-Admins',
                count: users.filter((u) => u.role === 'subadmin').length,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterRole(tab.id)}
              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                filterRole === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                  filterRole === tab.id ? 'bg-white/20 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* User Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-8 h-8 mx-auto border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-xs text-[var(--text-muted)] font-medium">Loading team members...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
              <Search size={20} />
            </div>
            <p className="text-xs font-bold text-[var(--text-primary)]">No members found</p>
            <p className="text-[11px] text-[var(--text-muted)]">Try adjusting your search or role filter.</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = selectedUser?.id === user.id;
            const isSuper = user.role === 'admin';
            const enabledCount = getEnabledModulesCount(user);

            return (
              <div
                key={user.id}
                onClick={() => onSelectUser(user)}
                className={`group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'bg-indigo-500/[0.08] dark:bg-indigo-500/[0.12] border-indigo-500/50 shadow-sm shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border-[var(--border-color)]'
                }`}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r-full" />
                )}

                {/* Avatar */}
                <div className="shrink-0 w-11 h-11 rounded-2xl border border-indigo-500/20 p-0.5 overflow-hidden bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    <div
                      className={`w-full h-full rounded-[14px] flex items-center justify-center text-xs font-black text-white ${
                        isSuper
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600'
                          : 'bg-gradient-to-br from-emerald-600 to-teal-600'
                      }`}
                    >
                      {(user.full_name || user.email || 'A').substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {user.full_name || user.email.split('@')[0]}
                    </h3>
                    <span
                      className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md border uppercase shrink-0 ${
                        isSuper
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {isSuper ? 'Super Admin' : 'Sub-Admin'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{user.email}</p>

                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--text-muted)] font-medium">
                    {isSuper ? (
                      <span className="text-indigo-500 font-bold flex items-center gap-1">
                        <Sparkles size={11} />
                        Full Access
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock size={10} />
                        {enabledCount} of {ADMIN_MODULES.length} modules
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions & Chevron */}
                <div className="flex items-center gap-1">
                  {!isSuper && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDeleteDialog(user);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                      title="Remove Sub-Admin"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <ChevronRight
                    size={15}
                    className={`text-[var(--text-muted)] transition-transform ${
                      isSelected ? 'text-indigo-500 translate-x-0.5' : 'group-hover:translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
