'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  UserPlus,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { AdminUser } from './types';

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
            className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold h-9 px-3.5 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <UserPlus size={14} />
            <span>Add Member</span>
          </Button>
        </div>

        {/* Search & Role Filter Dropdown Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            />
            <Input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-9.5 text-xs bg-[var(--bg-surface)] rounded-xl shadow-xs"
            />
          </div>

          <div className="w-[125px] shrink-0">
            <Select
              value={filterRole}
              onChange={(val) => setFilterRole(val as 'all' | 'admin' | 'subadmin')}
              className="h-10 text-xs bg-[var(--bg-surface)] rounded-xl shadow-xs"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins</option>
              <option value="subadmin">Sub-Admins</option>
            </Select>
          </div>
        </div>
      </div>

      {/* User Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-8 h-8 mx-auto border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-200 rounded-full animate-spin" />
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

            return (
              <div
                key={user.id}
                onClick={() => onSelectUser(user)}
                className={`group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#fbfaf8] dark:bg-[var(--bg-elevated)] border-zinc-900 dark:border-zinc-400 shadow-xs ring-1 ring-zinc-900/10 dark:ring-zinc-400/20'
                    : 'bg-[var(--bg-surface)] hover:bg-[#faf9f7] dark:hover:bg-[var(--bg-elevated)]/60 border-[#e5e3df] dark:border-[var(--border-color)]'
                }`}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-zinc-900 dark:bg-zinc-100 rounded-r-full" />
                )}

                {/* Avatar */}
                <div className="shrink-0 w-10 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 p-0.5 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-2xs">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div
                      className={`w-full h-full rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSuper
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
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
                    <Badge
                      variant={isSuper ? 'default' : 'slate'}
                      className="text-[8px] font-bold tracking-wider px-1.5 py-0.2 shrink-0 uppercase"
                    >
                      {isSuper ? 'Admin' : 'Sub-Admin'}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{user.email}</p>
                </div>

                {/* Actions & Chevron */}
                <div className="flex items-center gap-1">
                  {!isSuper && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDeleteDialog(user);
                      }}
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 transition-all cursor-pointer shadow-2xs"
                      title="Remove Sub-Admin"
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                  <ChevronRight
                    size={15}
                    className={`text-[var(--text-muted)] transition-transform ${
                      isSelected ? 'text-zinc-900 dark:text-zinc-100 translate-x-0.5' : 'group-hover:translate-x-0.5'
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

