'use client';

import { useState } from 'react';
import { Edit2, Trash2, Folder, ExternalLink, Inbox } from 'lucide-react';
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

interface Category {
  id?: number;
  category_id?: number;
  name?: string;
  category_name?: string;
  slug?: string;
  category_url?: string;
  parent?: string;
  parent_category?: string;
  tool_count?: number;
  category_counter?: number;
  views?: number;
  status: string;
  updated_at: string;
}

interface CategoryTableProps {
  categories: Category[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (category: Category) => void;
  onDelete: (id: number, name?: string) => void;
  onStatusChange?: (categoryId: number | string, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
}

export function CategoryStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Show</Badge>;
  }
  return <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Hide</Badge>;
}

export default function CategoryTable({
  categories,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  isLoading = false
}: CategoryTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const { hasPermission } = useAdmin();
  const canUpdate = hasPermission('categories', 'update');
  const canDelete = hasPermission('categories', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[30%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Category Name</TableHead>
            <TableHead className="w-[20%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Parent</TableHead>
            <TableHead className="w-[15%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tools Usage</TableHead>
            <TableHead className="w-[15%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Views Count</TableHead>
            <TableHead className="w-[10%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-32 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
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
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-4 w-12 rounded" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
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
          ) : categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-64 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-3 bg-[var(--bg-elevated)] rounded-full text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">No categories found</p>
                  <p className="text-xs text-[var(--text-muted)]">Try adjusting your filters or search keywords.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            categories.map((category) => {
              const catId = (category.id || category.category_id) as number;
              const categoryName = category.category_name || category.name || '';
              const categorySlug = category.category_url || category.slug || '';
              const parentCategory = category.parent_category || category.parent;
              const toolCount = category.tool_count ?? category.category_counter ?? 0;
              const subCount = categories.filter(c => (c.parent_category || c.parent) === categoryName).length;

              return (
                <TableRow
                  key={catId || categorySlug}
                  onMouseEnter={() => setHoveredId(catId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="transition-colors group hover:bg-[var(--bg-elevated)]/30"
                >
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0 group-hover:scale-105 transition-transform">
                        <Folder size={17} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                          {categoryName}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          /{categorySlug}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    {parentCategory ? (
                      <Badge variant="outline" className="text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
                        {parentCategory}
                      </Badge>
                    ) : (
                      <span className="text-[9px] text-[var(--text-muted)] italic">
                        —
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">
                        {toolCount} {toolCount === 1 ? 'Tool' : 'Tools'}
                      </span>
                      {subCount > 0 && (
                        <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          {subCount} Nested
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">
                      {(category.views || 0).toLocaleString()} Views
                    </span>
                  </TableCell>

                  <TableCell className="px-2 py-4 text-center">
                    {canUpdate && onStatusChange && (category.id != null || category.category_id != null) ? (
                      <StatusChangeControl
                        itemId={category.id ?? category.category_id ?? ''}
                        currentStatus={category.status}
                        options={[
                          { value: 'show', label: 'Show' },
                          { value: 'hide', label: 'Hide' },
                        ]}
                        itemLabel={categoryName || 'this category'}
                        onStatusChange={onStatusChange}
                        getVariant={(status) => (status || '').toLowerCase() === 'show' ? 'success' : 'slate'}
                        formatStatus={(status) => (status || '').toLowerCase() === 'show' ? 'Show' : 'Hide'}
                      />
                    ) : (
                      <CategoryStatusBadge status={category.status} />
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(category)}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Record"
                          aria-label={`Edit category ${categoryName}`}
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(catId, categoryName)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Record"
                          aria-label={`Delete category ${categoryName}`}
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

