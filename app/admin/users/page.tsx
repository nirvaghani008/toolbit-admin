'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import { Users, RefreshCw, Bookmark, ThumbsUp, Search } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import UsersTable, { UserRow } from '@/components/users/UsersTable';
import UserDetailsDrawer from '@/components/users/UserDetailsDrawer';
import {
  UserFullDetails,
  fetchAdminUserDetails,
} from '@/lib/services/user-details-service';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({ all: 0, active: 0, withSaved: 0 });
  const [sparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    active: [0, 0, 0, 0, 0, 0, 0],
    withSaved: [0, 0, 0, 0, 0, 0, 0],
  });

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
      // Return cached telemetry data immediately without querying
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

      // Fetch users with consolidated total_count from get_admin_users
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
          // Graceful fallback if migration has not been applied to live DB yet
          const { data: fallbackCount } = await supabase.rpc('get_admin_users_count', {
            p_search: searchQuery || null,
          });
          total = Number(fallbackCount) || rows.length;
        }
      }

      setUsers(merged);
      setTotalCount(total);
      setStats(prev => ({ ...prev, all: total }));
      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching users:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [currentPage, sortOrder, searchQuery]);
  useEffect(() => { if (searchInputValue === '') setSearchQuery(''); }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const [activeFilter, setActiveFilter] = useState<string>('all');

  const statCards = [
    {
      id: 'all',
      label: 'Total Users',
      value: stats.all,
      iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#364954] dark:text-zinc-400',
      icon: <Users size={17} />,
      points: sparklines.all,
      badge: 'All Users',
    },
    {
      id: 'withSaved',
      label: 'With Saved Tools',
      value: stats.active,
      iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
      icon: <Bookmark size={17} />,
      points: sparklines.active,
      badge: 'Active Bookmarks',
    },
    {
      id: 'withUpvoted',
      label: 'With Upvotes',
      value: stats.withSaved,
      iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      sparklineColor: 'text-[#8a652a] dark:text-amber-400',
      icon: <ThumbsUp size={17} />,
      points: sparklines.withSaved,
      badge: 'Contributors',
    },
  ];

  const filteredUsers = users.filter(user => {
    if (activeFilter === 'withSaved') return user.saved_count > 0;
    if (activeFilter === 'withUpvoted') return user.upvoted_count > 0;
    return true;
  });

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
        {statCards.map((stat) => {
          const isSelected = activeFilter === stat.id;
          return (
            <button
              key={stat.id}
              onClick={() => setActiveFilter(prev => prev === stat.id ? 'all' : stat.id)}
              className={`group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col text-left rounded-2xl border shadow-2xs cursor-pointer ${
                isSelected
                  ? 'bg-[#ebe8e2] dark:bg-zinc-800/90 border-zinc-700 dark:border-zinc-500 shadow-xs'
                  : 'bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30'
              }`}
              suppressHydrationWarning
            >
              <Sparkline
                color={stat.sparklineColor}
                points={stat.points}
                id={stat.id}
                isSelected={isSelected}
              />

              <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 ${stat.iconStyle}`}>
                  {stat.icon}
                </div>
                {isSelected ? (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border bg-zinc-800 text-zinc-100 border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600 shadow-2xs">
                    Selected
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs transition-colors ${stat.badgeStyle}`}>
                    {stat.badge}
                  </span>
                )}
              </div>

              <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 relative z-10 w-full space-y-1 pointer-events-none">
                <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
                  {stat.label}
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
                  <CountUp key={refreshKey} end={stat.value} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Sort */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            placeholder="Search by email or name..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1 h-11 px-4 text-sm"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="flex gap-2 min-w-[190px]">
          <Select
            value={`created_at-${sortOrder}`}
            onChange={(val) => setSortOrder(val.split('-')[1] as any)}
            className="h-11 min-w-[190px]"
            suppressHydrationWarning
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
          </Select>
        </div>
      </form>

      {/* Table */}
      <UsersTable
        users={filteredUsers}
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onSelectUser={handleSelectUser}
        isLoading={loading}
      />

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



