'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Database, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import SubscriberTable, { Subscriber } from '@/components/newsletter/SubscriberTable';
import {
  getNewsletterSubscribersAction,
  getNewsletterStatsAction,
  updateNewsletterSubscriberStatusAction,
  deleteNewsletterSubscriberAction,
} from './actions';

export default function NewsletterPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'newsletter' module
  const canView = isSuperAdmin || hasPermission('newsletter', 'view');
  const canUpdate = isSuperAdmin || hasPermission('newsletter', 'update');
  const canDelete = isSuperAdmin || hasPermission('newsletter', 'delete');

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState({ all: 0, active: 0, unsubscribed: 0 });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    active: [0, 0, 0, 0, 0, 0, 0],
    unsubscribed: [0, 0, 0, 0, 0, 0, 0],
  });

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unsubscribed'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const pageSize = 20;

  const getAuthToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  const fetchStats = useCallback(async () => {
    if (!canView) return;
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await getNewsletterStatsAction(token);
      if (res.success && res.stats && res.sparklines) {
        setStats(res.stats);
        setSparklines(res.sparklines);
        setRefreshKey((prev) => prev + 1);
      } else if (res.error) {
        console.warn('Warning fetching newsletter stats:', res.error);
      }
    } catch (err: any) {
      console.warn('Error fetching newsletter stats:', err?.message || err);
    }
  }, [canView, getAuthToken]);

  const fetchSubscribers = useCallback(
    async (manual = false) => {
      if (!canView) return;
      if (manual) setIsRefreshing(true);
      setLoading(true);

      try {
        if (manual) await fetchStats();

        const token = await getAuthToken();
        if (!token) {
          setLoading(false);
          setIsRefreshing(false);
          return;
        }

        const [listRes] = await Promise.all([
          getNewsletterSubscribersAction(
            {
              page: currentPage,
              pageSize,
              search: searchQuery,
              statusFilter,
              sortOrder,
            },
            token
          ),
        ]);

        if (listRes.success && listRes.data) {
          setSubscribers(listRes.data);
          setTotalCount(listRes.totalCount ?? 0);
        } else if (listRes.error) {
          throw new Error(listRes.error);
        }
      } catch (err: any) {
        console.warn('Error fetching subscribers:', err?.message || err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [canView, currentPage, pageSize, searchQuery, statusFilter, sortOrder, getAuthToken, fetchStats]
  );

  useEffect(() => {
    if (canView) {
      fetchSubscribers();
    }
  }, [canView, fetchSubscribers]);

  useEffect(() => {
    if (searchInputValue === '') setSearchQuery('');
  }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleStatusChange = async (id: number | string, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update subscriber status.');
      return;
    }
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateNewsletterSubscriberStatusAction(id, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update subscriber status.');
      }

      // Optimistically reflect the change so the badge updates immediately.
      setSubscribers((prev) =>
        prev.map((s) => (s.id === Number(id) || s.id === id ? { ...s, status: newStatus } : s))
      );
      
      // Refresh list and stats in parallel without duplicate triggers
      await fetchSubscribers(true);
    } catch (err: any) {
      console.error('Error updating subscriber status:', err);
      alert(err.message || 'Failed to update subscriber status.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async (id: number, email?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete subscribers.');
      return;
    }
    const confirmed = await confirmDelete({
      title: 'Delete Subscriber',
      itemName: email,
      message:
        'Are you sure you want to permanently remove this subscriber? This action cannot be undone.',
    });
    if (!confirmed) return;

    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteNewsletterSubscriberAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete subscriber.');
      }

      // Refresh list and stats in parallel without duplicate triggers
      await fetchSubscribers(true);
    } catch (err: any) {
      console.error('Error deleting subscriber:', err);
      alert(err.message || 'Failed to delete subscriber.');
    } finally {
      setIsRefreshing(false);
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

  // Unauthorized state for subadmins lacking newsletter permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or manage Newsletter Subscribers.
          Please contact a Super Administrator if you require access to this section.
        </p>
      </div>
    );
  }

  const statCards = [
    {
      id: 'all',
      label: 'Total Subscribers',
      value: stats.all,
      iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#364954] dark:text-zinc-400',
      icon: <Database size={17} />,
      points: sparklines.all,
      badge: 'All Subscribers',
    },
    {
      id: 'active',
      label: 'Subscribed',
      value: stats.active,
      iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
      icon: <CheckCircle2 size={17} />,
      points: sparklines.active,
      badge: 'Active Members',
    },
    {
      id: 'inactive',
      label: 'Unsubscribed',
      value: stats.unsubscribed,
      iconStyle: 'text-[#5c3838] bg-[#f6f1f1] border-[#e2d3d3] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badgeStyle: 'bg-[#f6f1f1] text-[#5c3838] border-[#e2d3d3] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      sparklineColor: 'text-[#5c3838] dark:text-rose-400',
      icon: <XCircle size={17} />,
      points: sparklines.unsubscribed,
      badge: 'Inactive',
    },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Newsletter Subscribers</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Grow, nurture, and track platform audience subscriptions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fetchSubscribers(true)}
            disabled={isRefreshing}
            className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            suppressHydrationWarning
          >
            {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {statCards.map((stat) => {
          const isSelected = statusFilter === stat.id;
          return (
            <button
              key={stat.id}
              onClick={() => {
                setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
                setCurrentPage(1);
              }}
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
            placeholder="Search by email address..."
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
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
              <Spinner size={20} />
            </div>
          </div>
        )}
        <SubscriberTable
          subscribers={subscribers}
          totalCount={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          isLoading={loading}
        />
      </div>
    </div>
  );
}
