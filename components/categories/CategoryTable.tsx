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
  onDelete: (id: number) => void;
  isLoading?: boolean;
}

function CategoryStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Show</Badge>;
  }
  if (s === 'hide') {
    return <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Hide</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Draft</Badge>;
  }
  if (s === 'archived') {
    return <Badge variant="violet" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Archived</Badge>;
  }
  return <Badge variant="default" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">{status || 'Draft'}</Badge>;
}

export default function CategoryTable({
  categories,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  isLoading = false
}: CategoryTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

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
                  <Skeleton className="h-3.5 w-16 rounded" />
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
          ) : categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No categories found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No categories match your search criteria or filter. Try clearing filters or creating a new category.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            categories.map((category, index) => {
              const categoryName = category.name || category.category_name || '';
              const categorySlug = category.slug || category.category_url || '';
              const parentCat = category.parent || category.parent_category || '';
              const toolCount = category.tool_count ?? category.category_counter ?? 0;
              const catId = category.id ?? category.category_id ?? index;
              const subCount = categories.filter(
                (c) => (c.parent || c.parent_category) === categoryName && categoryName !== ''
              ).length;

              return (
                <TableRow
                  key={`category-${catId}-${index}`}
                  onClick={() => onEdit(category)}
                  onMouseEnter={() => setHoveredId(catId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === catId
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-white dark:bg-zinc-800/40'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                  }`}
                >
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 p-1 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all">
                        <Folder size={16} />
                      </div>
                      <div className="min-w-0 max-w-[260px]">
                        <div className="text-xs font-semibold text-[var(--text-primary)] transition-colors line-clamp-1 text-left">
                          {categoryName}
                        </div>
                        {category.status === 'show' ? (
                          <a
                            href={`https://toolbit.ai/category/${categorySlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[var(--text-muted)] font-medium hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1 mt-0.5"
                          >
                            <span>/{categorySlug}</span>
                            <ExternalLink size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : (
                          <span
                            className="inline-block text-[10px] text-[var(--text-muted)] font-medium mt-0.5 cursor-not-allowed opacity-60"
                            title="URL not active until shown"
                          >
                            /{categorySlug}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    {parentCat ? (
                      <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-semibold capitalize">
                        {parentCat}
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
                    <CategoryStatusBadge status={category.status} />
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(category)}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="Edit Record"
                        aria-label={`Edit category ${categoryName}`}
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(catId)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Record"
                        aria-label={`Delete category ${categoryName}`}
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
