'use client';

import { useState } from 'react';
import { ExternalLink, Edit2, Trash2, Cpu, Inbox } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import ModelPreviewModal from './ModelPreviewModal';
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

export interface Model {
  id: number;
  name: string;
  provider: string;
  slug?: string;
  model_id_slug?: string;
  release_date?: string | null;
  context_length?: number | null;
  knowledge_cutoff?: string | null;
  architecture?: Record<string, any> | null;
  benchmarks?: any[] | null;
  top_scores?: Record<string, any> | null;
  site_url?: string | null;
  news_url?: string | null;
  status: string;
  favicon_url?: string | null;
  review?: string | null;
  Review?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  model_info?: Record<string, any> | null;
}

interface ModelTableProps {
  models: Model[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onEdit: (model: Model) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
}

function ModelLogo({ model }: { model: Model }) {
  const getFaviconUrl = () => {
    if (model.favicon_url) return model.favicon_url;

    let domain = '';
    if (model.site_url) {
      try {
        domain = new URL(model.site_url.startsWith('http') ? model.site_url : `https://${model.site_url}`).hostname.replace('www.', '');
      } catch {
        // fallback
      }
    }

    if (!domain && model.provider) {
      const p = model.provider.toLowerCase();
      if (p.includes('openai')) domain = 'openai.com';
      else if (p.includes('anthropic') || p.includes('claude')) domain = 'anthropic.com';
      else if (p.includes('google') || p.includes('gemini')) domain = 'google.com';
      else if (p.includes('meta') || p.includes('llama')) domain = 'meta.com';
      else if (p.includes('mistral')) domain = 'mistral.ai';
      else if (p.includes('deepseek')) domain = 'deepseek.com';
      else if (p.includes('cohere')) domain = 'cohere.com';
      else if (p.includes('xai') || p.includes('grok')) domain = 'x.ai';
      else if (p.includes('stability')) domain = 'stability.ai';
      else domain = `${p.replace(/\s+/g, '')}.com`;
    }

    if (domain) {
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }
    return null;
  };

  const faviconUrl = getFaviconUrl();
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={model.name || 'Model'}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-lg p-1.5"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
          <Cpu size={16} />
        </div>
      )}
    </div>
  );
}

