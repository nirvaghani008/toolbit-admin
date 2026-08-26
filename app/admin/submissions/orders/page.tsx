'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Database, CheckCircle2, Clock, RefreshCw, RotateCcw, Search } from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import OrderTable from '@/components/orders/OrderTable';
import OrderDetailsModal, { Order, Submitter } from '@/components/orders/OrderDetailsModal';

export default function OrdersPage() {
  const confirmDelete = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [stats, setStats] = useState({ all: 0, completed: 0, pending: 0, refunded: 0 });
  const [sparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    completed: [0, 0, 0, 0, 0, 0, 0],
    pending: [0, 0, 0, 0, 0, 0, 0],
    refunded: [0, 0, 0, 0, 0, 0, 0],
  });

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'refunded' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'amount_usd'>('created_at');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const pageSize = 20;

  const sortOptions = [
    { value: 'created_at-desc', label: 'Newest First' },
    { value: 'created_at-asc', label: 'Oldest First' },
    { value: 'updated_at-desc', label: 'Last Updated' },
    { value: 'amount_usd-desc', label: 'Amount (High to Low)' },
    { value: 'amount_usd-asc', label: 'Amount (Low to High)' },
  ];

  const fetchStats = async () => {
    try {
      const [{ count: cAll }, { count: cCompleted }, { count: cPending }, { count: cRefunded }] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'refunded'),
      ]);
      setStats({ all: cAll || 0, completed: cCompleted || 0, pending: cPending || 0, refunded: cRefunded || 0 });
      setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching order stats:', err?.message || err);
    }
  };

  const fetchOrders = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);
    try {
      if (manual) fetchStats();

      let query = supabase.from('orders').select('*', { count: 'exact' });

      if (searchQuery) {
        query = query.or(`order_number.ilike.%${searchQuery}%,plan_id.ilike.%${searchQuery}%`);
      }
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const from = (currentPage - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      // Fetch submitters using get_users_by_ids RPC with get_admin_users fallback
      const userMap: Record<string, Submitter> = {};
      const userIds = [...new Set((data || []).map((o: any) => o.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        try {
          const { data: usersData, error: rpcErr } = await supabase.rpc('get_users_by_ids', { p_ids: userIds });
          let list = usersData;
          if (rpcErr || !list || list.length === 0) {
            const { data: fallbackData } = await supabase.rpc('get_admin_users', { p_search: '', p_sort: 'created_at-desc', p_limit: 5000, p_offset: 0 });
            list = fallbackData;
          }

          (list || []).forEach((u: any) => {
            if (u?.id) {
              userMap[String(u.id).toLowerCase().trim()] = {
                id: u.id,
                email: u.email || null,
                full_name: u.full_name || u.name || null,
                avatar_url: u.avatar_url || u.picture || null,
              };
            }
          });
        } catch (e) {
          console.warn('Error fetching order submitters:', e);
        }
      }

      const enriched: Order[] = (data || []).map((o: any) => {
        const sKey = o.user_id ? String(o.user_id).toLowerCase().trim() : '';
        return {
          ...o,
          submitter: sKey ? userMap[sKey] || null : null,
        };
      });

      setOrders(enriched);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.warn('Error fetching orders:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchOrders(); }, [currentPage, statusFilter, sortBy, sortOrder, searchQuery]);
  useEffect(() => { if (searchInputValue === '') setSearchQuery(''); }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDelete({
      title: 'Delete Order',
      message: 'Are you sure you want to permanently delete this order? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      await fetchStats();
      await fetchOrders();
    } catch (err) {
      console.error('Error deleting order:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const statCards = [
    {
      id: 'all',
      label: 'Total Orders',
      value: stats.all,
      iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#364954] dark:text-zinc-400',
      icon: <Database size={17} />,
      points: sparklines.all,
      badge: 'All Orders',
    },
    {
      id: 'completed',
      label: 'Completed',
      value: stats.completed,
      iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
      icon: <CheckCircle2 size={17} />,
      points: sparklines.completed,
      badge: 'Completed',
    },
    {
      id: 'pending',
      label: 'Pending',
      value: stats.pending,
      iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      sparklineColor: 'text-[#8a652a] dark:text-amber-400',
      icon: <Clock size={17} />,
      points: sparklines.pending,
      badge: 'Pending',
    },
    {
      id: 'refunded',
      label: 'Refunded',
      value: stats.refunded,
      iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      sparklineColor: 'text-[#824235] dark:text-rose-400',
      icon: <RotateCcw size={17} />,
      points: sparklines.refunded,
      badge: 'Refunded',
    },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            Orders & Transactions
            <Badge variant="slate" className="rounded-full font-semibold">
              Finance
            </Badge>
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Track all payment orders and transaction records.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchOrders(true)}
          disabled={isRefreshing}
          className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          suppressHydrationWarning
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-zinc-500' : ''} />
          {isRefreshing ? 'Syncing...' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
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

      {/* Search & Sort Controls */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            placeholder="Search by order number or plan..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1 h-11 px-4 text-sm"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 shrink-0"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="w-full md:w-[220px]">
          <Select
            value={`${sortBy}-${sortOrder}`}
            onChange={(val) => {
              const [newSort, newOrder] = val.split('-') as [any, any];
              setSortBy(newSort);
              setSortOrder(newOrder);
            }}
            options={sortOptions}
            className="h-11 min-w-[200px]"
            suppressHydrationWarning
          />
        </div>
      </form>

      {/* Standardized Order Table */}
      <OrderTable
        orders={orders}
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onViewDetails={(order) => setSelectedOrder(order)}
        onDelete={handleDelete}
        isLoading={loading}
      />

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
      />

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}


