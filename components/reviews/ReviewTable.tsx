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
  onDelete: (id: number) => void;
  onStatusToggle: (review: Review) => void;
  isLoading?: boolean;
}

export function ToolLogo({ tool, toolName }: { tool: any; toolName: string }) {
  const info = tool?.tool_info || {};

  const candidateUrl =
    tool?.favicon_url ||
    tool?.icon_url ||
    tool?.logo_url ||
    tool?.image_url ||
    info.favicon_url ||
    info.icon_url ||
    info.logo_url ||
    info.logo ||
    info.icon ||
    info.imageUrl;

  let faviconApiUrl: string | null = null;
  const siteUrl = tool?.tool_site_url || info.websiteUrl || info.url || info.website_url;
  if (siteUrl && typeof siteUrl === 'string') {
    try {
      const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
      const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '');
      if (hostname) {
        faviconApiUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      }
    } catch {
      // ignore
    }
  }

  const primaryUrl = candidateUrl || faviconApiUrl;
  const secondaryUrl = candidateUrl ? faviconApiUrl : null;

  const [currentSrc, setCurrentSrc] = useState<string | null>(primaryUrl);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (currentSrc === candidateUrl && secondaryUrl) {
      setCurrentSrc(secondaryUrl);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
      {!hasError && currentSrc ? (
        <img
          src={currentSrc}
          alt={toolName}
          onError={handleError}
          className="w-full h-full object-contain rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-indigo-500">
          <Wrench size={14} />
        </div>
      )}
    </div>
  );
}

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
        <Badge variant={variant} className="cursor-pointer shadow-2xs">
          {label}
        </Badge>
      </button>
    );
  }

  return <Badge variant={variant}>{label}</Badge>;
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
  isLoading = false,
}: ReviewTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[24%]">Tool Name</TableHead>
            <TableHead className="w-[18%]">Reviewer</TableHead>
            <TableHead className="w-[14%] text-center">Rating</TableHead>
            <TableHead className="w-[26%]">Feedback</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
            <TableHead className="w-[8%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                    <Skeleton className="h-3.5 w-36 rounded" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-24 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-lg" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-48 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="text-center">
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
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === review.review_id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 max-w-[260px]">
                      <ToolLogo tool={review.ai_tools} toolName={toolName} />
                      <div className="text-xs font-bold text-[var(--text-primary)] tracking-tight truncate">
                        {toolName}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {review.reviewer_name}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-1 bg-[var(--bg-elevated)]/60 px-2.5 py-1 rounded-lg border border-[var(--border-color)]/60">
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

                  <TableCell>
                    <div className="max-w-[280px]">
                      <p className="text-xs font-medium text-[var(--text-secondary)] truncate italic opacity-80 group-hover:opacity-100 transition-opacity font-['Times_New_Roman',_Times,_serif]">
                        &ldquo;{review.review_text}&rdquo;
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <ReviewStatusBadge
                      status={review.status}
                      isClickable
                      onClick={() => onStatusToggle(review)}
                    />
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(review);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                        title="Edit Record"
                        aria-label={`Edit review for ${toolName}`}
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(review.review_id);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Record"
                        aria-label={`Delete review for ${toolName}`}
                      >
                        <Trash2 size={12} />
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
