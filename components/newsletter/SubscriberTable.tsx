'use client';

import { useState } from 'react';
import { Mail, Trash2, Inbox } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusChangeControl from '@/components/common/StatusChangeControl';
import { useAdmin } from '@/contexts/AdminContext';

export interface Subscriber {
  id: number;
  email: string;
  status: string;
  created_at: string;
}

// Selectable status values for a newsletter subscriber.
export const NEWSLETTER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

// Treats 'active'/'subscribed' as active and everything else as inactive.
const isActiveStatus = (status: string): boolean => {
  const s = (status || '').toLowerCase();
  return s === 'active' || s === 'subscribed';
};

const getSubscriberStatusVariant = (status: string): 'success' | 'destructive' =>
  isActiveStatus(status) ? 'success' : 'destructive';

const formatSubscriberStatus = (status: string): string =>
  isActiveStatus(status) ? 'Active' : 'Inactive';

// Normalizes legacy values (subscribed/unsubscribed) to the two canonical
// options so the dropdown highlights the correct current status.
const normalizeSubscriberStatus = (status: string): string =>
  isActiveStatus(status) ? 'active' : 'inactive';

interface SubscriberTableProps {
  subscribers: Subscriber[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onStatusChange: (id: number | string, newStatus: string) => Promise<void> | void;
  onDelete: (id: number, email?: string) => void;
  isLoading?: boolean;
}

export function SubscriberStatusBadge({
  status,
  onClick,
  isClickable = false,
}: {
  status: string;
  onClick?: () => void;
  isClickable?: boolean;
}) {
  const s = (status || '').toLowerCase();
  const isActive = s === 'active' || s === 'subscribed';
  const variant = isActive ? 'success' : 'destructive';
  const label = isActive ? 'Active' : 'Inactive';

  if (isClickable && onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="inline-flex cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
        title={`Click to toggle status (currently ${label})`}
        suppressHydrationWarning
      >
        <Badge variant={variant} className="cursor-pointer shadow-2xs">
          {label}
        </Badge>
      </button>
    );
  }

  return <Badge variant={variant}>{label}</Badge>;
}

export default function SubscriberTable({
  subscribers,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onStatusChange,
  onDelete,
  isLoading = false,
}: SubscriberTableProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const { hasPermission, isSuperAdmin } = useAdmin();
  const canUpdate = isSuperAdmin || hasPermission('newsletter', 'update');
  const canDelete = isSuperAdmin || hasPermission('newsletter', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[45%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Email</TableHead>
            <TableHead className="w-[20%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[20%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Date Added</TableHead>
            <TableHead className="w-[15%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <Skeleton className="h-3.5 w-48 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-32 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : subscribers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No subscribers found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No subscribers match your search criteria or filter. Try adjusting your search query or status filter.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            subscribers.map((sub) => {
              return (
                <TableRow
                  key={sub.id}
                  onMouseEnter={() => setHoveredId(sub.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === sub.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                  }`}
                >
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 p-1 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all">
                        <Mail size={15} />
                      </div>
                      <span className="text-xs font-semibold text-[var(--text-primary)] tracking-tight">
                        {sub.email}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="px-2 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    {canUpdate ? (
                      <StatusChangeControl
                        itemId={sub.id}
                        currentStatus={normalizeSubscriberStatus(sub.status)}
                        options={NEWSLETTER_STATUS_OPTIONS}
                        itemLabel={sub.email || 'this subscriber'}
                        onStatusChange={onStatusChange}
                        getVariant={getSubscriberStatusVariant}
                        formatStatus={formatSubscriberStatus}
                      />
                    ) : (
                      <SubscriberStatusBadge status={sub.status} />
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      {new Date(sub.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(sub.id, sub.email);
                          }}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Subscriber"
                          aria-label={`Delete subscriber ${sub.email}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      ) : (
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

