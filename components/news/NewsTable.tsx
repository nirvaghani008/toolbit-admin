'use client';

import { useState } from 'react';
import { ExternalLink, Edit2, Trash2, Newspaper, Inbox } from 'lucide-react';
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

interface NewsTableProps {
  news: NewsItem[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (item: NewsItem) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
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
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-2xs overflow-hidden">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={item.source_name || item.title || 'News'}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-lg p-1.5"
          loading="lazy"
        />
      ) : (
        <Newspaper size={16} />
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
  isLoading = false
}: NewsTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  const getStatusBadgeVariant = (status?: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' => {
    const s = (status || 'show').toLowerCase();
    if (s === 'show' || s === 'published' || s === 'active') return 'success';
    if (s === 'hide') return 'destructive';
    if (s === 'draft') return 'warning';
    if (s === 'archived') return 'slate';
    return 'default';
  };

  const formatStatus = (status?: string) => {
    const s = (status || 'show').toLowerCase();
    if (s === 'show' || s === 'published') return 'Show';
    if (s === 'hide') return 'Hide';
    if (s === 'draft') return 'Draft';
    if (s === 'archived') return 'Archived';
    return status || 'Show';
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[42%] px-6 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Headline</TableHead>
            <TableHead className="w-[18%] px-4 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Source</TableHead>
            <TableHead className="w-[16%] px-4 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Categories</TableHead>
            <TableHead className="w-[10%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Published</TableHead>
            <TableHead className="w-[7%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[7%] px-4 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
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
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-[#0ea5e9]/[0.02] dark:border-l-white'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-[#0ea5e9]/[0.02]'
                }`}
              >
                {/* 1. Headline & Summary */}
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <NewsLogo item={item} />
                    <div className="w-full overflow-hidden">
                      <span
                        onClick={() => onEdit(item)}
                        className="text-xs font-bold text-[var(--text-primary)] hover:text-indigo-600 dark:hover:text-[#0ea5e9] tracking-tight block truncate w-full transition-colors cursor-pointer"
                        title={item.title || 'Untitled Headline'}
                      >
                        {item.title || 'Untitled Headline'}
                      </span>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--text-muted)] font-medium hover:text-indigo-500 transition-colors inline-flex items-center gap-1 mt-0.5"
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
                      <Badge key={i} variant="secondary" className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
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

                {/* 5. Status */}
                <TableCell className="px-3 py-4 text-center">
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {formatStatus(item.status)}
                  </Badge>
                </TableCell>

                {/* 6. Manage Actions */}
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                      className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                      title="Edit Record"
                      aria-label={`Edit news article ${item.title}`}
                    >
                      <Edit2 size={12} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.news_id);
                      }}
                      className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                      title="Delete Record"
                      aria-label={`Delete news article ${item.title}`}
                    >
                      <Trash2 size={12} />
                    </Button>
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
  );
}
