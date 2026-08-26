'use client';

import { useState, useEffect } from 'react';
import { Edit2, Trash2, FileText, User, Shield, Inbox, ChevronDown, Check, AlertCircle } from 'lucide-react';
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

export const BLOG_STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'pending', label: 'Pending' },
  { value: 'draft', label: 'Draft' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
] as const;

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  author_name?: string;
  categories?: string[];
  view_count?: number;
  featured_image_url?: string;
  content_mdx?: string;
  description?: string;
  tags?: string[];
  is_paid?: boolean;
  is_featured?: boolean;
  ai_approved?: boolean | null;
  ai_denied_reason?: string | null;
  submission_tier?: string | null;
}


interface BlogTableProps {
  blogs: BlogPost[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (blog: BlogPost) => void;
  onDelete: (id: number) => void;
  onPreview: (blog: BlogPost) => void;
  onStatusChange?: (blogId: number, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
}


export function BlogStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'published') {
    return <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Published</Badge>;
  }
  if (s === 'pending') {
    return <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Pending</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="violet" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Draft</Badge>;
  }
  if (s === 'rejected') {
    return <Badge variant="destructive" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Rejected</Badge>;
  }
  return <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">{status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Archived'}</Badge>;
}

export default function BlogTable({
  blogs,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onPreview,
  onStatusChange,
  isLoading = false
}: BlogTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<number | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ blog: BlogPost; newStatus: string } | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

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

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'violet' | 'destructive' | 'slate' => {
    const s = (status || '').toLowerCase();
    if (s === 'published') return 'success';
    if (s === 'pending') return 'warning';
    if (s === 'draft') return 'violet';
    if (s === 'rejected') return 'destructive';
    return 'slate';
  };

  return (
    <>
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[28%] min-w-[220px] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Article Title</TableHead>
            <TableHead className="w-[14%] min-w-[130px] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Author</TableHead>
            <TableHead className="w-[16%] min-w-[140px] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Categories</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px] px-2 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Featured</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px] px-2 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paid</TableHead>
            <TableHead className="w-[12%] text-center min-w-[120px] px-2 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">AI Moderation</TableHead>
            <TableHead className="w-[8%] min-w-[90px] px-3 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Stats</TableHead>
            <TableHead className="w-[8%] text-center min-w-[90px] px-2 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px] px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
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
                      <Skeleton className="h-3.5 w-44 rounded" />
                      <Skeleton className="h-2.5 w-24 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-12 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="px-3 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-14 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-16 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : blogs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-16 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] mb-1 shadow-2xs">
                    <Inbox size={24} className="opacity-60" />
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">No blog posts found</p>
                  <p className="text-xs text-[var(--text-muted)] max-w-sm">
                    No articles match your search or filter criteria. Click &quot;+ New Post&quot; to create one.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            blogs.map((blog, idx) => {
              const categories = blog.categories || [];
              const isAiTeam = (blog.author_name || '').includes('Toolbit AI');

              return (
                <TableRow
                  key={blog.id}
                  onMouseEnter={() => setHoveredId(blog.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === blog.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                  }`}
                >
                  {/* Title & Slug */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 p-1 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all">
                        <FileText size={16} />
                      </div>
                      <div className="max-w-[280px] min-w-0">
                        <button
                          onClick={() => onPreview(blog)}
                          className="text-xs font-semibold text-[var(--text-primary)] hover:text-zinc-900 dark:hover:text-zinc-100 tracking-tight truncate transition-colors text-left block w-full cursor-pointer"
                          title="Click to preview article"
                        >
                          {blog.title || 'Untitled Article'}
                        </button>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5">
                          /{blog.slug}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Author */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 shadow-2xs">
                        {isAiTeam ? (
                          <Shield size={12} className="shrink-0 text-zinc-700 dark:text-zinc-300" />
                        ) : (
                          <User size={12} className="shrink-0" />
                        )}
                      </div>
                      <span
                        className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[130px]"
                        title={blog.author_name || 'Anonymous'}
                      >
                        {blog.author_name || <span className="text-[var(--text-muted)] italic">—</span>}
                      </span>
                    </div>
                  </TableCell>

                  {/* Categories */}
                  <TableCell className="px-4 py-4">
                    <div className="flex flex-wrap gap-1 items-center">
                      {categories.slice(0, 2).map((c: string, i: number) => (
                        <Badge
                          key={i}
                          variant="slate"
                          className="px-2 py-0.5 text-[9px] font-semibold"
                        >
                          {c}
                        </Badge>
                      ))}
                      {categories.length > 2 && (
                        <span className="text-[9px] text-[var(--text-muted)] font-bold ml-0.5">
                          +{categories.length - 2}
                        </span>
                      )}
                      {categories.length === 0 && (
                        <span className="text-[10px] text-[var(--text-muted)] italic">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Featured */}
                  <TableCell className="px-2 py-4 text-center">
                    {blog.is_featured ? (
                      <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">TRUE</Badge>
                    ) : (
                      <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">FALSE</Badge>
                    )}
                  </TableCell>

                  {/* Paid / Free */}
                  <TableCell className="px-2 py-4 text-center">
                    {blog.is_paid ? (
                      <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">$ Paid</Badge>
                    ) : (
                      <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">Free</Badge>
                    )}
                  </TableCell>

                  {/* AI Moderation */}
                  <TableCell className="px-2 py-4 text-center">
                    {blog.ai_approved === true ? (
                      <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider whitespace-nowrap">
                        ✓ AI Approved
                      </Badge>
                    ) : blog.ai_approved === false ? (
                      <div className="relative group/reason inline-block cursor-help whitespace-nowrap">
                        <Badge
                          variant="destructive"
                          className="text-[9px] px-2 py-0.5 font-bold tracking-wider hover:bg-rose-500/20 inline-flex items-center gap-1 cursor-help whitespace-nowrap"
                        >
                          ✕ AI Denied
                        </Badge>
                        {/* Hover Popover */}
                        <div
                          className={`hidden group-hover/reason:block absolute left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-normal ${
                            idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
                          }`}
                        >
                          <div className="font-bold text-rose-400 mb-1 flex items-center gap-1 whitespace-nowrap">
                            <span>✕ AI Rejection Reason</span>
                          </div>
                          <p className="text-slate-200 font-sans">
                            {blog.ai_denied_reason || 'No specific rejection reason recorded.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider whitespace-nowrap">
                        ⏱ Pending
                      </Badge>
                    )}
                  </TableCell>

                  {/* Stats */}
                  <TableCell className="px-3 py-4">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                        {(blog.view_count || 0).toLocaleString()} Views
                      </span>
                    </div>
                  </TableCell>

                  {/* Status — interactive dropdown */}
                  <TableCell className="px-2 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={() => setOpenStatusDropdownId(openStatusDropdownId === blog.id ? null : blog.id)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer group/status focus:outline-none"
                        title="Click to change status"
                      >
                        <Badge
                          variant={getStatusBadgeVariant(blog.status)}
                          className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase cursor-pointer"
                        >
                          {blog.status ? blog.status.charAt(0).toUpperCase() + blog.status.slice(1) : 'Draft'}
                        </Badge>
                        <ChevronDown size={11} className={`text-[var(--text-muted)] group-hover/status:text-[var(--text-primary)] transition-transform duration-200 ${openStatusDropdownId === blog.id ? 'rotate-180' : ''}`} />
                      </button>

                      {openStatusDropdownId === blog.id && (
                        <div
                          className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 mt-1.5 w-36 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-150 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase px-2.5 py-1 tracking-wider border-b border-[var(--border-color)]/60 mb-1">
                            Change Status
                          </div>
                          <div className="space-y-0.5">
                            {BLOG_STATUS_OPTIONS.map((opt) => {
                              const isCurrent = (blog.status || '').toLowerCase() === opt.value.toLowerCase();
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    setOpenStatusDropdownId(null);
                                    if (!isCurrent) {
                                      setPendingStatusChange({ blog, newStatus: opt.value });
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
                                      opt.value === 'published' ? 'bg-emerald-500' :
                                      opt.value === 'pending' ? 'bg-amber-500' :
                                      opt.value === 'draft' ? 'bg-violet-500' :
                                      opt.value === 'rejected' ? 'bg-rose-500' :
                                      'bg-zinc-400'
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

                  {/* Manage */}
                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(blog)}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="Edit Record"
                        aria-label="Edit Post"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(blog.id)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Record"
                        aria-label="Delete Post"
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

      <Pagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>

    {/* Confirmation Dialog for Status Change */}
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
                    {pendingStatusChange.blog.title || 'this blog post'}
                  </span>
                  ?
                </p>
              </div>
            </div>

            {/* Visual Status Transition */}
            <div className="flex items-center justify-center gap-3 p-3 bg-zinc-50 dark:bg-slate-900/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">Current</span>
                <Badge variant={getStatusBadgeVariant(pendingStatusChange.blog.status)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                  {pendingStatusChange.blog.status ? pendingStatusChange.blog.status.charAt(0).toUpperCase() + pendingStatusChange.blog.status.slice(1) : 'Draft'}
                </Badge>
              </div>
              <span className="text-zinc-400 dark:text-slate-600 font-bold text-lg px-2">→</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">New Status</span>
                <Badge variant={getStatusBadgeVariant(pendingStatusChange.newStatus)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                  {pendingStatusChange.newStatus.charAt(0).toUpperCase() + pendingStatusChange.newStatus.slice(1)}
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
                      await onStatusChange(pendingStatusChange.blog.id, pendingStatusChange.newStatus);
                    }
                    setPendingStatusChange(null);
                  } catch (err) {
                    console.error('Failed to change blog status:', err);
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
