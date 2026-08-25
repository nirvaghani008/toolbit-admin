'use client';

import { useState } from 'react';
import { ExternalLink, Edit2, Trash2, User, Eye, Inbox } from 'lucide-react';
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

interface AdvertiseTableProps {
  data: any[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (item: any) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
  statusFilter?: string;
  sortBy?: string;
  sortOrder?: string;
  onStatusFilterChange?: (status: string) => void;
  onSortChange?: (sort: string) => void;
  onRefresh?: () => void;
}

function AdvertiseToolLogo({ item, toolName }: { item: any; toolName: string }) {
  const info = typeof item.tool_info === 'string'
    ? (() => { try { return JSON.parse(item.tool_info); } catch { return {}; } })()
    : (item.tool_info || {});

  const candidateUrl =
    item.favicon_url ||
    item.icon_url ||
    item.logo_url ||
    item.image_url ||
    info.favicon_url ||
    info.icon_url ||
    info.logo_url ||
    info.logo ||
    info.icon ||
    info.imageUrl;

  let faviconApiUrl: string | null = null;
  const siteUrl = item.tool_site_url || item.url || info.websiteUrl || info.url || info.website_url;
  if (siteUrl && typeof siteUrl === 'string') {
    try {
      const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
      const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '');
      if (hostname) {
        faviconApiUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      }
    } catch {
      // ignore parse errors
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
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
      {!hasError && currentSrc ? (
        <img
          src={currentSrc}
          alt={toolName}
          onError={handleError}
          className="w-full h-full object-contain rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-indigo-500 font-bold text-xs">
          {toolName.substring(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export default function AdvertiseTable({
  data,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onEdit,
  onDelete,
  isLoading = false
}: AdvertiseTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  const getToolNameFromUrl = (url: string) => {
    try {
      const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
      const hostname = new URL(cleanUrl).hostname;
      const parts = hostname.replace('www.', '').split('.');
      let name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return 'Unnamed Tool';
    }
  };

  const getToolName = (item: any) => {
    if (item.tool_name && typeof item.tool_name === 'string' && item.tool_name.trim()) {
      return item.tool_name.trim();
    }

    const info = typeof item.tool_info === 'string'
      ? (() => { try { return JSON.parse(item.tool_info || '{}'); } catch { return {}; } })()
      : (item.tool_info || {});

    const nameFromInfo = info.toolName || info.name || info.tool_name || info.title || info.overview;
    if (nameFromInfo && typeof nameFromInfo === 'string' && nameFromInfo.trim()) {
      return nameFromInfo.trim();
    }

    if (item.name && typeof item.name === 'string' && item.name.trim()) return item.name.trim();
    if (item.title && typeof item.title === 'string' && item.title.trim()) return item.title.trim();

    return getToolNameFromUrl(item.tool_site_url || item.url || '');
  };

  const getStatusBadgeVariant = (status?: string): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'inactive') return 'warning';
    if (s === 'expired') return 'destructive';
    return 'secondary';
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="px-6 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tool Info</TableHead>
            <TableHead className="px-6 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Submitter</TableHead>
            <TableHead className="px-6 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Placement</TableHead>
            <TableHead className="px-6 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Views</TableHead>
            <TableHead className="px-6 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Clicks</TableHead>
            <TableHead className="px-6 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="px-6 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="animate-pulse hover:bg-transparent">
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex-grow space-y-2">
                      <Skeleton className="h-3.5 w-36 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-20 rounded" />
                      <Skeleton className="h-2 w-24 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4">
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 text-center">
                  <Skeleton className="h-3.5 w-8 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-6 py-4 text-center">
                  <Skeleton className="h-3.5 w-8 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-6 py-4 text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-full" />
                </TableCell>
                <TableCell className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <Skeleton className="w-8 h-8 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No advertise tools found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No advertise tool placements match your search or filter criteria. Try adjusting your filters or adding a new record.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => {
              const toolName = getToolName(item);
              const siteUrl = item.tool_site_url || item.url || '';
              const submitterName = item.full_name || item.user_name || item.name || item.submitter_name || 'Admin';
              const submitterEmail = item.business_email || item.user_email || item.email || item.submitter_email || '';

              const info = typeof item.tool_info === 'string'
                ? (() => { try { return JSON.parse(item.tool_info || '{}'); } catch { return {}; } })()
                : (item.tool_info || {});
              const isPaid = item.is_paid === true || item.is_paid === 'true' || item.is_paid === 'TRUE' || item.isPaid === true || info.is_paid === true || info.is_paid === 'TRUE' || info.isPaid === true || Boolean(info.is_paid_submission);

              return (
                <TableRow
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group border-l-2 relative ${
                    hoveredId === item.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-indigo-500'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  {/* Tool Info */}
                  <TableCell className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <AdvertiseToolLogo item={item} toolName={toolName} />
                      <div className="flex flex-col max-w-[200px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {toolName}
                          </span>
                          {isPaid && (
                            <span className="inline-flex items-center justify-center shrink-0 self-center" title="Verified Paid Tool">
                              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.79-4-4-4-.495 0-.965.084-1.4.238C14.55 2.475 13.18 1.6 11.6 1.6c-1.58 0-2.95.875-3.6 2.148-.435-.154-.905-.238-1.4-.238-2.21 0-4 1.79-4 4 0 .495.084.965.238 1.4C1.575 9.55.7 10.92.7 12.5c0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.79 4 4 4 .495 0 .965-.084 1.4-.238.65 1.273 2.02 2.148 3.6 2.148 1.58 0 2.95-.875 3.6-2.148.435.154.905.238 1.4.238 2.21 0 4-1.79 4-4 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6z" fill="#1d9bf0" />
                                <path d="M9.86 16.5a1 1 0 0 1-.707-.293l-3.36-3.36a1 1 0 1 1 1.414-1.414l2.653 2.653 6.84-6.84a1 1 0 1 1 1.414 1.414l-7.547 7.547a1 1 0 0 1-.707.293z" fill="#ffffff" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {siteUrl ? (
                          <a
                            href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-[var(--text-muted)] hover:text-sky-500 hover:underline truncate flex items-center gap-1 mt-0.5 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              try {
                                const clean = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
                                return new URL(clean).hostname.replace('www.', '');
                              } catch {
                                return siteUrl;
                              }
                            })()} <ExternalLink size={9} className="shrink-0" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] italic">No URL provided</span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Submitter Info */}
                  <TableCell className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] shrink-0 shadow-2xs">
                        <User size={12} />
                      </div>
                      <div className="flex flex-col max-w-[160px]">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {submitterName}
                        </span>
                        {submitterEmail ? (
                          <span className="text-[10px] text-[var(--text-muted)] font-medium truncate">
                            {submitterEmail}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>

                  {/* Placement Types */}
                  <TableCell className="px-6 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {Array.isArray(item.featured_type) ? (
                        item.featured_type.map((type: string) => (
                          <Badge
                            key={type}
                            variant="default"
                            className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          >
                            {type}
                          </Badge>
                        ))
                      ) : item.featured_type ? (
                        <Badge
                          variant="default"
                          className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        >
                          {item.featured_type}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] italic">None</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Views */}
                  <TableCell className="px-6 py-3.5 text-center">
                    <div className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                      <Eye size={12} className="text-[var(--text-muted)]" />
                      <span>{(item.views_count || item.impression_count || 0).toLocaleString()}</span>
                    </div>
                  </TableCell>

                  {/* Clicks */}
                  <TableCell className="px-6 py-3.5 text-center">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      {(item.clicks_count || item.click_count || 0).toLocaleString()}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="px-6 py-3.5 text-center">
                    <Badge
                      variant={getStatusBadgeVariant(item.status)}
                      className="px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
                    >
                      {item.status || 'inactive'}
                    </Badge>
                  </TableCell>

                  {/* Manage */}
                  <TableCell className="px-6 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(item)}
                        className="w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                        title="Edit Record"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(item.id)}
                        className="w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete Record"
                      >
                        <Trash2 size={14} />
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
