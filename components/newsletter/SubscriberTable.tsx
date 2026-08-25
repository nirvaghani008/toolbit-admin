'use client';

import { useState } from 'react';
import { Mail, UserX, RotateCcw, Trash2, Inbox } from 'lucide-react';
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

export interface Subscriber {
  id: number;
  email: string;
  status: string;
  created_at: string;
}

interface SubscriberTableProps {
  subscribers: Subscriber[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onStatusToggle: (subscriber: Subscriber) => void;
  onDelete: (id: number) => void;
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
  onStatusToggle,
  onDelete,
  isLoading = false,
}: SubscriberTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[45%]">Email</TableHead>
            <TableHead className="w-[20%] text-center">Status</TableHead>
            <TableHead className="w-[20%]">Date Added</TableHead>
            <TableHead className="w-[15%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-48 rounded" />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-32 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
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
              const isActive = sub.status === 'active' || sub.status === 'subscribed';

              return (
                <TableRow
                  key={sub.id}
                  onMouseEnter={() => setHoveredId(sub.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === sub.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-500 transition-transform group-hover:scale-105">
                        <Mail size={14} />
                      </div>
                      <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                        {sub.email}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <SubscriberStatusBadge
                      status={sub.status}
                      isClickable
                      onClick={() => onStatusToggle(sub)}
                    />
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      {new Date(sub.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {isActive ? (
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStatusToggle(sub);
                          }}
                          className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-amber-500 hover:border-amber-500/40 hover:bg-amber-500/10"
                          title="Mark Inactive"
                          aria-label={`Mark ${sub.email} as inactive`}
                        >
                          <UserX size={13} />
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStatusToggle(sub);
                          }}
                          className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-emerald-500 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                          title="Mark Active"
                          aria-label={`Mark ${sub.email} as active`}
                        >
                          <RotateCcw size={13} />
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(sub.id);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Subscriber"
                        aria-label={`Delete subscriber ${sub.email}`}
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
