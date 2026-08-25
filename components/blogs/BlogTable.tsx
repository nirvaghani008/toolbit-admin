'use client';

import { useState } from 'react';
import { Edit2, Trash2, FileText, User, Shield, Inbox } from 'lucide-react';
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
  isLoading?: boolean;
}

export function BlogStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'published') {
    return <Badge variant="success">Published</Badge>;
  }
  if (s === 'pending') {
    return <Badge variant="warning">Pending</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="violet">Draft</Badge>;
  }
  return <Badge variant="slate">{status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Archived'}</Badge>;
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
  isLoading = false
}: BlogTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[28%] min-w-[220px]">Article Title</TableHead>
            <TableHead className="w-[14%] min-w-[130px]">Author</TableHead>
            <TableHead className="w-[16%] min-w-[140px]">Categories</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px]">Featured</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px]">Paid</TableHead>
            <TableHead className="w-[12%] text-center min-w-[120px]">AI Moderation</TableHead>
            <TableHead className="w-[8%] min-w-[90px]">Stats</TableHead>
            <TableHead className="w-[8%] text-center min-w-[90px]">Status</TableHead>
            <TableHead className="w-[8%] text-center min-w-[80px]">Manage</TableHead>
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
                      <Skeleton className="h-3.5 w-44 rounded" />
                      <Skeleton className="h-2.5 w-24 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-12 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-14 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-20 rounded-md mx-auto" />
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-14 rounded" />
                    <Skeleton className="h-2.5 w-16 rounded" />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-16 rounded-md mx-auto" />
                </TableCell>
                <TableCell className="text-center">
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
                  className={`group transition-colors border-l-2 ${
                    hoveredId === blog.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-indigo-400 dark:bg-indigo-500/[0.04]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  {/* Title & Slug */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 flex items-center justify-center shrink-0 border border-indigo-500/15 shadow-2xs group-hover:scale-105 transition-transform">
                        <FileText size={16} />
                      </div>
                      <div className="max-w-[280px] min-w-0">
                        <button
                          onClick={() => onPreview(blog)}
                          className="text-xs font-bold text-[var(--text-primary)] hover:text-indigo-600 dark:hover:text-indigo-400 tracking-tight truncate transition-colors text-left block w-full cursor-pointer"
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
                  <TableCell>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 shadow-2xs">
                        {isAiTeam ? (
                          <Shield size={12} className="shrink-0 text-indigo-500" />
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
                  <TableCell>
                    <div className="flex flex-wrap gap-1 items-center">
                      {categories.slice(0, 2).map((c: string, i: number) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="px-2 py-0.5 text-[9px] font-semibold border-[var(--border-color)]"
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
                  <TableCell className="text-center">
                    {blog.is_featured ? (
                      <Badge variant="success">TRUE</Badge>
                    ) : (
                      <Badge variant="secondary">FALSE</Badge>
                    )}
                  </TableCell>

                  {/* Paid */}
                  <TableCell className="text-center">
                    {blog.is_paid ? (
                      <Badge variant="success">$ Paid</Badge>
                    ) : (
                      <Badge variant="secondary">Unpaid</Badge>
                    )}
                  </TableCell>

                  {/* AI Moderation */}
                  <TableCell className="text-center">
                    {blog.ai_approved === true ? (
                      <Badge variant="success" className="whitespace-nowrap">
                        ✓ Approved
                      </Badge>
                    ) : blog.ai_approved === false ? (
                      <div className="relative group/reason inline-block cursor-help whitespace-nowrap">
                        <Badge
                          variant="destructive"
                          className="transition-all hover:bg-rose-500/20 inline-flex items-center gap-1 cursor-help whitespace-nowrap"
                        >
                          ✕ Denied
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
                      <Badge variant="warning" className="whitespace-nowrap">
                        ⏱ Pending
                      </Badge>
                    )}
                  </TableCell>

                  {/* Stats */}
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {blog.view_count || 0} Views
                      </span>
                      <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                        Engagement
                      </span>
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="text-center">
                    <BlogStatusBadge status={blog.status} />
                  </TableCell>

                  {/* Manage */}
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(blog)}
                        className="h-7 w-7 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-indigo-500 hover:bg-indigo-500/10 transition-all shadow-2xs cursor-pointer"
                        title="Edit Post"
                        aria-label="Edit Post"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(blog.id)}
                        className="h-7 w-7 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-all shadow-2xs cursor-pointer"
                        title="Delete Post"
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
  );
}
