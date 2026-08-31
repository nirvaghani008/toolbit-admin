'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import { Users, RefreshCw, ShieldAlert, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import UsersTable, { UserRow } from '@/components/users/UsersTable';
import UserDetailsDrawer from '@/components/users/UserDetailsDrawer';
import {
  UserFullDetails,
  fetchAdminUserDetails,
} from '@/lib/services/user-details-service';
import { useAdmin } from '@/contexts/AdminContext';

export default function UsersPage() {
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();
  const canView = isSuperAdmin || hasPermission('users', 'view');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const pageSize = 20;

  // Selected user and zero re-query cache
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, UserFullDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const loadUserDetails = async (userId: string, force = false) => {
    if (!force && detailsCache[userId]) {
      return;
    }

    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const data = await fetchAdminUserDetails(userId);
      setDetailsCache((prev) => ({ ...prev, [userId]: data }));
    } catch (err: any) {
      console.error('Error fetching user telemetry details:', err);
      setDetailsError(err?.message || 'Failed to load complete user details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectUser = (user: UserRow) => {
    setSelectedUser(user);
    loadUserDetails(user.id);
  };

  const handleRefreshUserDetails = () => {
    if (selectedUser) {
      loadUserDetails(selectedUser.id, true);
    }
  };

  const fetchUsers = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      const from = (currentPage - 1) * pageSize;

      // Fetch users with consolidated total_count from get_admin_users RPC
      const { data: rows, error: rowsError } = await supabase.rpc('get_admin_users', {
        p_search: searchQuery || null,
        p_sort: sortOrder,
        p_limit: pageSize,
        p_offset: from,
      });

      if (rowsError) {
        console.warn('get_admin_users error:', rowsError.message);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      const merged: UserRow[] = (rows || []).map((u: any) => ({
        id: u.id,
        email: u.email || '—',
        full_name: u.full_name || null,
        avatar_url: u.avatar_url || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        saved_count: u.saved_count ?? 0,
        upvoted_count: u.upvoted_count ?? 0,
      }));

      // total_count is provided directly in each row via COUNT(*) OVER()
      let total = 0;
      if (rows && rows.length > 0) {
        if (rows[0].total_count !== undefined) {
          total = Number(rows[0].total_count) || 0;
        } else {
          total = rows.length;
        }
      }

      setUsers(merged);
      setTotalCount(total);
      if (manual) setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching users:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch users whenever pagination, sorting, search query, or permissions change
  useEffect(() => {
    if (canView) {
      fetchUsers();
    }
  }, [currentPage, sortOrder, searchQuery, canView]);

  // Issue 4 Fix: Automatically synchronize search state & reset page to 1 when search input is cleared
  useEffect(() => {
    if (searchInputValue === '' && searchQuery !== '') {
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [searchInputValue, searchQuery]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue.trim());
  };

  const handleClearSearch = () => {
    setSearchInputValue('');
    if (searchQuery !== '') {
      setCurrentPage(1);
      setSearchQuery('');
    }
  };

  // While authenticating, show spinner
  if (isAuthorized === null) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  // Issue 5 Fix: Strict frontend RBAC access restriction state for unauthorized subadmins
  if (isAuthorized && !canView) {
    return (
      <div className="animate-fade-in max-w-7xl mx-auto p-6 md:p-8">
        <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 shadow-sm">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Access Restricted</h2>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-md">
            You do not have permission to view or manage registered user accounts. Please contact your Super Administrator for access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">User Accounts</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Platform registered users and user activity statistics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fetchUsers(true)}
            disabled={isRefreshing}
            className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            suppressHydrationWarning
          >
            {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="group relative overflow-hidden flex flex-col text-left rounded-2xl border shadow-2xs bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] p-5">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-2xs text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700">
              <Users size={18} />
            </div>
            <span className="px-2.5 py-0.5 text-[9px] font-bold rounded-full border bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700">
              Platform Accounts
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)]">
              Total Registered Users
            </div>
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
              <CountUp key={refreshKey} end={totalCount} />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Sort */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2 relative">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Search by email or name..."
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              className="w-full h-11 px-4 pr-10 text-sm"
              suppressHydrationWarning
            />
            {searchInputValue && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 shrink-0"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="flex gap-2 min-w-[190px]">
          <Select
            value={`created_at-${sortOrder}`}
            onChange={(val) => {
              setSortOrder(val.split('-')[1] as any);
              setCurrentPage(1);
            }}
            className="h-11 min-w-[190px]"
            suppressHydrationWarning
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
          </Select>
        </div>
      </form>

      {/* Table */}
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
              <Spinner size={20} />
            </div>
          </div>
        )}
        <UsersTable
          users={users}
          totalCount={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onSelectUser={handleSelectUser}
          isLoading={loading}
        />
      </div>

      {/* User Details Slide-over Drawer */}
      <UserDetailsDrawer
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        details={selectedUser ? detailsCache[selectedUser.id] || null : null}
        isLoading={detailsLoading}
        error={detailsError}
        onRefresh={handleRefreshUserDetails}
      />
    </div>
  );
}
