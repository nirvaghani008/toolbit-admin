'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Edit2, Trash2, Newspaper, Inbox, ChevronDown, Check, AlertCircle } from 'lucide-react';
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
import { Portal } from '@/components/ui/portal';
import { useAdmin } from '@/contexts/AdminContext';

export interface NewsItem {
  news_id: number;
  title: string;
  summary?: string;
  source_url?: string;
  source_name?: string;
  favicon_url?: string;
  published_date?: string;
  categories?: string[];
  status?: string;
  created_at?: string;
}

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default';

/** Visibility statuses stored in the live `news.status` column. */
export const NEWS_STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'hide', label: 'Hide' },
] as const;

/** Normalize a status for comparisons without substituting a default value. */
export function normalizeNewsStatus(status?: string): string {
  return (status || '').toLowerCase().trim();
}

/** Badge color variant for a given (raw) status. */
export function getNewsStatusVariant(status?: string): BadgeVariant {
  switch (normalizeNewsStatus(status)) {
    case 'published': return 'success';
    case 'hide': return 'destructive';
    default: return 'default';
  }
}

/** Human-readable label for a given (raw) status. */
export function formatNewsStatus(status?: string): string {
  const normalized = normalizeNewsStatus(status);
  const opt = NEWS_STATUS_OPTIONS.find((o) => o.value === normalized);
  if (opt) return opt.label;
  return status?.trim() || '—';
}

