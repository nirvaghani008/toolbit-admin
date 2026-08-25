'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Edit2, Trash2, Wrench, Eye, ChevronDown, Check, AlertCircle } from 'lucide-react';
import ToolPreviewModal from './ToolPreviewModal';
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
import PlanBadge from '@/components/common/PlanBadge';

export const TOOL_STATUS_OPTIONS = [
  { value: 'show', label: 'Show' },
  { value: 'show:invalid', label: 'Show: Invalid' },
  { value: 'show:error', label: 'Show: Error' },
  { value: 'show:inactive', label: 'Show: Inactive' },
  { value: 'hide', label: 'Hide' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
  { value: 'pending', label: 'Pending' },
  { value: 'error', label: 'Error' },
] as const;

interface Tool {
  tool_id: number;
  tool_url?: string;
  tool_site_url?: string;
  tool_info?: any;
  status: string;
  updated_at?: string;
  view_counter?: number;
  visit_counter?: number;
  full_name?: string;
  business_email?: string;
  is_verified?: boolean | string | number;
  verified?: boolean | string | number;
  is_paid?: boolean | string | number;
  isPaid?: boolean | string | number;
  submission_tier?: string;
  ai_approved?: boolean | null;
  ai_denied_reason?: string;
  rejection_reason?: string;
  pricing_type?: any;
  plan?: any;
  [key: string]: any;
}

interface ToolTableProps {
  tools: Tool[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (tool: Tool) => void;
  onDelete: (id: number) => void;
  onStatusChange?: (toolId: number | string, newStatus: string) => Promise<void> | void;
  isLoading?: boolean;
}

function ToolLogo({ tool, toolName }: { tool: any; toolName: string }) {
  const info = tool.tool_info || {};

  const candidateUrl =
    (tool as any).favicon_url ||
    (tool as any).icon_url ||
    (tool as any).logo_url ||
    (tool as any).image_url ||
    (tool as any).featured_image_url ||
    info.favicon_url ||
    info.icon_url ||
    info.logo_url ||
    info.logo ||
    info.icon ||
    info.imageUrl;

  let faviconApiUrl: string | null = null;
  const siteUrl = tool.tool_site_url || (tool as any).website_url || info.websiteUrl || info.url || info.website_url;
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
    <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105">
      {!hasError && currentSrc ? (
        <img
          src={currentSrc}
          alt={toolName}
          onError={handleError}
          className="w-full h-full object-contain rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300">
          <Wrench size={16} />
        </div>
      )}
    </div>
  );
}

export default function ToolTable({
  tools,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
  isLoading = false
}: ToolTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const [previewTool, setPreviewTool] = useState<Tool | null>(null);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<number | string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ tool: Tool; newStatus: string } | null>(null);
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

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' => {
    const s = (status || '').toLowerCase();
    if (s === 'show' || s === 'approved') return 'success';
    if (s === 'show:invalid') return 'warning';
    if (s === 'show:error' || s === 'error') return 'destructive';
    if (s === 'show:inactive') return 'info';
    if (s === 'archived') return 'violet';
    if (s === 'hide' || s === 'rejected') return 'slate';
    if (s === 'draft' || s === 'pending') return 'warning';
    return 'default';
  };

  const formatStatus = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'show') return 'Show';
    if (s === 'show:invalid') return 'Show: Invalid';
    if (s === 'show:error') return 'Show: Error';
    if (s === 'hide') return 'Hide';
    if (s === 'draft') return 'Draft';
    if (s === 'error') return 'Error';
    if (s === 'archived') return 'Archived';
    if (s === 'show:inactive') return 'Show: Inactive';
    if (s === 'approved') return 'Show';
    if (s === 'rejected') return 'Hide';
    if (s === 'pending') return 'Pending';
    return status || 'Show';
  };

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
    const raw: any = info.categories || t?.categories || info.category || t?.category || info.primary_category || info.category_name;
    if (Array.isArray(raw)) {
      return raw.map((c: any) => (typeof c === 'string' ? c : (c?.name || String(c)))).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      if (raw.includes(',')) return raw.split(',').map(s => s.trim()).filter(Boolean);
      return [raw.trim()];
    }
    return [];
  };

  return (
    <>
      <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
              <TableHead className="w-[24%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tool Details</TableHead>
              <TableHead className="w-[18%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Categories</TableHead>
              <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Views</TableHead>
              <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Verified</TableHead>
              <TableHead className="w-[9%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paid Status</TableHead>
              <TableHead className="w-[12%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">AI Moderation</TableHead>
              <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Plan</TableHead>
              <TableHead className="w-[8%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
              <TableHead className="w-[8%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
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
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-16 rounded-md" />
                      <Skeleton className="h-5 w-12 rounded-md" />
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-4 text-center">
                    <Skeleton className="h-4 w-10 mx-auto rounded" />
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
            ) : tools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="px-6 py-12 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  No tools found.
                </TableCell>
              </TableRow>
            ) : (
              tools.map((tool, idx) => {
                const info = tool.tool_info || {};
                const categories = extractCategories(tool);

                const rawPricing = tool.pricing_type || tool.plan || info.pricing_type || info.plan || info.pricing?.model || info.pricing || 'Free';
                const pricingType = formatPlanLabel(rawPricing);
                const isPaidSubmission = tool.is_paid === true || tool.is_paid === 'true' || tool.is_paid === 1 || tool.is_paid === '1' || Boolean((tool as any).isPaid) || Boolean(info.is_paid) || Boolean(info.is_paid_submission);
                const isVerified = Boolean(tool.is_verified || tool.verified || info.is_verified);
                const viewCount = tool.view_counter ?? tool.visit_counter ?? info.view_counter ?? info.visit_counter ?? 0;

                const siteUrl = tool.tool_site_url || tool.tool_url || info.websiteUrl || info.website_url || info.url || '';

                return (
                  <TableRow
                    key={tool.tool_id || idx}
                    onMouseEnter={() => setHoveredId(tool.tool_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`transition-all duration-200 group cursor-pointer border-l-2 relative hover:z-[99] ${
                      hoveredId === tool.tool_id
                        ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-white dark:bg-zinc-800/40'
                        : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                    }`}
                  >
                    {/* Tool Details */}
                    <TableCell className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ToolLogo tool={tool} toolName={info.toolName || info.name || 'Unnamed Tool'} />
                        <div className="flex flex-col max-w-[220px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              onClick={() => setPreviewTool(tool)}
                              className="text-xs font-semibold text-[var(--text-primary)] transition-colors line-clamp-1 text-left hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                              title="Click to preview"
                            >
                              {info.toolName || info.name || 'Unnamed Tool'}
                            </button>
                            {isPaidSubmission && (
                              <span className="inline-flex items-center justify-center shrink-0" title="Verified Paid Tool">
                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                  <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.79-4-4-4-.495 0-.965.084-1.4.238C14.55 2.475 13.18 1.6 11.6 1.6c-1.58 0-2.95.875-3.6 2.148-.435-.154-.905-.238-1.4-.238-2.21 0-4 1.79-4 4 0 .495.084.965.238 1.4C1.575 9.55.7 10.92.7 12.5c0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.79 4 4 4 .495 0 .965-.084 1.4-.238.65 1.273 2.02 2.148 3.6 2.148 1.58 0 2.95-.875 3.6-2.148.435.154.905.238 1.4.238 2.21 0 4-1.79 4-4 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6z" fill="#1d9bf0" />
                                  <path d="M9.86 16.5a1 1 0 0 1-.707-.293l-3.36-3.36a1 1 0 1 1 1.414-1.414l2.653 2.653 6.84-6.84a1 1 0 1 1 1.414 1.414l-7.547 7.547a1 1 0 0 1-.707.293z" fill="#ffffff" />
                                </svg>
                              </span>
                            )}
                          </div>
                          {siteUrl && (
                            <a
                              href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
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

                    {/* Categories */}
                    <TableCell className="px-4 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {categories.slice(0, 2).map((c: string, i: number) => (
                          <Badge key={i} variant="slate" className="text-[9px] px-2 py-0.5 font-semibold capitalize">
                            {c}
                          </Badge>
                        ))}
                        {categories.length === 0 && <span className="text-[9px] text-[var(--text-muted)] italic">—</span>}
                        {categories.length > 2 && <span className="text-[9px] text-[var(--text-muted)] font-medium ml-1">+{categories.length - 2} more</span>}
                      </div>
                    </TableCell>

                    {/* Views */}
                    <TableCell className="px-2 py-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                        <Eye size={12} className="text-[var(--text-muted)]" />
                        <span>{viewCount.toLocaleString()}</span>
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
                            <div className={`hidden group-hover/tier:block absolute left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-nowrap ${idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                              <p className="text-slate-200 font-medium capitalize">
                                {tool.submission_tier ? tool.submission_tier.replace(/_/g, ' ') : (info.submission_tier ? info.submission_tier.replace(/_/g, ' ') : 'Paid Tier')}
                              </p>
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
                            <Badge variant="destructive" className="text-[9px] px-2 py-0.5 font-bold tracking-wider hover:bg-rose-500/20 inline-flex items-center gap-1 whitespace-nowrap cursor-help">
                              ✕ AI Denied
                            </Badge>
                            <div className={`hidden group-hover/reason:block absolute left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-2xl text-[11px] leading-relaxed z-[9999] border border-slate-700 pointer-events-none whitespace-normal ${idx === 0 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
                              <div className="font-bold text-rose-400 mb-1 flex items-center gap-1 whitespace-nowrap">
                                <span>✕ AI Rejection Reason</span>
                              </div>
                              <p className="text-slate-200 text-xs">
                                {tool.ai_denied_reason || tool.rejection_reason || 'No specific rejection reason recorded.'}
                              </p>
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

                    {/* Status with interactive dropdown */}
                    <TableCell className="px-2 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenStatusDropdownId(openStatusDropdownId === tool.tool_id ? null : tool.tool_id)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer group/status focus:outline-none"
                          title="Click to change status"
                        >
                          <Badge
                            variant={getStatusBadgeVariant(tool.status)}
                            className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase cursor-pointer"
                          >
                            {formatStatus(tool.status)}
                          </Badge>
                          <ChevronDown size={11} className={`text-[var(--text-muted)] group-hover/status:text-[var(--text-primary)] transition-transform duration-200 ${openStatusDropdownId === tool.tool_id ? 'rotate-180' : ''}`} />
                        </button>

                        {openStatusDropdownId === tool.tool_id && (
                          <div
                            className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 mt-1.5 w-38 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-150 text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase px-2.5 py-1 tracking-wider border-b border-[var(--border-color)]/60 mb-1">
                              Change Status
                            </div>
                            <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-0.5">
                              {TOOL_STATUS_OPTIONS.map((opt) => {
                                const isCurrent = (tool.status || '').toLowerCase() === opt.value.toLowerCase();
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setOpenStatusDropdownId(null);
                                      if (!isCurrent) {
                                        setPendingStatusChange({ tool, newStatus: opt.value });
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
                                        opt.value === 'show' ? 'bg-emerald-500' :
                                        opt.value.startsWith('show:') ? 'bg-amber-500' :
                                        opt.value === 'archived' ? 'bg-violet-500' :
                                        opt.value === 'error' || opt.value === 'show:error' ? 'bg-rose-500' :
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
                          onClick={() => onEdit(tool)}
                          className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                          title="Edit Record"
                        >
                          <Edit2 size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(tool.tool_id)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }))}
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

      {/* Confirmation Dialog for Status Change wrapped in Portal */}
      {pendingStatusChange && (
        <Portal>
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => !isChangingStatus && setPendingStatusChange(null)}
          >
            <div
              className="bg-white dark:bg-[#151c2c] border border-zinc-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200 shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                  <AlertCircle size={20} />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Confirm Status Change
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 leading-relaxed">
                    Are you sure you want to update the status of{' '}
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {pendingStatusChange.tool.tool_info?.toolName || pendingStatusChange.tool.tool_url || 'this tool'}
                    </span>
                    ?
                  </p>
                </div>
              </div>

              {/* Visual Status Transition */}
              <div className="flex items-center justify-center gap-3 p-3 bg-zinc-50 dark:bg-slate-900/60 rounded-xl border border-zinc-200/80 dark:border-slate-800">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">Current</span>
                  <Badge variant={getStatusBadgeVariant(pendingStatusChange.tool.status)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                    {formatStatus(pendingStatusChange.tool.status)}
                  </Badge>
                </div>
                <span className="text-zinc-400 dark:text-slate-600 font-bold text-lg px-2">→</span>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">New Status</span>
                  <Badge variant={getStatusBadgeVariant(pendingStatusChange.newStatus)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                    {formatStatus(pendingStatusChange.newStatus)}
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
                        await onStatusChange(pendingStatusChange.tool.tool_id, pendingStatusChange.newStatus);
                      }
                      setPendingStatusChange(null);
                    } catch (err) {
                      console.error('Failed to change status:', err);
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

      {previewTool && (
        <ToolPreviewModal
          tool={previewTool}
          onClose={() => setPreviewTool(null)}
        />
      )}
    </>
  );
}