'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { z } from 'zod';
import { scrollToError } from '@/lib/form-utils';
import { useDebounce } from '@/lib/hooks/use-debounce';
import CollapsibleSection from '../common/CollapsibleSection';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface AdvertiseFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

export default function AdvertiseForm({ initialData, onSubmit, onCancel, isLoading = false, onBusyChange }: AdvertiseFormProps) {
  const [formData, setFormData] = useState({
    tool_id: '',
    tool_site_url: '',
    featured_type: [] as string[],
    status: 'active',
    order: '' as string | number,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    social_platform: '',
    social_followers: '' as string | number,
    social_share_url: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isSubmitting || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  // Tool search & lookup state from Supabase ai_tools table
  const [toolsList, setToolsList] = useState<any[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isSelectionRef = useRef(false);

  const getToolName = useCallback((tool: any) => {
    if (!tool) return '';
    const info = typeof tool.tool_info === 'string' ? JSON.parse(tool.tool_info || '{}') : (tool.tool_info || {});
    return tool.tool_name || tool.name || info.toolName || info.name || info.tool_name || info.title || `Tool #${tool.tool_id}`;
  }, []);

  const getToolSiteUrl = useCallback((tool: any) => {
    if (!tool) return '';
    const info = typeof tool.tool_info === 'string'
      ? (() => { try { return JSON.parse(tool.tool_info); } catch { return {}; } })()
      : (tool.tool_info || {});

    let siteUrl = tool.tool_site_url ||
                  info.websiteUrl ||
                  info.website_url ||
                  info.importantLinks?.website ||
                  info.url ||
                  info.website ||
                  info.tool_site_url ||
                  tool.website_url ||
                  tool.site_url ||
                  tool.url ||
                  '';

    if (!siteUrl && tool.tool_url && (tool.tool_url.startsWith('http') || tool.tool_url.includes('.'))) {
      siteUrl = tool.tool_url;
    }

    if (siteUrl && typeof siteUrl === 'string' && !siteUrl.startsWith('http') && siteUrl.includes('.')) {
      siteUrl = `https://${siteUrl}`;
    }

    return siteUrl;
  }, []);

  const searchCacheRef = useRef<Record<string, any[]>>({});

  // Fetch tools from Supabase database table
  const fetchTools = useCallback(async (queryStr: string = '') => {
    const rawQ = queryStr.trim().toLowerCase();
    if (!rawQ) {
      setToolsList([]);
      setToolsLoading(false);
      return;
    }

    if (searchCacheRef.current[rawQ]) {
      setToolsList(searchCacheRef.current[rawQ]);
      setToolsLoading(false);
      return;
    }

    setToolsLoading(true);
    try {
      const sanitized = rawQ.replace(/[%_,]/g, '');
      const hyphenated = sanitized.replace(/\s+/g, '-');
      const terms = Array.from(new Set([sanitized, hyphenated].filter(Boolean)));

      const urlFilters = terms.flatMap(t => [
        `tool_url.ilike.%${t}%`,
        `tool_site_url.ilike.%${t}%`
      ]);
      if (/^\d+$/.test(sanitized)) {
        urlFilters.push(`tool_id.eq.${sanitized}`);
      }

      // Execute queries concurrently with selective column payloads
      const selectCols = 'tool_id, tool_url, tool_site_url, favicon_url, tool_info, status, is_paid';

      const [resUrl, resName, resName2] = await Promise.all([
        supabase.from('ai_tools').select(selectCols).or(urlFilters.join(',')).order('tool_id', { ascending: false }).limit(30),
        supabase.from('ai_tools').select(selectCols).ilike('tool_info->>toolName', `%${sanitized}%`).order('tool_id', { ascending: false }).limit(30),
        supabase.from('ai_tools').select(selectCols).ilike('tool_info->>name', `%${sanitized}%`).order('tool_id', { ascending: false }).limit(30)
      ]);

      const allResults = [
        ...(resUrl.data || []),
        ...(resName.data || []),
        ...(resName2.data || [])
      ];

      const seen = new Set<string>();
      const filteredResults = allResults.filter(item => {
        const id = String(item.tool_id || (item as any).id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);

        const name = getToolName(item).toLowerCase();
        const url = (item.tool_site_url || (item as any).tool_url || '').toLowerCase();
        return terms.some(t => name.includes(t) || url.includes(t));
      });

      const getScore = (tool: any) => {
        const name = getToolName(tool).toLowerCase().trim();
        const url = (tool.tool_site_url || tool.tool_url || '').toLowerCase().trim();
        const q = rawQ.trim();

        if (!q) return 0;
        let score = 0;

        if (name === q) score += 1000;
        else if (name.startsWith(q)) score += 800;
        else if (new RegExp(`\\b${q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`).test(name)) score += 600;
        else if (name.includes(q)) score += 400;

        if (url.includes(q)) score += 200;

        return score;
      };

      filteredResults.sort((a, b) => getScore(b) - getScore(a));

      searchCacheRef.current[rawQ] = filteredResults;
      setToolsList(filteredResults);
    } catch (err) {
      console.warn('Error querying tools database:', err);
    } finally {
      setToolsLoading(false);
    }
  }, [getToolName]);

  // Debounce the search term so we only query the database once the user pauses
  // typing, instead of firing a request on every keystroke.
  const debouncedToolSearch = useDebounce(toolSearch, 350);

  // Run the search when the debounced term settles.
  useEffect(() => {
    // Skip the lookup when the value change came from selecting a tool or
    // hydrating initial data (not from the user actively typing).
    if (isSelectionRef.current) {
      isSelectionRef.current = false;
      return;
    }

    const query = debouncedToolSearch.trim();
    if (!query) {
      setToolsList([]);
      return;
    }

    fetchTools(query);
  }, [debouncedToolSearch, fetchTools]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#tool_name_wrapper')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    const initialFeaturedType = Array.isArray(initialData.featured_type) ? initialData.featured_type : (initialData.featured_type ? [initialData.featured_type] : []);
    const initialStartDate = initialData.start_date ? new Date(initialData.start_date).toISOString().split('T')[0] : '';
    const initialEndDate = initialData.end_date ? new Date(initialData.end_date).toISOString().split('T')[0] : '';

    const currentFeaturedType = [...formData.featured_type].sort().join(',');
    const comparisonFeaturedType = [...initialFeaturedType].sort().join(',');

    return (
      formData.tool_id.toString() !== (initialData.tool_id || '').toString() ||
      formData.tool_site_url !== (initialData.tool_site_url || '') ||
      currentFeaturedType !== comparisonFeaturedType ||
      formData.status !== (initialData.status || 'active') ||
      formData.order.toString() !== (initialData?.order ?? initialData?.display_order ?? initialData?.order_index ?? '').toString() ||
      formData.start_date !== initialStartDate ||
      formData.end_date !== initialEndDate ||
      formData.social_platform !== (initialData.social_platform || '') ||
      Number(formData.social_followers) !== (initialData.social_followers || 0) ||
      formData.social_share_url !== (initialData.social_share_url || '')
    );
  }, [formData, initialData]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        tool_id: initialData.tool_id || '',
        tool_site_url: initialData.tool_site_url || '',
        featured_type: Array.isArray(initialData.featured_type) ? initialData.featured_type : (initialData.featured_type ? [initialData.featured_type] : []),
        status: initialData.status || 'active',
        order: initialData.order ?? initialData.display_order ?? initialData.order_index ?? '',
        start_date: initialData.start_date ? new Date(initialData.start_date).toISOString().split('T')[0] : '',
        end_date: initialData.end_date ? new Date(initialData.end_date).toISOString().split('T')[0] : '',
        social_platform: initialData.social_platform || '',
        social_followers: initialData.social_followers ?? '',
        social_share_url: initialData.social_share_url || '',
      });

      const initName = getToolName(initialData);
      if (initName) {
        isSelectionRef.current = true;
        setToolSearch(initName);
      }
    }
  }, [initialData, getToolName]);

  const filteredTools = toolsList;

  const handleSelectTool = (tool: any) => {
    isSelectionRef.current = true;
    const name = getToolName(tool);
    const siteUrl = getToolSiteUrl(tool) || tool.tool_site_url || (tool.tool_url ? (tool.tool_url.startsWith('http') ? tool.tool_url : `https://${tool.tool_url}`) : '');
    setToolSearch(name);
    setFormData(prev => ({
      ...prev,
      tool_id: String(tool.tool_id),
      tool_site_url: initialData ? (prev.tool_site_url || siteUrl) : (siteUrl || prev.tool_site_url)
    }));
    setIsDropdownOpen(false);
    if (errors.tool_id || errors.tool_site_url) {
      setErrors(prev => {
        const n = { ...prev };
        delete n.tool_id;
        delete n.tool_site_url;
        return n;
      });
    }
  };

  const validate = () => {
    const advertiseSchema = z.object({
      tool_id: z.union([z.string(), z.number()]).refine(val => {
        return String(val).trim().length > 0;
      }, 'Tool selection is required'),
      tool_site_url: z.string().trim().min(1, 'Tool site url is required'),
      start_date: z.string().trim().min(1, 'Start date is required'),
      end_date: z.string().trim().min(1, 'End date is required'),
      featured_type: z.array(z.string()).min(1, 'At least one placement type is required'),
    });

    const result = advertiseSchema.safeParse(formData);
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        newErrors[path] = issue.message;
      });
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToError(newErrors);
      return false;
    }
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
    }
  };

  const handleCheckboxChange = (type: string) => {
    setFormData(prev => {
      const current = prev.featured_type;
      const next = current.includes(type)
        ? current.filter(t => t !== type)
        : [...current, type];
      return { ...prev, featured_type: next };
    });
    if (errors.featured_type) {
      setErrors(prev => {
        const n = { ...prev };
        delete n.featured_type;
        return n;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const toNull = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string' && val.trim() === '') return null;
        if (Array.isArray(val) && val.length === 0) return null;
        return val;
      };

      await onSubmit({
        tool_id: toNull(formData.tool_id) ? parseInt(formData.tool_id.toString()) : null,
        tool_site_url: toNull(formData.tool_site_url),
        featured_type: toNull(formData.featured_type),
        status: formData.status,
        display_order: toNull(formData.order) ? parseInt(formData.order.toString()) : 0,
        start_date: toNull(formData.start_date),
        end_date: toNull(formData.end_date),
        social_platform: toNull(formData.social_platform),
        social_followers: toNull(formData.social_followers) ? parseInt(formData.social_followers.toString()) : 0,
        social_share_url: toNull(formData.social_share_url),
        ...(initialData ? {} : { created_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrors({ submit: err.message || 'An error occurred during submission' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'secondary' => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'inactive') return 'warning';
    if (s === 'expired') return 'destructive';
    return 'secondary';
  };

  const labelClass = "saas-label";

  return (
    <form onSubmit={handleSubmit} noValidate className={`saas-form space-y-8 pb-10 transition-opacity duration-200 ${isBusy ? 'opacity-50 pointer-events-none select-none' : ''}`}>
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-bold">
            {errors.submit ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.submit ? (
              <span className="font-bold">{errors.submit}</span>
            ) : (
              <span>
                There are {Object.keys(errors).filter(k => k !== 'submit').length} fields that require your attention:
                <span className="font-bold ml-1">
                  {Object.keys(errors).filter(k => k !== 'submit').map(key => key.replace(/_/g, ' ')).join(', ')}
                </span>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Core Promotion Identity */}
      <CollapsibleSection
        id="core_promotion_section"
        title="Core Promotion"
        description="Select the existing tool and its primary website URL."
        hasErrors={!!(errors.tool_id || errors.tool_site_url)}
        className={`relative ${isDropdownOpen ? 'z-30' : 'z-10'}`}
        headerActions={
          <Badge
            variant={getStatusBadgeVariant(formData.status)}
            className="px-3 py-0.5 text-[10px] font-black uppercase tracking-widest"
          >
            {formData.status}
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tool Name Dropdown Search */}
          <div className="space-y-1 relative" id="tool_name_wrapper">
            <label className={labelClass}>Tool Name <span className="saas-label-required">*</span></label>
            <div className="relative">
              <Input
                type="text"
                value={toolSearch}
                onChange={(e) => {
                  isSelectionRef.current = false;
                  const val = e.target.value;
                  setToolSearch(val);
                  if (val.trim().length > 0) {
                    setIsDropdownOpen(true);
                    setToolsLoading(true);
                  } else {
                    setIsDropdownOpen(false);
                    setToolsLoading(false);
                    setToolsList([]);
                  }
                }}
                className={errors.tool_id ? 'saas-input-error' : ''}
                placeholder="Search and select tool from database..."
                required
                suppressHydrationWarning
              />
            </div>

            {/* Tool Selection Dropdown */}
            {isDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl custom-scrollbar p-0 overflow-hidden">
                {toolsLoading ? (
                  <div className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)] animate-pulse text-center flex items-center justify-center gap-2">
                    <Spinner size={14} className="text-zinc-600 dark:text-zinc-400" /> Searching tools...
                  </div>
                ) : filteredTools.length > 0 ? (
                  filteredTools.map((t) => (
                    <div
                      key={t.tool_id}
                      onClick={() => handleSelectTool(t)}
                      className={`w-full px-4 py-3 border-b border-[var(--border-color)]/30 last:border-b-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold cursor-pointer flex items-center justify-between transition-colors ${
                        String(formData.tool_id) === String(t.tool_id)
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-xs">{getToolName(t)}</span>
                        {getToolSiteUrl(t) && (
                          <span className="text-[10px] text-[var(--text-muted)] font-normal truncate max-w-[280px]">{getToolSiteUrl(t)}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-3 text-xs text-[var(--text-muted)] font-semibold text-center">
                    No tools found matching &quot;{toolSearch.trim()}&quot;
                  </div>
                )}
              </div>
            )}

            {errors.tool_id && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.tool_id}
              </p>
            )}
          </div>

          {/* Tool Site URL */}
          <div className="space-y-1">
            <label className={labelClass}>Tool Site URL <span className="saas-label-required">*</span></label>
            <Input
              name="tool_site_url"
              value={formData.tool_site_url}
              onChange={handleChange}
              className={errors.tool_site_url ? 'saas-input-error' : ''}
              placeholder="https://toolbit.ai"
              required
              suppressHydrationWarning
            />
            {errors.tool_site_url && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.tool_site_url}
              </p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Placement & Scheduling */}
      <CollapsibleSection
        id="placement_schedule_section"
        title="Placement & Schedule"
        description="Define campaign start/end dates, status, order, and placement type."
        hasErrors={!!(errors.featured_type || errors.start_date || errors.end_date)}
        className="relative z-0"
      >
        <div className="space-y-6">
          {/* Row 1: Start Date and End Date (50% width each) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Start Date <span className="saas-label-required">*</span></label>
              <DateField
                name="start_date"
                value={formData.start_date}
                onChange={(value) => handleChange({ target: { name: 'start_date', value } } as React.ChangeEvent<HTMLInputElement>)}
                error={!!errors.start_date}
                required
              />
              {errors.start_date && (
                <p className="saas-error-message">
                  <AlertTriangle size={11} /> {errors.start_date}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>End Date <span className="saas-label-required">*</span></label>
              <DateField
                name="end_date"
                value={formData.end_date}
                onChange={(value) => handleChange({ target: { name: 'end_date', value } } as React.ChangeEvent<HTMLInputElement>)}
                error={!!errors.end_date}
                required
              />
              {errors.end_date && (
                <p className="saas-error-message">
                  <AlertTriangle size={11} /> {errors.end_date}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Status and Order (50% width each) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Status</label>
              <Select
                name="status"
                value={formData.status}
                onChange={(val) => handleChange({ target: { name: 'status', value: val } } as any)}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'expired', label: 'Expired' },
                ]}
                className="h-10 font-semibold"
                suppressHydrationWarning
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Display Order</label>
              <Input
                name="order"
                type="number"
                value={formData.order}
                onChange={handleChange}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                placeholder="0"
                suppressHydrationWarning
              />
            </div>
          </div>

          {/* Row 3: Placement Type */}
          <div className="space-y-2" id="featured_type" data-field="featured_type">
            <label className={labelClass}>Placement Type <span className="saas-label-required">*</span></label>
            <div className="flex flex-wrap items-center gap-6 py-2">
              {[
                { id: 'home', label: 'Home' },
                { id: 'sidebar', label: 'Sidebar' },
                { id: 'banner', label: 'Banner' }
              ].map((option) => (
                <label key={option.id} className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={formData.featured_type.includes(option.id)}
                      onChange={() => handleCheckboxChange(option.id)}
                      className="peer appearance-none w-5 h-5 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] checked:bg-zinc-900 checked:border-zinc-900 dark:checked:bg-zinc-100 dark:checked:border-zinc-100 transition-all cursor-pointer"
                    />
                    <svg
                      className="absolute w-3 h-3 text-white dark:text-zinc-900 opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className={`text-[11px] font-bold uppercase tracking-widest transition-colors ${formData.featured_type.includes(option.id) ? 'text-[var(--text-primary)] font-black' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
            {errors.featured_type && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.featured_type}
              </p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Social Proof & Authority */}
      <CollapsibleSection
        id="social_proof_section"
        title="Social Proof"
        description="Optional metrics to build promotion authority."
        hasErrors={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className={labelClass}>Social Platform</label>
            <Input
              name="social_platform"
              value={formData.social_platform}
              onChange={handleChange}
              placeholder="e.g. twitter"
              suppressHydrationWarning
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Social Followers</label>
            <Input
              name="social_followers"
              type="number"
              value={formData.social_followers}
              onChange={handleChange}
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              placeholder="0"
              suppressHydrationWarning
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className={labelClass}>Social Share URL</label>
            <Input
              name="social_share_url"
              value={formData.social_share_url}
              onChange={handleChange}
              placeholder="https://twitter.com/post/..."
              suppressHydrationWarning
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Form Actions */}
      <div className="saas-action-footer">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isBusy}
          className="h-10 px-5 font-bold text-xs rounded-xl border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isDirty || isBusy}
          className="h-10 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold text-xs rounded-xl shadow-xs active:scale-95 cursor-pointer"
        >
          {isBusy ? (
            <span className="flex items-center gap-2">
              <Spinner size={14} className="text-current shrink-0" />
              <span>{initialData ? 'Updating...' : 'Creating...'}</span>
            </span>
          ) : (
            initialData ? 'Update Advertise Tool' : 'Create Advertise Placement'
          )}
        </Button>
      </div>
    </form>
  );
}
