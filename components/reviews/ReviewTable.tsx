'use client';

import { useState } from 'react';
import { Edit2, Trash2, Star, Wrench, Inbox } from 'lucide-react';
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

// Canonical review visibility statuses. The `reviews.status` column stores
// `pending`, `approved`/`show` and `hide`/`rejected`. We normalize to the
// three canonical values below for the interactive status control.
export const REVIEW_STATUS_OPTIONS = [
  { value: 'show', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'hide', label: 'Rejected' },
] as const;

/** Collapse the aliased raw status into a canonical value. */
export const normalizeReviewStatus = (status: string): string => {
  const s = (status || '').toLowerCase();
  if (s === 'show' || s === 'approved') return 'show';
  if (s === 'pending') return 'pending';
  return 'hide';
};

const getReviewStatusVariant = (
  status: string
): 'success' | 'warning' | 'destructive' | 'slate' => {
  const s = (status || '').toLowerCase();
  if (s === 'show' || s === 'approved') return 'success';
  if (s === 'pending') return 'warning';
  return 'destructive';
};

const formatReviewStatus = (status: string): string => {
  const s = (status || '').toLowerCase();
  if (s === 'show' || s === 'approved') return 'Approved';
  if (s === 'pending') return 'Pending';
  return 'Rejected';
};

const reviewStatusDotColor = (value: string): string => {
  const v = (value || '').toLowerCase();
  if (v === 'show' || v === 'approved') return 'bg-emerald-500';
  if (v === 'pending') return 'bg-amber-500';
  return 'bg-rose-500';
};

export interface Review {
  review_id: number;
  tool_id: number;
  reviewer_name: string;
  rating: number;
  review_text: string;
  status: string;
  review_date: string;
  ai_tools?: {
    tool_id?: number;
    tool_site_url?: string;
    favicon_url?: string;
    icon_url?: string;
    logo_url?: string;
    image_url?: string;
    tool_info?: {
      toolName?: string;
      [key: string]: any;
    };
  };
}

interface ReviewTableProps {
  reviews: Review[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (review: Review) => void;
  onDelete: (id: number, name?: string) => void;
  onStatusToggle?: (review: Review) => void;
  onStatusChange?: (id: number | string, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
}

import ToolLogo from '@/components/common/ToolLogo';
export { ToolLogo };


export function ReviewStatusBadge({
  status,
  onClick,
  isClickable = false,
}: {
  status: string;
  onClick?: () => void;
  isClickable?: boolean;
}) {
  const s = (status || '').toLowerCase();
  const isApproved = s === 'approved' || s === 'show';
  const isPending = s === 'pending';

  const variant = isApproved ? 'success' : isPending ? 'warning' : 'destructive';
  const label = isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected';

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
        <Badge variant={variant} className="text-[9px] px-2 py-0.5 font-bold tracking-wider cursor-pointer shadow-2xs">
          {label}
        </Badge>
      </button>
    );
  }

  return (
    <Badge variant={variant} className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
      {label}
    </Badge>
  );
}

export default function ReviewTable({
  reviews,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusToggle,
  onStatusChange,
  isLoading = false,
}: ReviewTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const { hasPermission } = useAdmin();
  const canUpdate = hasPermission('reviews', 'update');
  const canDelete = hasPermission('reviews', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[24%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tool Name</TableHead>
            <TableHead className="w-[18%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Reviewer</TableHead>
            <TableHead className="w-[14%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Rating</TableHead>
            <TableHead className="w-[26%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Feedback</TableHead>
            <TableHead className="w-[10%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[8%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <Skeleton className="h-3.5 w-36 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-24 rounded" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-lg" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-48 rounded" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : reviews.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No feedback found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No reviews match your search criteria or filter. Try clearing filters or selecting another status.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            reviews.map((review) => {
              const toolName = review.ai_tools?.tool_info?.toolName || 'Unknown Tool';

              return (
                <TableRow
                  key={review.review_id}
                  onClick={() => onEdit(review)}
                  onMouseEnter={() => setHoveredId(review.review_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                >
                  <TableCell className="px-4 py-3.5">
                    <div className="flex items-center gap-3 max-w-[260px]">
                      <ToolLogo tool={review.ai_tools} toolName={toolName} />
                      <div className="text-xs font-bold text-[var(--text-primary)] tracking-tight truncate">
                        {toolName}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3.5">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {review.reviewer_name}
                    </span>
                  </TableCell>

                  <TableCell className="px-2 py-3.5 text-center">
                    <div className="inline-flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-200/80 dark:border-zinc-700/80">
                      <div className="flex items-center text-amber-400 gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={11}
                            className={
                              i < (review.rating || 0)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 dark:text-slate-600 fill-transparent'
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3.5">
                    <div className="max-w-[280px]">
                      <p className="text-xs font-medium text-[var(--text-secondary)] truncate italic opacity-80 group-hover:opacity-100 transition-opacity">
                        &ldquo;{review.review_text}&rdquo;
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="px-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    {canUpdate && onStatusChange ? (
                      <StatusChangeControl
                        itemId={review.review_id}
                        currentStatus={normalizeReviewStatus(review.status)}
                        options={REVIEW_STATUS_OPTIONS}
                        itemLabel={review.reviewer_name || toolName}
                        onStatusChange={onStatusChange}
                        getVariant={getReviewStatusVariant}
                        formatStatus={formatReviewStatus}
                        getDotColor={reviewStatusDotColor}
                      />
                    ) : (
                      <ReviewStatusBadge
                        status={review.status}
                        isClickable={canUpdate && !!onStatusToggle}
                        onClick={canUpdate && onStatusToggle ? () => onStatusToggle(review) : undefined}
                      />
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(review)}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Record"
                          aria-label={`Edit review for ${toolName}`}
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(review.review_id, review.reviewer_name ? `${review.reviewer_name}'s review for ${toolName}` : `Review for ${toolName}`)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Record"
                          aria-label={`Delete review for ${toolName}`}
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

