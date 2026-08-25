'use client';

import { useState } from 'react';
import { Flag, Trash2, User, Pencil, Inbox } from 'lucide-react';
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

export interface Submitter {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ToolReport {
  id: number;
  tool_id: number;
  user_id: string;
  report_type: string;
  description: string | null;
  created_at: string;
  ai_tools?: {
    tool_id: number;
    favicon_url?: string;
    tool_site_url?: string;
    tool_url?: string;
    tool_info?: any;
  } | null;
  submitter?: Submitter | null;
}

export function formatReportType(type: string) {
  if (!type) return 'Other Issue';
  const norm = type.toLowerCase().replace(/_/g, ' ').trim();
  if (norm === 'not working') return 'Not Working';
  if (norm === 'false info') return 'False Info';
  if (norm === 'needs review' || norm === 'need review' || norm === 'need to review' || norm === 'nees review') return 'Needs Review';
  if (norm === 'detail mismatch') return 'Detail Mismatch';
  return type.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function ReportTypeBadge({ type }: { type: string }) {
  const norm = (type || '').toLowerCase().replace(/_/g, ' ').trim();
  let variant: 'destructive' | 'warning' | 'violet' | 'info' | 'default' = 'info';

  if (norm === 'not working') {
    variant = 'destructive';
  } else if (norm === 'false info') {
    variant = 'warning';
  } else if (norm === 'needs review' || norm === 'need review' || norm.includes('review')) {
    variant = 'warning';
  } else if (norm === 'detail mismatch') {
    variant = 'violet';
  } else {
    variant = 'info';
  }

  return (
    <Badge variant={variant} className="shadow-2xs">
      {formatReportType(type)}
    </Badge>
  );
}

export function ToolReportLogo({ tool, toolName }: { tool: any; toolName: string }) {
  const info = tool?.tool_info || {};
  const candidateUrl =
    tool?.favicon_url ||
    info?.favicon_url ||
    info?.icon_url ||
    info?.logo_url ||
    info?.logo ||
    info?.icon;

  let faviconApiUrl: string | null = null;
  const siteUrl = tool?.tool_site_url || tool?.tool_url || info?.websiteUrl || info?.url;
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
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
      {!hasError && currentSrc ? (
        <img
          src={currentSrc}
          alt={toolName}
          onError={handleError}
          className="w-full h-full object-contain rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-indigo-500">
          <Flag size={14} />
        </div>
      )}
    </div>
  );
}

export function SubmitterAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name?: string | null }) {
  const [hasError, setHasError] = useState(false);

  if (avatarUrl && !hasError) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--border-color)] shrink-0 shadow-2xs bg-[var(--bg-elevated)]">
        <img
          src={avatarUrl}
          alt={name || 'User'}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] shrink-0 shadow-2xs">
      <User size={14} />
    </div>
  );
}

interface ReportTableProps {
  reports: ToolReport[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEditTool: (report: ToolReport) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
}

export default function ReportTable({
  reports,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEditTool,
  onDelete,
  isLoading = false,
}: ReportTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[24%]">Tool Name</TableHead>
            <TableHead className="w-[20%]">Submitted By</TableHead>
            <TableHead className="w-[15%] text-center">Report Type</TableHead>
            <TableHead className="w-[23%]">Description</TableHead>
            <TableHead className="w-[10%]">Reported At</TableHead>
            <TableHead className="w-[8%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                    <Skeleton className="h-3.5 w-36 rounded" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-2.5 w-32 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-44 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-20 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : reports.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No issue reports found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No reports match your search criteria or filter. Try clearing filters or selecting another issue type.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            reports.map((report) => {
              const toolInfo = report.ai_tools?.tool_info || {};
              const toolName = toolInfo.toolName || toolInfo.name || report.ai_tools?.tool_url || `Tool #${report.tool_id}`;
              const submitterName = report.submitter?.full_name || report.submitter?.email || 'User';

              return (
                <TableRow
                  key={report.id}
                  onMouseEnter={() => setHoveredId(report.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === report.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 max-w-[240px]">
                      <ToolReportLogo tool={report.ai_tools} toolName={toolName} />
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {toolName}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3 max-w-[200px]">
                      <SubmitterAvatar avatarUrl={report.submitter?.avatar_url} name={submitterName} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {submitterName}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] font-medium truncate">
                          {report.submitter?.email || '—'}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <ReportTypeBadge type={report.report_type} />
                  </TableCell>

                  <TableCell>
                    <p className="text-xs font-medium text-[var(--text-secondary)] max-w-[240px] truncate italic opacity-80 group-hover:opacity-100 transition-opacity">
                      {report.description || <span className="text-[var(--text-muted)] not-italic">No description</span>}
                    </p>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">
                      {new Date(report.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTool(report);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                        title="Edit Reported Tool"
                        aria-label={`Edit reported tool ${toolName}`}
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(report.id);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Report"
                        aria-label={`Delete report #${report.id}`}
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