interface NewsTableProps {
  news: NewsItem[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (item: NewsItem) => void;
  onDelete: (id: number, title?: string) => void;
  onStatusChange?: (newsId: number, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

function NewsLogo({ item }: { item: NewsItem }) {
  const [hasError, setHasError] = useState(false);

  const getFaviconUrl = () => {
    if (item.favicon_url) return item.favicon_url;

    if (item.source_url) {
      try {
        const domain = new URL(item.source_url.startsWith('http') ? item.source_url : `https://${item.source_url}`).hostname.replace('www.', '');
        if (domain) {
          return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        }
      } catch {
        // fallback
      }
    }
    return null;
  };

  const faviconUrl = getFaviconUrl();

  return (
    <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={item.source_name || item.title || 'News'}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-lg p-1"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300">
          <Newspaper size={16} />
        </div>
      )}
    </div>
  );
}

export default function NewsTable({
  news,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  isLoading = false,
  canEdit,
  canDelete: canDeleteProp,
}: NewsTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<number | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ item: NewsItem; newStatus: string } | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const { hasPermission } = useAdmin();
  const canUpdate = canEdit !== undefined ? canEdit : hasPermission('news', 'update');
  const canDelete = canDeleteProp !== undefined ? canDeleteProp : hasPermission('news', 'delete');

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = () => setOpenStatusDropdownId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenStatusDropdownId(null);
        if (!isChangingStatus) setPendingStatusChange(null);
      }
    };

    if (openStatusDropdownId) {
      document.addEventListener('click', handleClickOutside);
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openStatusDropdownId, isChangingStatus]);

  const getStatusBadgeVariant = getNewsStatusVariant;
  const formatStatus = formatNewsStatus;

  return (
    <>
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[42%] px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Headline</TableHead>
            <TableHead className="w-[18%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Source</TableHead>
            <TableHead className="w-[16%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Categories</TableHead>
            <TableHead className="w-[10%] px-3 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Published</TableHead>
            <TableHead className="w-[7%] px-3 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[7%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="animate-pulse hover:bg-transparent">
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-3.5 bg-[var(--bg-elevated)] rounded w-48" />
                      <Skeleton className="h-2.5 bg-[var(--bg-elevated)] rounded w-24" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4"><Skeleton className="h-5 bg-[var(--bg-elevated)] rounded w-24" /></TableCell>
                <TableCell className="px-4 py-4"><Skeleton className="h-5 bg-[var(--bg-elevated)] rounded w-20" /></TableCell>
                <TableCell className="px-3 py-4 text-center"><Skeleton className="inline-block h-4 bg-[var(--bg-elevated)] rounded w-20 mx-auto" /></TableCell>
                <TableCell className="px-3 py-4 text-center"><Skeleton className="inline-block h-5 bg-[var(--bg-elevated)] rounded-md w-14 mx-auto" /></TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : news.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No news articles found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No news articles match your search criteria or filter. Try clearing filters or adding a new article.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            news.map((item) => (
              <TableRow
                key={item.news_id}
                onMouseEnter={() => setHoveredId(item.news_id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`transition-all duration-200 group cursor-pointer border-l-2 relative hover:z-[10] ${
                  hoveredId === item.news_id
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                }`}
              >
                {/* 1. Headline & Summary */}
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <NewsLogo item={item} />
                    <div className="w-full overflow-hidden">
                      <span
                        onClick={() => onEdit(item)}
                        className="text-xs font-semibold text-[var(--text-primary)] hover:text-zinc-900 dark:hover:text-zinc-100 tracking-tight block truncate w-full transition-colors cursor-pointer"
                        title={item.title || 'Untitled Headline'}
                      >
                        {item.title || 'Untitled Headline'}
                      </span>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--text-muted)] font-medium hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1 mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Visit Article <ExternalLink size={9} />
                        </a>
                      )}
                      {!item.source_url && item.summary && (
                        <span className="text-[10px] text-[var(--text-muted)] font-medium block truncate mt-0.5">
                          {item.summary}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* 2. Source Name */}
                <TableCell className="px-4 py-4">
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate block">
                    {item.source_name || '—'}
                  </span>
                </TableCell>

                {/* 3. Categories */}
                <TableCell className="px-4 py-4">
                  <div className="flex flex-wrap gap-1">
                    {(item.categories || ['AI']).slice(0, 2).map((cat, i) => (
                      <Badge key={i} variant="slate" className="px-2 py-0.5 text-[9px] font-semibold">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </TableCell>

                {/* 4. Published Date */}
                <TableCell className="px-3 py-4 text-center">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                    {item.published_date
                      ? new Date(item.published_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                      : <span className="text-[var(--text-muted)] text-[10px]">—</span>}
                  </span>
                </TableCell>

                {/* 5. Status dropdown */}
                <TableCell className="px-4 py-4 text-center">
                  <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                    {canUpdate ? (
                      <button
                        type="button"
                        onClick={() => setOpenStatusDropdownId(openStatusDropdownId === item.news_id ? null : item.news_id)}
                        className="inline-flex items-center gap-1.5 p-1 -m-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group/status focus:outline-none cursor-pointer"
                        title="Click to change status"
                      >
                        <Badge
                          variant={getStatusBadgeVariant(item.status)}
                          className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase cursor-pointer"
                        >
                          {formatStatus(item.status)}
                        </Badge>
                        <ChevronDown size={11} className={`text-[var(--text-muted)] group-hover/status:text-[var(--text-primary)] transition-transform duration-200 ${openStatusDropdownId === item.news_id ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <Badge
                        variant={getStatusBadgeVariant(item.status)}
                        className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase"
                      >
                        {formatStatus(item.status)}
                      </Badge>
                    )}

                    {canUpdate && openStatusDropdownId === item.news_id && (
                      <div
                        className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 mt-1.5 w-38 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-150 text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase px-2.5 py-1 tracking-wider border-b border-[var(--border-color)]/60 mb-1">
                          Change Status
                        </div>
                        <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-0.5">
                          {NEWS_STATUS_OPTIONS.map((opt) => {
                            const isCurrent = normalizeNewsStatus(item.status) === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setOpenStatusDropdownId(null);
                                  if (!isCurrent) {
                                    setPendingStatusChange({ item, newStatus: opt.value });
                                  }
                                }}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                  isCurrent
                                    ? 'bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-900 dark:text-zinc-100'
                                    : 'text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    opt.value === 'published' ? 'bg-emerald-500' : 'bg-rose-500'
                                  }`} />
                                  <span className="text-[11px] truncate">{opt.label}</span>
                                </span>
                                {isCurrent && <Check size={12} className="text-zinc-900 dark:text-zinc-100 shrink-0 ml-1" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* 6. Manage Actions */}
                <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1.5">
                    {canUpdate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(item)}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="Edit Record"
                        aria-label={`Edit news article ${item.title}`}
                      >
                        <Edit2 size={13} />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(item.news_id, item.title)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Record"
                        aria-label={`Delete news article ${item.title}`}
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
            ))
          )}
        </TableBody>
      </Table>

      <Pagination
        currentPage={currentPage}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </div>

    {/* Confirmation Dialog for Status Change wrapped in Portal */}
    {pendingStatusChange && (
      <Portal>
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !isChangingStatus && setPendingStatusChange(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200 shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                <AlertCircle size={20} />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Confirm Status Change
                </h3>
                <p className="text-xs text-zinc-500 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to update the status of{' '}
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {pendingStatusChange.item.title || 'this news article'}
                  </span>
                  ?
                </p>
              </div>
            </div>

            {/* Visual Status Transition */}
            <div className="flex items-center justify-center gap-3 p-3 bg-zinc-50 dark:bg-slate-900/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">Current</span>
                <Badge variant={getStatusBadgeVariant(pendingStatusChange.item.status)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                  {formatStatus(pendingStatusChange.item.status)}
                </Badge>
              </div>
              <span className="text-zinc-400 dark:text-slate-600 font-bold text-lg px-2">→</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">New Status</span>
                <Badge variant={getStatusBadgeVariant(pendingStatusChange.newStatus)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                  {formatStatus(pendingStatusChange.newStatus)}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isChangingStatus}
                onClick={() => setPendingStatusChange(null)}
                className="font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isChangingStatus}
                onClick={async () => {
                  if (!pendingStatusChange) return;
                  setIsChangingStatus(true);
                  try {
                    if (onStatusChange) {
                      await onStatusChange(pendingStatusChange.item.news_id, pendingStatusChange.newStatus);
                    }
                    setPendingStatusChange(null);
                  } catch (err) {
                    console.error('Failed to change news status:', err);
                  } finally {
                    setIsChangingStatus(false);
                  }
                }}
                className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs min-w-[130px] cursor-pointer"
              >
                {isChangingStatus ? 'Updating...' : 'Confirm Change'}
              </Button>
            </div>
          </div>
        </div>
      </Portal>
    )}
    </>
  );
}

