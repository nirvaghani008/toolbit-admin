'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Database, CheckCircle2, Clock, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import OrderTable from '@/components/orders/OrderTable';
import OrderDetailsModal, { Order, Submitter } from '@/components/orders/OrderDetailsModal';
import EditOrderModal from '@/components/orders/EditOrderModal';
import RefundOrderModal from '@/components/orders/RefundOrderModal';
import {
  getOrderStatsAction,
  getOrdersAction,
  deleteOrderAction,
} from './actions';

export default function OrdersPage() {
  const confirmDelete = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<Order | null>(null);

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

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchStats = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await getOrderStatsAction(token);
      if (res.success && res.stats) {
        setStats(res.stats);
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      console.warn('Error fetching order stats:', err?.message || err);
    }
  };

  const fetchOrders = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);
    try {
      if (manual) fetchStats();

      const token = await getAuthToken();
      if (!token) return;

      const res = await getOrdersAction(
        {
          page: currentPage,
          pageSize,
          search: searchQuery,
          status: statusFilter,
          sortBy,
          sortOrder,
        },
        token
      );

      if (res.success && res.data) {
        setOrders(res.data);
        setTotalCount(res.count ?? 0);
      } else if (res.error) {
        console.warn('Error fetching orders:', res.error);
      }
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

  const handleDelete = async (id: string, name?: string) => {
    const confirmed = await confirmDelete({
      title: 'Delete Order',
      itemName: name,
      message: 'Are you sure you want to permanently delete this order? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await deleteOrderAction(id, token);
      if (!res.success) throw new Error(res.error || 'Failed to delete order');
      await fetchStats();
      await fetchOrders();
    } catch (err) {
      console.error('Error deleting order:', err);
    } finally {
      setIsRefreshing(false);
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
      iconStyle: 'text-[#5a4833] bg-[#f7f4ee] border-[#e2dcd0] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badgeStyle: 'bg-[#f7f4ee] text-[#5a4833] border-[#e2dcd0] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      sparklineColor: 'text-[#5a4833] dark:text-amber-400',
      icon: <Clock size={17} />,
      points: sparklines.pending,
      badge: 'Pending',
    },
    {
      id: 'refunded',
      label: 'Refunded',
      value: stats.refunded,
      iconStyle: 'text-[#5c3838] bg-[#f6f1f1] border-[#e2d3d3] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badgeStyle: 'bg-[#f6f1f1] text-[#5c3838] border-[#e2d3d3] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      sparklineColor: 'text-[#5c3838] dark:text-rose-400',
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Orders & Invoices</h1>
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
          {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
          Refresh
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
            placeholder="Search by order #, tool name, plan, or user..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1 h-11 px-4 text-sm"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 shrink-0 cursor-pointer"
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
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
              <Spinner size={20} />
            </div>
          </div>
        )}
        <OrderTable
          orders={orders}
          totalCount={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onViewDetails={(order) => setSelectedOrder(order)}
          onEdit={(order) => setEditingOrder(order)}
          onRefund={(order) => setRefundingOrder(order)}
          onDelete={handleDelete}
          isLoading={loading}
        />
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        onEdit={(order) => setEditingOrder(order)}
        onRefund={(order) => setRefundingOrder(order)}
      />

      {/* Edit Order Modal */}
      <EditOrderModal
        order={editingOrder}
        isOpen={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        onSaveSuccess={async (updatedOrder) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
          );
          if (selectedOrder?.id === updatedOrder.id) {
            setSelectedOrder((prev) => (prev ? { ...prev, ...updatedOrder } : null));
          }
          await fetchStats();
          await fetchOrders();
        }}
        onRefund={(order) => setRefundingOrder(order)}
      />

      {/* Refund Order Modal */}
      <RefundOrderModal
        order={refundingOrder}
        isOpen={Boolean(refundingOrder)}
        onClose={() => setRefundingOrder(null)}
        onRefundSuccess={async (updatedOrder) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
          );
          if (selectedOrder?.id === updatedOrder.id) {
            setSelectedOrder((prev) => (prev ? { ...prev, ...updatedOrder } : null));
          }
          await fetchStats();
          await fetchOrders();
        }}
      />
    </div>
  );
}


