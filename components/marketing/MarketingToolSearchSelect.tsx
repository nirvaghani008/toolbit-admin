'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  ExternalLink,
  Sparkles,
  X,
  Check,
  Globe,
  Link as LinkIcon,
  RotateCcw,
  Edit2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { searchAdminToolsAction, type SearchableToolItem } from '@/app/admin/marketing/actions';

// LocalStorage cache configuration matching toolbit architecture
const ADMIN_TOOLS_CACHE_KEY = 'toolbit_admin_search_tools';
const ADMIN_TOOLS_UPDATED_KEY = 'toolbit_admin_search_tools_updated';
const FRONTEND_TOOLS_KEY = 'toolbit_search_tools';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface MarketingToolSearchSelectProps {
  token: string;
  value: string;
  siteUrl?: string;
  onSelectTool: (tool: {
    name: string;
    slug: string;
    site_url: string;
    favicon_url?: string | null;
  }) => void;
  onChangeToolName: (name: string) => void;
  onChangeSiteUrl: (url: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function MarketingToolSearchSelect({
  token,
  value,
  siteUrl = '',
  onSelectTool,
  onChangeToolName,
  onChangeSiteUrl,
  onClear,
  disabled = false,
}: MarketingToolSearchSelectProps) {
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toolsList, setToolsList] = useState<SearchableToolItem[]>([]);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(siteUrl || '');

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelectionRef = useRef(false);

  // Sync external value with local query
  useEffect(() => {
    if (!isSelectionRef.current && value !== query) {
      setQuery(value || '');
    }
    isSelectionRef.current = false;
  }, [value]);

  // Sync external siteUrl with customUrlInput
  useEffect(() => {
    setCustomUrlInput(siteUrl || '');
  }, [siteUrl]);

  // ── 1. LocalStorage Management: Read & Cache Tools ──
  const loadCachedTools = useCallback((): SearchableToolItem[] => {
    if (typeof window === 'undefined') return [];

    try {
      // 1A. Check Admin tools cache first
      const cached = localStorage.getItem(ADMIN_TOOLS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }

      // 1B. Fallback: Check if website-frontend search data exists in localStorage
      const frontendData = localStorage.getItem(FRONTEND_TOOLS_KEY);
      if (frontendData) {
        const parsed = JSON.parse(frontendData);
        if (parsed?.names && parsed?.urls && Array.isArray(parsed.names)) {
          const mapped: SearchableToolItem[] = parsed.names.map((name: string, i: number) => ({
            id: i + 1,
            name,
            slug: parsed.urls[i] || '',
            site_url: '',
            favicon_url: null,
          }));
          return mapped;
        }
      }
    } catch (e) {
      console.warn('Error reading tools from localStorage:', e);
    }
    return [];
  }, []);

  const saveCachedTools = useCallback((items: SearchableToolItem[]) => {
    if (typeof window === 'undefined' || items.length === 0) return;
    try {
      localStorage.setItem(ADMIN_TOOLS_CACHE_KEY, JSON.stringify(items));
      localStorage.setItem(ADMIN_TOOLS_UPDATED_KEY, Date.now().toString());
    } catch (e) {
      console.warn('Error writing tools to localStorage:', e);
    }
  }, []);

  // Initialize tool cache on mount
  useEffect(() => {
    const local = loadCachedTools();
    if (local.length > 0) {
      setToolsList(local);
    }

    // Check if cache is stale or empty
    const lastUpdated = typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOOLS_UPDATED_KEY) : null;
    const isStale = !lastUpdated || Date.now() - parseInt(lastUpdated, 10) > CACHE_TTL_MS;

    if ((local.length === 0 || isStale) && token) {
      void (async () => {
        try {
          const res = await searchAdminToolsAction(token);
          if (res.success && res.data && res.data.length > 0) {
            setToolsList(res.data);
            saveCachedTools(res.data);
          }
        } catch (e) {
          console.warn('Background tools prefetch failed:', e);
        }
      })();
    }
  }, [token, loadCachedTools, saveCachedTools]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── 2. Real-time Fuzzy / In-Memory Filter ──
  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toolsList.slice(0, 10);

    const matches = toolsList.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const slug = (t.slug || '').toLowerCase();
      const url = (t.site_url || '').toLowerCase();
      return name.includes(q) || slug.includes(q) || url.includes(q);
    });

    // Score sort: exact match > startsWith > contains
    matches.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      if (aName === q) return -1;
      if (bName === q) return 1;
      if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
      if (!aName.startsWith(q) && bName.startsWith(q)) return 1;
      return 0;
    });

    return matches.slice(0, 12);
  }, [query, toolsList]);

  // ── 3. Debounced Server Search fallback ──
  const executeServerSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm || searchTerm.length < 2 || !token) return;
      setIsLoading(true);
      try {
        const res = await searchAdminToolsAction(token, searchTerm);
        if (res.success && res.data) {
          // Merge with current list and persist
          setToolsList((prev) => {
            const map = new Map<number, SearchableToolItem>();
            prev.forEach((t) => map.set(t.id, t));
            res.data?.forEach((t) => map.set(t.id, t));
            const merged = Array.from(map.values());
            saveCachedTools(merged);
            return merged;
          });
        }
      } catch (err) {
        console.warn('Server tool search failed:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [token, saveCachedTools]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChangeToolName(val);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (val.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        void executeServerSearch(val.trim());
      }, 350);
    }
  };

  const handleSelectToolItem = (tool: SearchableToolItem) => {
    isSelectionRef.current = true;
    setQuery(tool.name);
    setCustomUrlInput(tool.site_url || '');
    setIsOpen(false);
    setIsEditingUrl(false);

    onSelectTool({
      name: tool.name,
      slug: tool.slug,
      site_url: tool.site_url || (tool.slug ? `https://www.toolbit.ai/ai-tool/${tool.slug}` : ''),
      favicon_url: tool.favicon_url,
    });
  };

  const handleApplyCustomUrl = () => {
    const trimmed = customUrlInput.trim();
    let formatted = trimmed;
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      formatted = `https://${trimmed}`;
    }
    onChangeSiteUrl(formatted);
    setIsEditingUrl(false);
  };

  const handleClearAll = () => {
    setQuery('');
    setCustomUrlInput('');
    setIsEditingUrl(false);
    setIsOpen(false);
    onClear();
  };

  const hasLinkedSiteUrl = Boolean(siteUrl && siteUrl.trim().length > 0);

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Label and Helper Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <span>Tool Name</span>
          <span className="text-[10px] text-[#0d9488] font-semibold bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800">
            Clickable in Email
          </span>
        </label>
        <code className="text-[10px] text-zinc-500 font-mono">
          {"{{tool_name}}"}
        </code>
      </div>

      {/* Main Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
          <Search size={14} />
        </div>

        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="Search and select tool (e.g. ChatGPT, Midjourney)..."
          disabled={disabled}
          className="pl-9 pr-8 h-9 text-xs"
        />

        {isLoading ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size={14} className="text-[#0d9488]" />
          </div>
        ) : query ? (
          <button
            type="button"
            onClick={handleClearAll}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded cursor-pointer"
            title="Clear tool"
          >
            <X size={13} />
          </button>
        ) : null}

        {/* Dropdown Results Menu */}
        {isOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl ring-1 ring-black/5 p-1.5 overflow-hidden animate-in fade-in-50 duration-150">
            <div className="max-h-[260px] overflow-y-auto space-y-0.5 custom-scrollbar">
              {filteredTools.length > 0 ? (
                filteredTools.map((t) => {
                  const isSelected =
                    (t.name || '').toLowerCase() === query.trim().toLowerCase();
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectToolItem(t)}
                      className={`group w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-lg transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 font-semibold'
                          : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {t.favicon_url ? (
                          <img
                            src={t.favicon_url}
                            alt=""
                            className="w-4 h-4 rounded shrink-0 object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <span className="font-semibold text-xs truncate block">
                            {t.name}
                          </span>
                          {t.site_url ? (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate block font-mono">
                              {t.site_url.replace(/^https?:\/\/(www\.)?/, '')}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.slug && (
                          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-700/50">
                            /ai-tool/{t.slug}
                          </span>
                        )}
                        {isSelected && (
                          <Check size={13} className="text-[#0d9488]" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-center space-y-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    No directory tool found matching &ldquo;{query}&rdquo;
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    You can still use this as a custom tool name.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Linked Tool Website URL Indicator & Edit Bar */}
      {query.trim().length > 0 && (
        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-2.5 text-xs transition-all animate-in fade-in-50 duration-150">
          {!isEditingUrl ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <LinkIcon size={13} className="text-[#0d9488] shrink-0" />
                <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                  Target Website URL:
                </span>
                {hasLinkedSiteUrl ? (
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#0d9488] hover:underline flex items-center gap-1 truncate max-w-[280px]"
                    title={siteUrl}
                  >
                    <span className="truncate">{siteUrl}</span>
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-zinc-400 italic">No URL linked yet</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingUrl(true)}
                  className="h-6 px-2 text-[11px] text-zinc-600 dark:text-zinc-300 gap-1 cursor-pointer"
                >
                  <Edit2 size={11} />
                  {hasLinkedSiteUrl ? 'Change URL' : 'Add URL'}
                </Button>
                {hasLinkedSiteUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChangeSiteUrl('')}
                    className="h-6 px-1.5 text-[11px] text-zinc-400 hover:text-rose-500 cursor-pointer"
                    title="Remove linked URL"
                  >
                    <X size={12} />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Set Tool Website URL (Passed as Clickable Link in Email)
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingUrl(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                    <Globe size={13} />
                  </div>
                  <Input
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://example.com"
                    className="pl-8 h-8 text-xs font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCustomUrl();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyCustomUrl}
                  className="h-8 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer px-3"
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          <div className="mt-1.5 pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/50 text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Sparkles size={11} className="text-[#0d9488]" />
            <span>
              In your email, <strong>{query || '{{tool_name}}'}</strong> will automatically be rendered as a clickable link leading to this URL.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
