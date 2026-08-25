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
    { id: 'all', label: 'Total Orders', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Database size={18} />, points: sparklines.all },
    { id: 'completed', label: 'Completed', value: stats.completed, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.completed },
    { id: 'pending', label: 'Pending', value: stats.pending, color: 'text-cyan-500', bg: 'bg-cyan-500/10', hex: '#06b6d4', icon: <Clock size={18} />, points: sparklines.pending },
    { id: 'refunded', label: 'Refunded', value: stats.refunded, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <RotateCcw size={18} />, points: sparklines.refunded },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            Orders & Transactions
            <Badge variant="success" className="rounded-full font-semibold">
              Finance
            </Badge>
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Track all payment orders and transaction records.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchOrders(true)}
          disabled={isRefreshing}
          className="gap-2 font-semibold shadow-xs"
          suppressHydrationWarning
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
          {isRefreshing ? 'Syncing...' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat) => (
          <button
            key={stat.id}
            onClick={() => {
              setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
              setCurrentPage(1);
            }}
            className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col cursor-pointer ${
              statusFilter === stat.id
                ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md'
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

      {/* Search & Sort Controls */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            placeholder="Search by order number or plan..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            variant="default"
            className="px-5 shadow-sm shrink-0"
            suppressHydrationWarning
          >
            <Search size={15} />
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
