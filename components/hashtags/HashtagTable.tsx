'use client';

import { useState } from 'react';
import { Edit2, Trash2, Tag, ExternalLink, Inbox } from 'lucide-react';
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

interface Hashtag {
  id?: number;
  hashtag_id?: number;
  name?: string;
  hashtag_name?: string;
  slug?: string;
  hashtag_url?: string;
  parent_tag?: string;
  parent_hashtag?: string;
  tool_count?: number;
  hashtag_counter?: number;
  views?: number;
  status: string;
  updated_at: string;
}

interface HashtagTableProps {
  hashtags: Hashtag[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (hashtag: Hashtag) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
}

function HashtagStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success">Show</Badge>;
  }
  if (s === 'hide') {
    return <Badge variant="destructive">Hide</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="warning">Draft</Badge>;
  }
  return <Badge variant="slate">Archived</Badge>;
}

export default function HashtagTable({
  hashtags,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  isLoading = false
}: HashtagTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[30%]">Hashtag Name</TableHead>
            <TableHead className="w-[20%]">Parent</TableHead>
            <TableHead className="w-[15%]">Tools Usage</TableHead>
            <TableHead className="w-[15%]">Views Count</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
            <TableHead className="w-[10%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-32 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
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
                <TableCell>
                  <Skeleton className="h-3.5 w-16 rounded" />
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
          ) : hashtags.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No hashtags found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No hashtags match your search criteria or filter. Try clearing filters or creating a new hashtag.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            hashtags.map((hashtag, index) => {
              const tagId = hashtag.id ?? hashtag.hashtag_id ?? index;
              const tagName = hashtag.name || hashtag.hashtag_name || '';
              const tagSlug = hashtag.slug || hashtag.hashtag_url || '';
              const parentTag = hashtag.parent_tag || hashtag.parent_hashtag || '';
              const toolCount = hashtag.tool_count ?? hashtag.hashtag_counter ?? 0;
              const subCount = hashtags.filter(h => (h.parent_tag || h.parent_hashtag) === tagName && tagName !== '').length;
              const displayName = tagName.startsWith('#') ? tagName : `#${tagName}`;

              return (
                <TableRow
                  key={`hashtag-${tagId}-${index}`}
                  onMouseEnter={() => setHoveredId(tagId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === tagId
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                        <Tag size={16} />
                      </div>
                      <div className="min-w-0 max-w-[260px]">
                        <div className="text-xs font-bold text-[var(--text-primary)] tracking-tight truncate">
                          {displayName}
                        </div>
                        {hashtag.status === 'show' ? (
                          <a
                            href={`https://toolbit.ai/hashtag/${tagSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-medium mt-0.5 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                          >
                            <span>/{tagSlug}</span>
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : (
                          <span
                            className="inline-block text-[10px] text-[var(--text-muted)] font-medium mt-0.5 cursor-not-allowed opacity-60"
                            title="URL not active until shown"
                          >
                            /{tagSlug}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {parentTag ? (
                      <Badge variant="secondary" className="font-semibold text-[10px] lowercase-none tracking-normal">
                        {parentTag}
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] font-medium italic opacity-50">
                        None
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-tight">
                        {toolCount} {toolCount === 1 ? 'Tool' : 'Tools'}
                      </span>
                      {subCount > 0 && (
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          {subCount} Nested
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-tight">
                      {(hashtag.views || 0).toLocaleString()} Views
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <HashtagStatusBadge status={hashtag.status} />
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(hashtag);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                        title="Edit Record"
                        aria-label={`Edit hashtag ${displayName}`}
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(tagId);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Record"
                        aria-label={`Delete hashtag ${displayName}`}
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
