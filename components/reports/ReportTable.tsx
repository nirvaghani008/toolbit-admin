'use client';

import { useState } from 'react';
import { Flag, Trash2, User, Edit2, Inbox } from 'lucide-react';
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
  let variant: 'destructive' | 'warning' | 'violet' | 'info' | 'slate' = 'slate';

  if (norm === 'not working') {
    variant = 'destructive';
  } else if (norm === 'false info') {
    variant = 'warning';
  } else if (norm === 'needs review' || norm === 'need review' || norm.includes('review')) {
    variant = 'warning';
  } else if (norm === 'detail mismatch') {
    variant = 'violet';
  } else {
    variant = 'slate';
  }

  return (
    <Badge variant={variant} className="text-[9px] px-2 py-0.5 font-bold tracking-wider shadow-2xs">
      {formatReportType(type)}
    </Badge>
  );
}

import ToolLogo from '@/components/common/ToolLogo';
export const ToolReportLogo = ToolLogo;



export function SubmitterAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name?: string | null }) {
  const [hasError, setHasError] = useState(false);

  if (avatarUrl && !hasError) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0 shadow-2xs bg-zinc-100 dark:bg-zinc-800">
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
    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shrink-0 shadow-2xs">
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
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[22%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tool Name</TableHead>
            <TableHead className="w-[20%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Submitted By</TableHead>
            <TableHead className="w-[15%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Report Type</TableHead>
            <TableHead className="w-[23%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Description</TableHead>
            <TableHead className="w-[12%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Reported At</TableHead>
            <TableHead className="w-[8%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <Skeleton className="h-3.5 w-36 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-2.5 w-32 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-44 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-20 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
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
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                >
                  <TableCell className="px-4 py-3.5">
                    <div className="flex items-center gap-3 max-w-[240px]">
                      <ToolReportLogo tool={report.ai_tools} toolName={toolName} />
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {toolName}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3.5">
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

                  <TableCell className="px-2 py-3.5 text-center">
                    <ReportTypeBadge type={report.report_type} />
                  </TableCell>

                  <TableCell className="px-4 py-3.5">
                    <p className="text-xs font-medium text-[var(--text-secondary)] max-w-[240px] truncate italic opacity-80 group-hover:opacity-100 transition-opacity">
                      {report.description || <span className="text-[var(--text-muted)] not-italic">No description</span>}
                    </p>
                  </TableCell>

                  <TableCell className="px-4 py-3.5">
                    <span className="text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">
                      {new Date(report.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditTool(report)}
                        className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                        title="Edit Reported Tool"
                        aria-label={`Edit reported tool ${toolName}`}
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(report.id)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Report"
                        aria-label={`Delete report #${report.id}`}
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

