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
  ExternalLink,
  Trash2,
  Eye,
  Database,
  User,
  Inbox,
  FileText,
} from 'lucide-react';
import {
  Order,
  formatPlanLabel,
  getStatusBadge,
} from '@/components/orders/OrderDetailsModal';

interface OrderTableProps {
  orders: Order[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onViewDetails: (order: Order) => void;
  onDelete: (id: string) => void;
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
        className="w-8 h-8 rounded-full object-cover border border-[var(--border-color)] shrink-0 shadow-2xs"
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] shrink-0 shadow-2xs">
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
    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/15 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={toolName}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-md"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-indigo-500">
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
  onDelete,
  isLoading = false,
}: OrderTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[20%]">Tool Name</TableHead>
            <TableHead className="w-[18%]">Submitted By</TableHead>
            <TableHead className="w-[15%]">Order</TableHead>
            <TableHead className="w-[12%]">Plan</TableHead>
            <TableHead className="w-[12%]">Amount</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
            <TableHead className="w-[13%]">Created</TableHead>
            <TableHead className="w-[10%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-2.5 w-16 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-2.5 w-32 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20 rounded-md" />
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-2.5 w-12 rounded" />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-20 rounded" />
                </TableCell>
                <TableCell className="text-center">
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
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  {/* Tool Column */}
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell>
                    <Badge variant="slate" className="font-semibold">
                      {formatPlanLabel(order.plan_id)}
                    </Badge>
                  </TableCell>

                  {/* Amount Column */}
                  <TableCell>
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
                  <TableCell className="text-center">
                    {getStatusBadge(order.status)}
                  </TableCell>

                  {/* Created Column */}
                  <TableCell>
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      {new Date(order.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  {/* Action Column */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(order);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                        title="View Order Details"
                        aria-label={`View details for order ${order.order_number}`}
                      >
                        <Eye size={13} />
                      </Button>

                      {order.invoice_url && (
                        <Button
                          variant="secondary"
                          size="xs"
                          asChild
                          className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                          title="View Invoice"
                          aria-label={`View invoice for order ${order.order_number}`}
                        >
                          <a
                            href={order.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={13} />
                          </a>
                        </Button>
                      )}

                      {order.receipt_url && (
                        <Button
                          variant="secondary"
                          size="xs"
                          asChild
                          className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-emerald-500 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                          title="View Receipt"
                          aria-label={`View receipt for order ${order.order_number}`}
                        >
                          <a
                            href={order.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileText size={13} />
                          </a>
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(order.id);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Order"
                        aria-label={`Delete order ${order.order_number}`}
                        suppressHydrationWarning
                      >
                        <Trash2 size={13} />
                      </Button>
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
