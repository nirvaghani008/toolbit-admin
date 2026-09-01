'use client';

import { useState } from 'react';
import { ExternalLink, Edit2, Trash2, Share2, Eye, Inbox } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import SocialPreviewModal from './SocialPreviewModal';
import StatusChangeControl, { StatusOption } from '@/components/common/StatusChangeControl';
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
import { useAdmin } from '@/contexts/AdminContext';

// Proper visibility statuses for social posts.
// The socials.status column has a DB CHECK constraint allowing only 'Show' / 'Hide'.
export const SOCIAL_STATUS_OPTIONS: readonly StatusOption[] = [
  { value: 'Show', label: 'Show' },
  { value: 'Hide', label: 'Hide' },
];

const YoutubeIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </svg>
);

const TwitterIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const InstagramIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const RedditIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="9.5" cy="11.8" r="0.9" fill="currentColor" />
    <circle cx="14.5" cy="11.8" r="0.9" fill="currentColor" />
    <path d="M9.5 14.5a3 3 0 0 0 5 0" />
    <path d="M12 6V3l2.8 0.8" />
    <circle cx="16" cy="4" r="1.2" />
    <ellipse cx="5" cy="12.5" rx="1.2" ry="1.8" />
    <ellipse cx="19" cy="12.5" rx="1.2" ry="1.8" />
  </svg>
);

export interface SocialItem {
  id: number;
  title: string;
  account_name?: string | null;
  description?: string | null;
  platform?: string;
  content_type?: string[];
  source_url?: string | null;
  tags?: string[];
  is_featured?: boolean;
  is_trending?: boolean;
  status: string;
  view_counter?: number;
  visit_counter?: number;
  published_date?: string | null;
  json_data?: Record<string, any>;
  created_at?: string;
}

