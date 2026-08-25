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
import PlanBadge from '@/components/common/PlanBadge';

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
  is_verified?: boolean | string | number;
  verified?: boolean | string | number;
  is_paid?: boolean | string | number;
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
  onDelete: (id: number) => void;
  onPreview: (tool: ToolSubmission) => void;
  isLoading?: boolean;
}

function SubmissionToolLogo({ tool, toolName }: { tool: any; toolName: string }) {
  const info = tool?.tool_info || {};

  const candidateUrl =
    tool?.favicon_url ||
    tool?.icon_url ||
    tool?.logo_url ||
    tool?.image_url ||
    tool?.featured_image_url ||
    info.favicon_url ||
    info.icon_url ||
    info.logo_url ||
    info.logo ||
    info.icon ||
    info.imageUrl;

  let faviconApiUrl: string | null = null;
  const siteUrl = tool?.tool_site_url || tool?.website_url || info.websiteUrl || info.url || info.website_url;
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
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/15 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
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
          <Wrench size={16} />
        </div>
      )}
    </div>
  );
}

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

  const formatPlanLabel = (val: any): string => {
    if (!val) return 'Free';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      if (typeof val.pricingModel === 'string' && val.pricingModel) return val.pricingModel;
      if (typeof val.pricing_type === 'string' && val.pricing_type) return val.pricing_type;
      if (typeof val.plan === 'string' && val.plan) return val.plan;
      if (typeof val.name === 'string' && val.name) return val.name;
      if (typeof val.type === 'string' && val.type) return val.type;
      if (val.hasFreePlan && val.hasPricing) return 'Freemium';
      if (val.hasFreePlan) return 'Free';
      if (val.hasPricing) return 'Paid';
    }
    return 'Free';
  };

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

  const getStatusBadgeVariant = (status?: string): 'success' | 'destructive' | 'warning' | 'default' => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s.startsWith('show')) return 'success';
    if (s === 'rejected' || s.startsWith('hide')) return 'destructive';
    if (s === 'pending') return 'warning';
    return 'default';
  };

  const formatStatus = (status?: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s.startsWith('show')) return 'Show';
    if (s === 'rejected' || s.startsWith('hide')) return 'Hide';
    if (s === 'pending') return 'Pending';
    return status || 'Show';
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl shadow-sm border border-[var(--border-color)] overflow-hidden animate-fade-in relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[22%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Tool Details
            </TableHead>
            <TableHead className="w-[16%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Submitter
            </TableHead>
            <TableHead className="w-[16%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Categories
            </TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Verified
            </TableHead>
            <TableHead className="w-[9%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Paid Status
            </TableHead>
            <TableHead className="w-[12%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              AI Moderation
            </TableHead>
            <TableHead className="w-[9%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Plan
            </TableHead>
            <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Status
            </TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
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
                  <Skeleton className="h-5 w-12 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-20 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-14 mx-auto rounded-md" />
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
          ) : tools.length > 0 ? (
            tools.map((tool, idx) => {
              const info = tool?.tool_info || {};
              const toolName = info.toolName || info.name || 'Unnamed Tool';
              const categories = extractCategories(tool);

              const rawPricing =
                tool.pricing_type ||
                tool.plan ||
                info.pricing_type ||
                info.plan ||
                info.pricing?.model ||
                info.pricing ||
                'Free';
              const pricingType = formatPlanLabel(rawPricing);
              const isPaidSubmission =
                tool.is_paid === true ||
                tool.is_paid === 'true' ||
                tool.is_paid === 1 ||
                tool.is_paid === '1' ||
                Boolean(tool.isPaid) ||
                Boolean(info.is_paid) ||
                Boolean(info.is_paid_submission);
              const isVerified = Boolean(tool.is_verified || tool.verified || info.is_verified);
              const siteUrl =
                tool.tool_site_url ||
                tool.website_url ||
                info.websiteUrl ||
                info.website_url ||
                info.url ||
                '';

              const tierName = tool.submission_tier
                ? tool.submission_tier.replace(/_/g, ' ')
                : info.submission_tier
                ? info.submission_tier.replace(/_/g, ' ')
                : 'Paid Tier';

              const denialReason =
                tool.ai_denied_reason || tool.rejection_reason || 'No specific rejection reason recorded.';

              return (
                <TableRow
                  key={tool.id || idx}
                  onMouseEnter={() => setHoveredId(tool.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative hover:z-[99] ${
                    hoveredId === tool.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-white dark:bg-indigo-500/[0.04]'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                  }`}
                >
                  {/* Tool Details */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <SubmissionToolLogo tool={tool} toolName={toolName} />
                      <div className="flex flex-col max-w-[220px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreview(tool);
                            }}
                            className="text-xs font-semibold text-[var(--text-primary)] transition-colors line-clamp-1 text-left hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                            title="Click to preview tool"
                          >
                            {toolName}
                          </button>
                          {isPaidSubmission && (
                            <span className="inline-flex items-center justify-center shrink-0" title="Verified Paid Tool">
                              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.79-4-4-4-.495 0-.965.084-1.4.238C14.55 2.475 13.18 1.6 11.6 1.6c-1.58 0-2.95.875-3.6 2.148-.435-.154-.905-.238-1.4-.238-2.21 0-4 1.79-4 4 0 .495.084.965.238 1.4C1.575 9.55.7 10.92.7 12.5c0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.79 4 4 4 .495 0 .965-.084 1.4-.238.65 1.273 2.02 2.148 3.6 2.148 1.58 0 2.95-.875 3.6-2.148.435.154.905.238 1.4.238 2.21 0 4-1.79 4-4 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6z"
                                  fill="#1d9bf0"
                                />
                                <path
                                  d="M9.86 16.5a1 1 0 0 1-.707-.293l-3.36-3.36a1 1 0 1 1 1.414-1.414l2.653 2.653 6.84-6.84a1 1 0 1 1 1.414 1.414l-7.547 7.547a1 1 0 0 1-.707.293z"
                                  fill="#ffffff"
                                />
                              </svg>
                            </span>
                          )}
                        </div>
                        {siteUrl && (
                          <a
                            href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[var(--text-muted)] font-medium hover:text-indigo-500 flex items-center gap-1 mt-0.5"
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
                      <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 shadow-2xs">
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

                  {/* Verified */}
                  <TableCell className="px-2 py-4 text-center">
                    {isVerified ? (
                      <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">
                        TRUE
                      </Badge>
                    ) : (
                      <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
                        FALSE
                      </Badge>
                    )}
                  </TableCell>

                  {/* Paid Status */}
                  <TableCell className="px-2 py-4 text-center">
                    <div className="flex items-center justify-center">
                      {isPaidSubmission ? (
                        <div className="relative group/tier inline-block cursor-help whitespace-nowrap">
                          <Badge variant="success" className="text-[9px] px-2 py-0.5 font-extrabold tracking-wider">
                            $ Paid
                          </Badge>
                          {/* Hover Popover for Paid Submission Tier */}
                          <div
                            className={`hidden group-hover/tier:block absolute left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-nowrap ${
                              idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
                            }`}
                          >
                            <p className="font-medium capitalize text-slate-100">{tierName}</p>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider">
                          Unpaid
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
                          {/* Hover Popover */}
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

                  {/* Plan */}
                  <TableCell className="px-2 py-4 text-center">
                    <PlanBadge plan={rawPricing} />
                  </TableCell>

                  {/* Status */}
                  <TableCell className="px-2 py-4 text-center">
                    <Badge
                      variant={getStatusBadgeVariant(tool.status)}
                      className="text-[9px] px-2 py-0.5 font-bold tracking-wider"
                    >
                      {formatStatus(tool.status)}
                    </Badge>
                  </TableCell>

                  {/* Manage Actions */}
                  <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 hover:text-indigo-500 hover:border-indigo-500/30"
                        onClick={() => onEdit(tool)}
                        title="Edit/Moderate Submission"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 hover:text-rose-500 hover:border-rose-500/30"
                        onClick={() => onDelete(tool.id)}
                        title="Delete Submission"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="px-6 py-14 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <Inbox className="w-8 h-8 opacity-40" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    No tool submissions found matching your criteria.
                  </span>
                </div>
              </TableCell>
            </TableRow>
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
