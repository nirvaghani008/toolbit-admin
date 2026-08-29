'use client';

import { useState } from 'react';
import { Edit2, Trash2, Tag, Inbox } from 'lucide-react';
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

export interface TagItem {
  id?: number;
  name?: string;
  slug?: string;
  parent_tag?: string;
  parent?: string;
  tool_count?: number;
  views?: number;
  status: string;
  updated_at: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  description?: string;
}

interface TagTableProps {
  tags: TagItem[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (tag: TagItem) => void;
  onDelete: (id: number, name?: string) => void;
  onStatusChange?: (tagId: number | string, newStatus: string) => Promise<void> | void;
  availableStatuses?: readonly string[];
  isLoading?: boolean;
}

export function TagStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Show</Badge>;
  }
  if (s === 'hide') {
    return <Badge variant="destructive" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Hide</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Draft</Badge>;
  }
  if (s === 'archived') {
    return <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Archived</Badge>;
  }
  return <Badge variant="default" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">{status || 'Show'}</Badge>;
}

const DEFAULT_TAG_STATUS_VALUES = ['show', 'hide', 'draft', 'archived'] as const;

const formatTagStatus = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'show') return 'Show';
  if (s === 'hide') return 'Hide';
  if (s === 'draft') return 'Draft';
  if (s === 'archived') return 'Archived';
  return status || 'Show';
};

const getTagStatusVariant = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'show') return 'success';
  if (s === 'hide') return 'destructive';
  if (s === 'draft') return 'warning';
  if (s === 'archived') return 'slate';
  return 'default';
};

const getTagStatusOptions = (availableStatuses: readonly string[] | undefined, currentStatus: string) => {
  const baseStatuses = availableStatuses?.length ? availableStatuses : DEFAULT_TAG_STATUS_VALUES;
  const normalizedStatuses = [...baseStatuses, currentStatus]
    .map((status) => (status || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalizedStatuses)).map((value) => ({
    value,
    label: formatTagStatus(value)
  }));
};

export default function TagTable({
  tags,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  availableStatuses,
  isLoading = false
}: TagTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const { hasPermission } = useAdmin();
  const canUpdate = hasPermission('tags', 'update');
  const canDelete = hasPermission('tags', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[30%] px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tag & Slug</TableHead>
            <TableHead className="w-[20%] px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Parent Tag</TableHead>
            <TableHead className="w-[15%] px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tools Usage</TableHead>
            <TableHead className="w-[15%] px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Views Count</TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-32 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4">
                  <Skeleton className="h-4 w-12 rounded" />
                </TableCell>
                <TableCell className="px-6 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-16 rounded" />
                    <Skeleton className="h-2.5 w-12 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4">
                  <Skeleton className="h-4 w-12 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <Skeleton className="h-5 w-14 rounded-full mx-auto" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex justify-center gap-1.5">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <Skeleton className="h-7 w-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : tags.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-64 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-3 bg-[var(--bg-elevated)] rounded-full text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">No tags found</p>
                  <p className="text-xs text-[var(--text-muted)]">Try adjusting your filters or search keywords.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            tags.map((tag) => {
              const tagId = (tag.id) as number;
              const displayName = tag.name || '';
              const slug = tag.slug || '';
              const parentTag = tag.parent_tag || tag.parent;
              const toolCount = tag.tool_count ?? 0;

              return (
                <TableRow
                  key={tagId || slug}
                  onMouseEnter={() => setHoveredId(tagId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="transition-colors group hover:bg-[var(--bg-elevated)]/30"
                >
                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0 group-hover:scale-105 transition-transform">
                        <Tag size={17} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                          {displayName}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          /{slug}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="px-6 py-4">
                    {parentTag ? (
                      <Badge variant="outline" className="text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
                        {parentTag}
                      </Badge>
                    ) : (
                      <span className="text-[9px] text-[var(--text-muted)] italic">
                        —
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">
                        {toolCount.toLocaleString()} {toolCount === 1 ? 'Tool' : 'Tools'}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="px-6 py-4">
                    <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-tight">
                      {(tag.views || 0).toLocaleString()} Views
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    {canUpdate && onStatusChange && tag.id != null ? (
                      <StatusChangeControl
                        itemId={tag.id ?? ''}
                        currentStatus={tag.status}
                        options={getTagStatusOptions(availableStatuses, tag.status)}
                        itemLabel={displayName || 'this tag'}
                        onStatusChange={onStatusChange}
                        getVariant={getTagStatusVariant}
                        formatStatus={formatTagStatus}
                      />
                    ) : (
                      <TagStatusBadge status={tag.status} />
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(tag)}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Record"
                          aria-label={`Edit tag ${displayName}`}
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(tagId, displayName)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Record"
                          aria-label={`Delete tag ${displayName}`}
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