export default function ModelTable({
  models,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onEdit,
  onDelete,
  isLoading = false
}: ModelTableProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);
  const [previewModel, setPreviewModel] = useState<Model | null>(null);

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' => {
    const s = (status || '').toLowerCase();
    if (s === 'show' || s === 'active') return 'success';
    if (s === 'show:invalid') return 'warning';
    if (s === 'show:error' || s === 'error') return 'destructive';
    if (s === 'show:inactive') return 'info';
    if (s === 'hide') return 'destructive';
    if (s === 'draft') return 'warning';
    if (s === 'archived') return 'violet';
    return 'slate';
  };

  const formatStatus = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'show') return 'Show';
    if (s === 'show:invalid') return 'Show: Invalid';
    if (s === 'show:error') return 'Show: Error';
    if (s === 'hide') return 'Hide';
    if (s === 'draft') return 'Draft';
    if (s === 'archived') return 'Archived';
    if (s === 'show:inactive') return 'Show: Inactive';
    return status || 'Show';
  };

  const getPricing = (model: Model) => {
    let pricing: any = null;

    if (Array.isArray(model.benchmarks) && model.benchmarks.length > 0 && model.benchmarks[0]?.pricing) {
      pricing = model.benchmarks[0].pricing;
    } else if (typeof model.benchmarks === 'string' && model.benchmarks) {
      try {
        const parsed = JSON.parse(model.benchmarks);
        if (Array.isArray(parsed) && parsed[0]?.pricing) {
          pricing = parsed[0].pricing;
        } else if (parsed?.pricing) {
          pricing = parsed.pricing;
        }
      } catch {}
    }

    if (!pricing) {
      let arch = model.architecture;
      if (typeof arch === 'string') {
        try { arch = JSON.parse(arch); } catch { arch = null; }
      }
      pricing = model.model_info?.pricing || model.model_info?.price || (arch as any)?.pricing || null;
    }

    const inputPrice = pricing?.price_1m_input_tokens ?? pricing?.input_price ?? pricing?.input_tokens ?? null;
    const outputPrice = pricing?.price_1m_output_tokens ?? pricing?.output_price ?? pricing?.output_tokens ?? null;

    return { inputPrice, outputPrice };
  };

  const formatTokenPrice = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === '') {
      return <span className="text-[var(--text-muted)] text-[10px]">—</span>;
    }
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return <span className="text-[var(--text-muted)] text-[10px]">—</span>;
    return `$${num}`;
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden animate-fade-in border border-[var(--border-color)] relative">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[18%] px-4 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Provider</TableHead>
            <TableHead className="w-[24%] px-4 py-3.5 text-left text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Model Name</TableHead>
            <TableHead className="w-[11%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Release Date</TableHead>
            <TableHead className="w-[9%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Context</TableHead>
            <TableHead className="w-[11%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Input Token Price</TableHead>
            <TableHead className="w-[11%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Output Token Price</TableHead>
            <TableHead className="w-[8%] px-3 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[8%] px-4 py-3.5 text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="animate-pulse hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-32 rounded" />
                    <Skeleton className="h-2.5 w-20 rounded" />
                  </div>
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
                  <Skeleton className="h-4 w-20 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
                  <Skeleton className="h-4 w-12 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
                  <Skeleton className="h-4 w-16 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
                  <Skeleton className="h-4 w-16 mx-auto rounded" />
                </TableCell>
                <TableCell className="px-3 py-4 text-center">
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
          ) : models.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No AI models found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No models match your search criteria or filter. Try clearing filters or creating a new model.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            models.map((model) => {
              const { inputPrice, outputPrice } = getPricing(model);
              return (
                <TableRow
                  key={model.id}
                  onMouseEnter={() => setHoveredId(model.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`transition-all duration-200 group cursor-pointer border-l-2 relative hover:z-[10] ${
                    hoveredId === model.id
                      ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-[#0ea5e9]/[0.02] dark:border-l-white'
                      : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-[#0ea5e9]/[0.02]'
                  }`}
                >
                  {/* 1. Provider Logo & Name */}
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ModelLogo model={model} />
                      <span className="text-xs font-bold text-[var(--text-primary)] tracking-tight truncate">
                        {model.provider || 'AI Provider'}
                      </span>
                    </div>
                  </TableCell>

                  {/* 2. Model Name & Announcement URL */}
                  <TableCell className="px-4 py-4 max-w-[260px] lg:max-w-[280px]">
                    <div className="w-full overflow-hidden">
                      <button
                        onClick={() => setPreviewModel(model)}
                        className="text-xs font-bold text-[var(--text-primary)] hover:text-indigo-600 dark:hover:text-[#0ea5e9] tracking-tight block truncate w-full text-left transition-colors cursor-pointer"
                        title={model.name || 'Unnamed Model'}
                      >
                        {model.name || 'Unnamed Model'}
                      </button>
                      {(model.news_url || model.site_url) && (
                        <a
                          href={model.news_url || model.site_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--text-muted)] font-medium hover:text-indigo-500 transition-colors inline-flex items-center gap-1 mt-0.5"
                        >
                          {(() => {
                            const url = model.news_url || model.site_url || '';
                            try { return new URL(url).hostname.replace('www.', ''); }
                            catch { return url; }
                          })()}
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </TableCell>

                  {/* 3. Release Date */}
                  <TableCell className="px-3 py-4 text-center">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                      {model.release_date
                        ? new Date(model.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : <span className="text-[var(--text-muted)] text-[10px]">—</span>}
                    </span>
                  </TableCell>

                  {/* 4. Context Length */}
                  <TableCell className="px-3 py-4 text-center">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                      {model.context_length
                        ? model.context_length >= 1_000_000
                          ? `${(model.context_length / 1_000_000).toFixed(model.context_length % 1_000_000 === 0 ? 0 : 1)}M`
                          : model.context_length >= 1_000
                            ? `${(model.context_length / 1_000).toFixed(model.context_length % 1_000 === 0 ? 0 : 1)}K`
                            : String(model.context_length)
                        : <span className="text-[var(--text-muted)] text-[10px]">—</span>}
                    </span>
                  </TableCell>

                  {/* 5. Input Token Price */}
                  <TableCell className="px-3 py-4 text-center">
                    <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
                      {formatTokenPrice(inputPrice)}
                    </span>
                  </TableCell>

                  {/* 6. Output Token Price */}
                  <TableCell className="px-3 py-4 text-center">
                    <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
                      {formatTokenPrice(outputPrice)}
                    </span>
                  </TableCell>

                  {/* 7. Status */}
                  <TableCell className="px-3 py-4 text-center">
                    <Badge variant={getStatusBadgeVariant(model.status)}>
                      {formatStatus(model.status)}
                    </Badge>
                  </TableCell>

                  {/* 8. Manage Actions */}
                  <TableCell className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(model);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:border-indigo-500/40 hover:bg-indigo-500/10"
                        title="Edit Record"
                        aria-label={`Edit model ${model.name}`}
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(model.id);
                        }}
                        className="h-7 w-7 p-0 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10"
                        title="Delete Record"
                        aria-label={`Delete model ${model.name}`}
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

      <Pagination
        currentPage={currentPage}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />

      {/* Model Live Website Preview Modal */}
      {previewModel && (
        <ModelPreviewModal
          model={previewModel}
          onClose={() => setPreviewModel(null)}
        />
      )}
    </div>
  );
}
