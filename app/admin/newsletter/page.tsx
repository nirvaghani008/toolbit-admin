'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import CountUp from '@/components/common/CountUp';
import { Database, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import SubscriberTable, { Subscriber } from '@/components/newsletter/SubscriberTable';

export default function NewsletterPage() {
  const confirmDelete = useConfirm();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
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

  const fetchStats = useCallback(async () => {
    try {
      const [{ count: cAll }, { count: cActive }, { count: cInactive }] = await Promise.all([
        supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }),
        supabase
          .from('newsletter_subscribers')
          .select('*', { count: 'exact', head: true })
          .in('status', ['active', 'subscribed']),
        supabase
          .from('newsletter_subscribers')
          .select('*', { count: 'exact', head: true })
          .in('status', ['inactive', 'unsubscribed']),
      ]);
      setStats({ all: cAll || 0, active: cActive || 0, unsubscribed: cInactive || 0 });

      const trends = await fetchSparklinesForStatuses(
        'newsletter_subscribers',
        [null, 'active', 'inactive'],
        'created_at',
        7
      );
      setSparklines({
        all: trends['all'] || [0, 0, 0, 0, 0, 0, 0],
        active: trends['active'] || [0, 0, 0, 0, 0, 0, 0],
        unsubscribed: trends['inactive'] || [0, 0, 0, 0, 0, 0, 0],
      });
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching newsletter stats:', err?.message || err);
    }
  }, []);

  const fetchSubscribers = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      setLoading(true);
      try {
        if (manual) fetchStats();

        let query = supabase.from('newsletter_subscribers').select('*', { count: 'exact' });

        if (searchQuery) query = query.ilike('email', `%${searchQuery}%`);
        if (statusFilter === 'active') query = query.in('status', ['active', 'subscribed']);
        if (statusFilter === 'unsubscribed') query = query.in('status', ['inactive', 'unsubscribed']);

        query = query
          .order('created_at', { ascending: sortOrder === 'asc' })
          .order('id', { ascending: sortOrder === 'asc' });

        const from = (currentPage - 1) * pageSize;
        query = query.range(from, from + pageSize - 1);

        const { data, count, error } = await query;
        if (error) throw error;
        setSubscribers(data || []);
        setTotalCount(count || 0);
      } catch (err: any) {
        console.warn('Error fetching subscribers:', err?.message || err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentPage, statusFilter, sortOrder, searchQuery, fetchStats]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  useEffect(() => {
    if (searchInputValue === '') setSearchQuery('');
  }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleStatusToggle = async (sub: Subscriber) => {
    const isCurrentlyActive = sub.status === 'active' || sub.status === 'subscribed';
    const newStatus = isCurrentlyActive ? 'inactive' : 'active';
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ status: newStatus })
        .eq('id', sub.id);
      if (error) throw error;
      await fetchStats();
      await fetchSubscribers(true);
    } catch (err: any) {
      console.error('Error updating subscriber status:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Subscriber',
      message:
        'Are you sure you want to permanently remove this subscriber? This action cannot be undone.',
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('newsletter_subscribers').delete().eq('id', id);
      if (error) throw error;
      await fetchStats();
      await fetchSubscribers();
    } catch (err) {
      console.error('Error deleting subscriber:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const statCards = [
    {
      id: 'all',
      label: 'Total Subscribers',
      value: stats.all,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
      hex: '#6366f1',
      icon: <Database size={18} />,
      points: sparklines.all,
    },
    {
      id: 'active',
      label: 'Active',
      value: stats.active,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      hex: '#10b981',
      icon: <CheckCircle2 size={18} />,
      points: sparklines.active,
    },
    {
      id: 'unsubscribed',
      label: 'Inactive',
      value: stats.unsubscribed,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      hex: '#f43f5e',
      icon: <XCircle size={18} />,
      points: sparklines.unsubscribed,
    },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            Newsletter Subscribers
            <Badge variant="default" className="text-xs font-semibold px-2.5 py-0.5 rounded-full">
              Audience
            </Badge>
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Manage your mailing list and subscription statuses.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSubscribers(true)}
          disabled={isRefreshing}
          className="gap-2 font-semibold shadow-xs"
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
            onClick={() => {
              setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
              setCurrentPage(1);
            }}
            className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col ${
              statusFilter === stat.id
                ? 'bg-[var(--bg-elevated)] shadow-md'
                : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
            }`}
            style={
              statusFilter === stat.id
                ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` }
                : undefined
            }
            suppressHydrationWarning
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${
                  statusFilter === stat.id ? '15' : '05'
                }, transparent)`,
              }}
            />
            <Sparkline
              color={stat.color}
              points={stat.points}
              id={stat.id}
              isSelected={statusFilter === stat.id}
            />
            {statusFilter === stat.id && (
              <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                <div
                  className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75"
                  style={{ backgroundColor: stat.hex }}
                />
                <div
                  className="relative w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }}
                />
              </div>
            )}
            <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}
              >
                {stat.icon}
              </div>
            </div>
            <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
              <div
                className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                  statusFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'
                }`}
              >
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
          <Input
            type="text"
            placeholder="Search by email address..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            variant="default"
            className="px-6 font-bold shadow-xs"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="w-full md:w-[200px] shrink-0">
          <Select
            value={`created_at-${sortOrder}`}
            onChange={(val) => setSortOrder(val.split('-')[1] as any)}
            options={[
              { value: 'created_at-desc', label: 'Newest First' },
              { value: 'created_at-asc', label: 'Oldest First' },
            ]}
            suppressHydrationWarning
          />
        </div>
      </form>

      {/* Table */}
      <SubscriberTable
        subscribers={subscribers}
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onStatusToggle={handleStatusToggle}
        onDelete={handleDelete}
        isLoading={loading}
      />

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
