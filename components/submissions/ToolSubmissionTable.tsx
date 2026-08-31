'use client';

import { useState } from 'react';
import { ExternalLink, Edit2, Trash2, Wrench, User, Inbox, Info } from 'lucide-react';
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
import { getToolSubmissionStatusOption } from '@/lib/tool-submissions';
import { useAdmin } from '@/contexts/AdminContext';

export interface ToolSubmission {
  id: number;
  tool_id?: number;
  user_id?: string;
  full_name?: string;
  business_email?: string;
  tool_site_url?: string;
  website_url?: string;
  favicon_url?: string;
  icon_url?: string;
  logo_url?: string;
  image_url?: string;
  featured_image_url?: string;
  is_paid?: boolean | null;
  submission_tier?: string;
  ai_approved?: boolean | null;
  ai_denied_reason?: string;
  rejection_reason?: string;
  pricing_type?: any;
  plan?: any;
  status: string;
  tool_info?: any;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

interface ToolSubmissionTableProps {
  tools: ToolSubmission[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (tool: ToolSubmission) => void;
  onDelete: (id: number, name?: string) => void;
  onPreview: (tool: ToolSubmission) => void;
  isLoading?: boolean;
}

import ToolLogo from '@/components/common/ToolLogo';


export default function ToolSubmissionTable({
  tools,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onPreview,
  isLoading = false,
}: ToolSubmissionTableProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const { hasPermission, isSuperAdmin } = useAdmin();
  const canUpdate = isSuperAdmin || hasPermission('submissions', 'update') || hasPermission('tool_submissions', 'update');
  const canDelete = isSuperAdmin || hasPermission('submissions', 'delete') || hasPermission('tool_submissions', 'delete');

  const extractCategories = (t: any): string[] => {
    const info = t?.tool_info || {};
    const raw: any =
      info.categories ||
      t?.categories ||
      info.category ||
      t?.category ||
      info.primary_category ||
      info.category_name;
    if (Array.isArray(raw)) {
      return raw.map((c: any) => (typeof c === 'string' ? c : c?.name || String(c))).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      if (raw.includes(',')) return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      return [raw.trim()];
    }
    return [];
  };

  const getStatusBadgeVariant = (status?: string) => getToolSubmissionStatusOption(status).variant;

  const formatStatus = (status?: string) => getToolSubmissionStatusOption(status).label;

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border-color)] overflow-hidden animate-fade-in relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[24%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Tool Details
            </TableHead>
            <TableHead className="w-[17%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Submitter
            </TableHead>
            <TableHead className="w-[17%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Categories
            </TableHead>
            <TableHead className="w-[11%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Plan
            </TableHead>
            <TableHead className="w-[14%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              AI Moderation
            </TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Status
            </TableHead>
            <TableHead className="w-[9%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Manage
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="animate-pulse">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex flex-col space-y-2">
                      <Skeleton className="h-3.5 w-32 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <div className="flex flex-col space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-20 rounded" />
                      <Skeleton className="h-2 w-28 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-12 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
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
          ) : tools.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No tool submissions found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No submissions match your search criteria or active filters.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            tools.map((tool, idx) => {
              const info = tool.tool_info || {};
              const toolName = info.toolName || info.name || tool.tool_site_url || 'Unnamed Tool';
              const siteUrl = tool.tool_site_url || info.websiteUrl || info.url || '';
              const categories = extractCategories(tool);

              const isPaidSubmission = tool.is_paid === true;
              const tierName = tool.submission_tier?.trim();

              const denialReason =
                tool.ai_denied_reason ||
                tool.rejection_reason ||
                info.ai_denied_reason ||
                info.rejection_reason ||
                'Submission did not satisfy criteria.';

              return (
                <TableRow
                  key={tool.id}
                  onClick={() => onPreview(tool)}
                  onMouseEnter={() => setHoveredId(tool.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                    hoveredId === tool.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                  }`}
                >
                  {/* Tool Details */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ToolLogo tool={tool} toolName={toolName} />
                      <div className="flex flex-col max-w-[220px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreview(tool);
                            }}
                            className="text-xs font-semibold text-[var(--text-primary)] transition-colors line-clamp-1 text-left hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                            title="Click to preview tool"
                          >
                            {toolName}
                          </button>
                        </div>
                        {siteUrl && (
                          <a
                            href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[var(--text-muted)] font-medium hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1 mt-0.5"
                          >
                            {(() => {
                              try {
                                return new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname.replace('www.', '');
                              } catch {
                                return 'visit site';
                              }
                            })()}
                            <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Submitter */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 shadow-2xs">
                        <User size={12} />
                      </div>
                      <div className="flex flex-col max-w-[150px]">
                        <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                          {tool.full_name || 'Anonymous'}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)] font-medium truncate">
                          {tool.business_email || '—'}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Categories */}
                  <TableCell className="px-4 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {categories.slice(0, 2).map((c: string, i: number) => (
                        <Badge key={i} variant="slate" className="text-[9px] px-2 py-0.5 font-semibold capitalize">
                          {c}
                        </Badge>
                      ))}
                      {categories.length === 0 && <span className="text-[9px] text-[var(--text-muted)] italic">—</span>}
                      {categories.length > 2 && (
                        <span className="text-[9px] text-[var(--text-muted)] font-medium ml-1">
                          +{categories.length - 2} more
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Plan */}
                  <TableCell className="px-2 py-4 text-center">
                    <div className="flex items-center justify-center">
                      {isPaidSubmission ? (
                        <div className="relative group/tier inline-block cursor-help whitespace-nowrap">
                          <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">
                            Paid
                          </Badge>
                          {tierName && (
                            <div
                              className={`hidden group-hover/tier:block absolute left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-nowrap ${
                                idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
                              }`}
                            >
                              <p className="font-medium capitalize text-slate-100">{tierName}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
                          Free
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* AI Moderation */}
                  <TableCell className="px-2 py-4 text-center">
                    <div className="flex items-center justify-center">
                      {tool.ai_approved === true ? (
                        <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider whitespace-nowrap">
                          ✓ AI Approved
                        </Badge>
                      ) : tool.ai_approved === false ? (
                        <div className="relative group/reason inline-block cursor-help whitespace-nowrap">
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-2 py-0.5 font-bold tracking-wider whitespace-nowrap inline-flex items-center gap-1 cursor-help hover:opacity-90"
                          >
                            ✕ AI Denied
                          </Badge>
                          <div
                            className={`hidden group-hover/reason:block absolute left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-normal text-left ${
                              idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
                            }`}
                          >
                            <div className="font-bold text-rose-400 mb-1 flex items-center gap-1">
                              <Info size={13} className="shrink-0" />
                              <span>AI Rejection Reason</span>
                            </div>
                            <p className="text-slate-200 text-xs font-normal leading-relaxed">{denialReason}</p>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider whitespace-nowrap">
                          ⏱ Pending
                        </Badge>
                      )}
                    </div>
                  </TableCell>


                  {/* Status */}
                  <TableCell className="px-2 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge
                        variant={getStatusBadgeVariant(tool.status)}
                        className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase"
                      >
                        {formatStatus(tool.status)}
                      </Badge>
                      {tool.scheduled_launch_date && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 font-semibold whitespace-nowrap"
                          title={`Scheduled Launch Date: ${String(tool.scheduled_launch_date).split('T')[0]}`}
                        >
                          📅 {String(tool.scheduled_launch_date).split('T')[0]}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Manage Actions */}
                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(tool)}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Record"
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(tool.id, toolName)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Record"
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

      <Pagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>
  );
}

