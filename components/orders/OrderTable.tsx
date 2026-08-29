'use client';

import React, { useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Pagination from '@/components/common/Pagination';
import {
  Pencil,
  Trash2,
  Eye,
  Database,
  User,
  Inbox,
  FileText,
  RotateCcw,
} from 'lucide-react';
import {
  Order,
  formatPlanLabel,
  getStatusBadge,
} from '@/components/orders/OrderDetailsModal';
import { useAdmin } from '@/contexts/AdminContext';

interface OrderTableProps {
  orders: Order[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onViewDetails: (order: Order) => void;
  onEdit: (order: Order) => void;
  onRefund?: (order: Order) => void;
  onDelete: (id: string, name?: string) => void;
  isLoading?: boolean;
}

function SubmitterAvatar({ avatarUrl }: { avatarUrl?: string | null }) {
  const [hasError, setHasError] = useState(false);

  if (avatarUrl && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt="Avatar"
        onError={() => setHasError(true)}
        className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0 shadow-2xs"
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0 shadow-2xs">
      <User size={14} />
    </div>
  );
}

function OrderToolLogo({ metadata }: { metadata: any }) {
  const toolName =
    metadata?.tool_name || metadata?.tool_url || metadata?.title || 'Tool';
  const siteUrl =
    metadata?.tool_site_url || metadata?.external_url || metadata?.website_url || '';

  let domain = '';
  if (siteUrl) {
    try {
      const urlObj = new URL(
        siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
      );
      domain = urlObj.hostname;
    } catch {}
  } else if (
    metadata?.tool_url &&
    typeof metadata.tool_url === 'string' &&
    metadata.tool_url.includes('.')
  ) {
    domain = metadata.tool_url;
  }

  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : null;
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={toolName}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-md"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300">
          <Database size={14} />
        </div>
      )}
    </div>
  );
}

export default function OrderTable({
  orders,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onViewDetails,
  onEdit,
  onRefund,
  onDelete,
  isLoading = false,
}: OrderTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { hasPermission } = useAdmin();
  const canUpdate = hasPermission('submissions', 'update');
  const canDelete = hasPermission('submissions', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[20%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tool Name</TableHead>
            <TableHead className="w-[18%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Submitted By</TableHead>
            <TableHead className="w-[15%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Order</TableHead>
            <TableHead className="w-[12%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Plan</TableHead>
            <TableHead className="w-[12%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Amount</TableHead>
            <TableHead className="w-[10%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[13%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Created</TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-2.5 w-16 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-2.5 w-32 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-5 w-20 rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-2.5 w-12 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-20 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-52 text-center py-12">
                <div className="flex flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">
                    No orders found
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No orders match your search criteria or active filters. Try searching for a different keyword or selecting &quot;Total Orders&quot;.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => {
              const toolName =
                order.metadata?.tool_name ||
                order.metadata?.tool_url ||
                order.metadata?.title ||
                '—';

              return (
                <TableRow
                  key={order.id}
                  onClick={() => onViewDetails(order)}
                  onMouseEnter={() => setHoveredId(order.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === order.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                  }`}
                >
                  {/* Tool Column */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <OrderToolLogo metadata={order.metadata} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[170px]">
                          {toolName}
                        </span>
                        {order.billing_country && (
                          <span className="text-[10px] text-[var(--text-muted)] font-medium">
                            {order.billing_country}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Submitter Column */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <SubmitterAvatar avatarUrl={order.submitter?.avatar_url} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[150px]">
                          {order.submitter?.full_name || order.submitter?.email || 'User'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[170px]">
                          {order.submitter?.email || '—'}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Order Number Column */}
                  <TableCell className="px-4 py-4">
                    <div>
                      <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                        {order.order_number}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-medium capitalize">
                        {order.payment_method || 'Online'}
                      </div>
                    </div>
                  </TableCell>

                  {/* Plan Badge Column */}
                  <TableCell className="px-4 py-4">
                    <Badge variant="slate" className="font-semibold text-[9px] px-2 py-0.5">
                      {formatPlanLabel(order.plan_id)}
                    </Badge>
                  </TableCell>

                  {/* Amount Column */}
                  <TableCell className="px-4 py-4">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        ${Number(order.amount_usd).toFixed(2)}{' '}
                        <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                          {order.currency || 'USD'}
                        </span>
                      </div>
                      {order.tax_amount != null && Number(order.tax_amount) > 0 && (
                        <div className="text-[10px] text-[var(--text-muted)] font-medium">
                          +${Number(order.tax_amount).toFixed(2)} tax
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Status Column */}
                  <TableCell className="px-2 py-4 text-center">
                    {getStatusBadge(order.status)}
                  </TableCell>

                  {/* Created Column */}
                  <TableCell className="px-4 py-4">
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      {new Date(order.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  {/* Action Column */}
                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(order);
                        }}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="View Order Details"
                        aria-label={`View details for order ${order.order_number}`}
                      >
                        <Eye size={13} />
                      </Button>

                      {canUpdate && onRefund &&
                        order.status === 'completed' &&
                        Boolean(order.dodo_payment_id) &&
                        Number(order.amount_usd) > 0 &&
                        !order.plan_id?.toLowerCase().startsWith('free_') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRefund(order);
                          }}
                          className="h-7 w-7 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-500/20 shadow-2xs cursor-pointer"
                          title="Issue Refund via Dodo Payments"
                          aria-label={`Refund order ${order.order_number}`}
                        >
                          <RotateCcw size={13} />
                        </Button>
                      )}

                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(order);
                          }}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Order"
                          aria-label={`Edit order ${order.order_number}`}
                        >
                          <Pencil size={13} />
                        </Button>
                      )}

                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(order.id, order.order_number ? `Order #${order.order_number}` : `Order ${order.id}`);
                          }}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Order"
                          aria-label={`Delete order ${order.order_number}`}
                          suppressHydrationWarning
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}

                      {!canUpdate && !canDelete && (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Standardized Pagination Footer */}
      <Pagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>
  );
}