interface SocialTableProps {
  socials: SocialItem[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (item: SocialItem) => void;
  onDelete: (id: number, name?: string) => void;
  onStatusChange?: (id: number | string, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
}

export default function SocialTable({
  socials,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  isLoading = false
}: SocialTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const [previewSocial, setPreviewSocial] = useState<SocialItem | null>(null);
  const { hasPermission } = useAdmin();
  const canUpdate = hasPermission('socials', 'update');
  const canDelete = hasPermission('socials', 'delete');

  const getStatusBadgeVariant = (status?: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' => {
    const s = (status || 'show').toLowerCase();
    if (s === 'show' || s === 'active' || s === 'published') return 'success';
    if (s === 'hide') return 'slate';
    if (s === 'draft') return 'warning';
    if (s === 'archived') return 'violet';
    return 'slate';
  };

  const formatStatus = (status?: string) => {
    const s = (status || 'show').toLowerCase();
    if (s === 'show' || s === 'active' || s === 'published') return 'Show';
    if (s === 'hide') return 'Hide';
    if (s === 'draft') return 'Draft';
    if (s === 'archived') return 'Archived';
    return status || 'Show';
  };

  const renderPlatformBadge = (platform?: string) => {
    const p = (platform || 'Other').toLowerCase();
    if (p.includes('youtube')) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            <YoutubeIcon size={18} className="fill-rose-500/20 stroke-rose-600 dark:stroke-rose-400" />
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">YouTube</span>
        </div>
      );
    }
    if (p.includes('twitter') || p.includes('x')) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            <TwitterIcon size={18} className="fill-sky-500/20 stroke-sky-600 dark:stroke-sky-400" />
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">Twitter</span>
        </div>
      );
    }
    if (p.includes('reddit')) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            <RedditIcon size={18} className="stroke-orange-600 dark:stroke-orange-400" />
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">Reddit</span>
        </div>
      );
    }
    if (p.includes('instagram')) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            <InstagramIcon size={18} className="stroke-pink-600 dark:stroke-pink-400" />
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">Instagram</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
          <Share2 size={16} className="stroke-zinc-600 dark:stroke-zinc-300" />
        </div>
        <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight">{platform || 'Social'}</span>
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[12%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Platform</TableHead>
            <TableHead className="w-[32%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Social Post / Update</TableHead>
            <TableHead className="w-[14%] px-3 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Content Type</TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Featured</TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Trending</TableHead>
            <TableHead className="w-[10%] px-3 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Published</TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[8%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="animate-pulse hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-44 rounded" />
                    <Skeleton className="h-2.5 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-3 py-4">
                  <Skeleton className="h-5 w-20 rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
                  <Skeleton className="h-4 w-20 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : socials.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No social updates found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No social media posts match your search or filter criteria. Try changing filters or create a new social update.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            socials.map((item) => (
              <TableRow
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                  hoveredId === item.id
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                }`}
              >
                {/* 1. Provider Logo */}
                <TableCell className="px-4 py-3.5">
                  {renderPlatformBadge(item.platform)}
                </TableCell>

                {/* 2. Social Post Title & View Link */}
                <TableCell className="px-4 py-3.5">
                  <div className="w-full overflow-hidden">
                    <button
                      onClick={() => setPreviewSocial(item)}
                      className="text-xs font-semibold text-[var(--text-primary)] hover:text-zinc-900 dark:hover:text-zinc-100 tracking-tight block truncate w-full text-left transition-colors cursor-pointer"
                      title={item.title || 'Social Announcement'}
                    >
                      {item.title || 'Social Announcement'}
                    </button>
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[var(--text-muted)] font-medium hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1 mt-1 truncate max-w-full"
                      >
                        View Post <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </TableCell>

                {/* 3. Content Type */}
                <TableCell className="px-3 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(item.content_type) ? item.content_type : [item.content_type || 'Announcement'])
                      .filter(Boolean)
                      .map((type, idx) => (
                        <Badge
                          key={idx}
                          variant="slate"
                          className="px-2 py-0.5 text-[9px] font-semibold"
                        >
                          {type}
                        </Badge>
                      ))}
                  </div>
                </TableCell>

                {/* 4. Featured */}
                <TableCell className="px-2 py-3.5 text-center">
                  {item.is_featured ? (
                    <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">
                      TRUE
                    </Badge>
                  ) : (
                    <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
                      FALSE
                    </Badge>
                  )}
                </TableCell>

                {/* 5. Trending */}
                <TableCell className="px-2 py-3.5 text-center">
                  {item.is_trending ? (
                    <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">
                      TRUE
                    </Badge>
                  ) : (
                    <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
                      FALSE
                    </Badge>
                  )}
                </TableCell>

                {/* 6. Published Date */}
                <TableCell className="px-3 py-3.5 text-center">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                    {item.published_date
                      ? new Date(item.published_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                      : <span className="text-[var(--text-muted)] text-[10px]">—</span>}
                  </span>
                </TableCell>

                {/* 7. Status with interactive dropdown */}
                <TableCell className="px-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                  {canUpdate && onStatusChange ? (
                    <StatusChangeControl
                      itemId={item.id}
                      currentStatus={item.status}
                      options={SOCIAL_STATUS_OPTIONS}
                      itemLabel={item.title || 'this social post'}
                      onStatusChange={onStatusChange}
                      getVariant={getStatusBadgeVariant}
                      formatStatus={formatStatus}
                    />
                  ) : (
                    <Badge
                      variant={getStatusBadgeVariant(item.status)}
                      className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase"
                    >
                      {formatStatus(item.status)}
                    </Badge>
                  )}
                </TableCell>

                {/* 9. Manage */}
                <TableCell className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewSocial(item)}
                      className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                      title="Preview Live Post Card"
                      aria-label="Preview Post"
                    >
                      <Eye size={13} />
                    </Button>
                    {canUpdate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(item)}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="Edit Record"
                        aria-label="Edit Record"
                      >
                        <Edit2 size={13} />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(item.id, item.title || item.account_name || `Social Post #${item.id}`)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Record"
                        aria-label="Delete Record"
                      >
                        <Trash2 size={13} />
                      </Button>
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

      {/* Social Post Live Card Preview Modal */}
      {previewSocial && (
        <SocialPreviewModal
          social={previewSocial}
          onClose={() => setPreviewSocial(null)}
        />
      )}
    </div>
  );
}

