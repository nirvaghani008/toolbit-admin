'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Users, RefreshCw, Bookmark, ThumbsUp, Search } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import UsersTable, { UserRow } from '@/components/users/UsersTable';

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

  const fetchUsers = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      const from = (currentPage - 1) * pageSize;

      // Use SECURITY DEFINER RPC functions that can access auth.users + user_profiles
      const [{ data: rows, error: rowsError }, { data: countData }] = await Promise.all([
        supabase.rpc('get_admin_users', {
          p_search: searchQuery || null,
          p_sort: sortOrder,
          p_limit: pageSize,
          p_offset: from,
        }),
        supabase.rpc('get_admin_users_count', {
          p_search: searchQuery || null,
        }),
      ]);

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

      const total = Number(countData) || 0;

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
    { id: 'all', label: 'Total Users', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Users size={18} />, points: sparklines.all },
    { id: 'withSaved', label: 'With Saved Tools', value: stats.active, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <Bookmark size={18} />, points: sparklines.active },
    { id: 'withUpvoted', label: 'With Upvotes', value: stats.withSaved, color: 'text-cyan-500', bg: 'bg-cyan-500/10', hex: '#06b6d4', icon: <ThumbsUp size={18} />, points: sparklines.withSaved },
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            User Accounts
            <Badge variant="default" className="text-xs font-semibold">
              Database
            </Badge>
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Platform registered users and user activity statistics.
          </p>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={() => fetchUsers(true)}
          disabled={isRefreshing}
          className="font-semibold shadow-xs"
          suppressHydrationWarning
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
          {isRefreshing ? 'Syncing...' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {statCards.map((stat) => (
          <button
            key={stat.id}
            onClick={() => setActiveFilter(prev => prev === stat.id ? 'all' : stat.id)}
            className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col ${
              activeFilter === stat.id
                ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md'
                : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
            }`}
            style={activeFilter === stat.id ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` } : undefined}
            suppressHydrationWarning
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                activeFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{ backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${activeFilter === stat.id ? '15' : '05'}, transparent)` }}
            />
            <Sparkline color={stat.color} points={stat.points} id={stat.id} isSelected={activeFilter === stat.id} />
            {activeFilter === stat.id && (
              <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                <div className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75" style={{ backgroundColor: stat.hex }} />
                <div className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }} />
              </div>
            )}
            <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}>
                {stat.icon}
              </div>
            </div>
            <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
              <div className={`text-[10px] font-bold uppercase tracking-wider truncate ${activeFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'}`}>
                {stat.label}
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                <CountUp key={refreshKey} end={stat.value} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search & Sort */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            />
            <Input
              type="text"
              placeholder="Search by email or name..."
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              className="h-11 pl-10 shadow-xs"
              suppressHydrationWarning
            />
          </div>
          <Button
            type="submit"
            variant="default"
            className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/10"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="flex gap-2 min-w-[190px]">
          <Select
            value={`created_at-${sortOrder}`}
            onChange={(val) => setSortOrder(val.split('-')[1] as any)}
            className="h-11 shadow-xs min-w-[190px]"
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
        isLoading={loading}
      />
    </div>
  );
}

