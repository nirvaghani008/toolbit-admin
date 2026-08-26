'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import KeywordTagInput from './KeywordTagInput';
import { scrollToError, slugify } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface CategoryFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

function FormStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success" className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">Show</Badge>;
  }
  return <Badge variant="slate" className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">Hide</Badge>;
}

const extractData = (data: any) => {
  if (!data) return null;
  if (data.category && typeof data.category === 'object') return data.category;
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
};

const getInitialCategoryName = (data: any) => {
  const raw = extractData(data);
  if (!raw) return '';
  const val = raw.name ?? raw.category_name ?? raw.title ?? '';
  return String(val).trim();
};

const getInitialCategoryUrl = (data: any) => {
  const raw = extractData(data);
  if (!raw) return '';
  const val = raw.slug ?? raw.category_url ?? raw.url ?? '';
  return String(val).toLowerCase().trim();
};

const getInitialParentCategory = (data: any) => {
  const raw = extractData(data);
  if (!raw) return '';
  const val = raw.parent ?? raw.parent_category ?? raw.parentCategory ?? '';
  return String(val).trim();
};

const getInitialStatus = (data: any) => {
  const raw = extractData(data);
  if (!raw?.status) return 'hide';
  const s = String(raw.status).toLowerCase().trim();
  return s === 'show' ? 'show' : 'hide';
};

export default function CategoryForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  onBusyChange,
}: CategoryFormProps) {
  const [formData, setFormData] = useState(() => {
    const raw = extractData(initialData);
    return {
      category_name: getInitialCategoryName(raw),
      category_url: getInitialCategoryUrl(raw),
      parent_category: getInitialParentCategory(raw),
      status: getInitialStatus(raw),
      meta_title: raw?.meta_title ?? raw?.metaTitle ?? '',
      meta_description: raw?.meta_description ?? raw?.metaDescription ?? '',
      description: raw?.description ?? raw?.category_description ?? '',
    };
  });

  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(() => {
    const raw = extractData(initialData);
    const kw = raw?.meta_keywords ?? raw?.metaKeywords;
    if (kw) {
      return typeof kw === 'string'
        ? kw.split(',').map((k: string) => k.trim()).filter(Boolean)
        : Array.isArray(kw) ? kw : [];
    }
    return [];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isSubmitting || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const isDirty = useMemo(() => {
    const raw = extractData(initialData);
    if (!raw) {
      return !!(
        formData.category_name ||
        formData.category_url ||
        formData.parent_category ||
        formData.meta_title ||
        formData.meta_description ||
        formData.description ||
        selectedKeywords.length > 0
      );
    }
    const kw = raw.meta_keywords ?? raw.metaKeywords;
    const initialKeywords = typeof kw === 'string'
      ? kw.split(',').map((k: string) => k.trim()).filter(Boolean)
      : Array.isArray(kw) ? kw : [];

    const initialCategoryName = getInitialCategoryName(raw);
    const initialCategoryUrl = getInitialCategoryUrl(raw);
    const initialParentCategory = getInitialParentCategory(raw);
    const initialStatus = getInitialStatus(raw);
    const initialMetaTitle = raw.meta_title ?? raw.metaTitle ?? '';
    const initialMetaDesc = raw.meta_description ?? raw.metaDescription ?? '';
    const initialDesc = raw.description ?? raw.category_description ?? '';

    return (
      formData.category_name !== initialCategoryName ||
      formData.category_url !== initialCategoryUrl ||
      formData.parent_category !== initialParentCategory ||
      formData.status !== initialStatus ||
      formData.meta_title !== initialMetaTitle ||
      formData.meta_description !== initialMetaDesc ||
      formData.description !== initialDesc ||
      selectedKeywords.join(',') !== initialKeywords.join(',')
    );
  }, [formData, selectedKeywords, initialData]);

  useEffect(() => {
    const raw = extractData(initialData);
    if (raw) {
      setFormData({
        category_name: getInitialCategoryName(raw),
        category_url: getInitialCategoryUrl(raw),
        parent_category: getInitialParentCategory(raw),
        status: getInitialStatus(raw),
        meta_title: raw.meta_title ?? raw.metaTitle ?? '',
        meta_description: raw.meta_description ?? raw.metaDescription ?? '',
        description: raw.description ?? raw.category_description ?? '',
      });

      const kw = raw.meta_keywords ?? raw.metaKeywords;
      if (kw) {
        const keywords = typeof kw === 'string'
          ? kw.split(',').map((k: string) => k.trim()).filter(Boolean)
          : Array.isArray(kw) ? kw : [];
        setSelectedKeywords(keywords);
      } else {
        setSelectedKeywords([]);
      }
    } else {
      setFormData({
        category_name: '',
        category_url: '',
        parent_category: '',
        status: 'hide',
        meta_title: '',
        meta_description: '',
        description: '',
      });
      setSelectedKeywords([]);
    }
  }, [initialData]);

  const validate = () => {
    const categorySchema = z.object({
      category_name: z.string().trim().min(1, 'Category name is required'),
      category_url: z.string().trim()
        .min(1, 'URL slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, numbers, and hyphens only'),
      meta_title: z.string().trim().max(70, 'Meta title should be under 70 characters').or(z.literal('')),
      meta_description: z.string().trim().max(160, 'Meta description should be under 160 characters').or(z.literal('')),
    });

    const result = categorySchema.safeParse(formData);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'category_name' && !initialData) {
        nextData.category_url = slugify(value);
      }
      return nextData;
    });
    // Clear error when user starts typing
    if (errors[name] || (name === 'category_name' && errors['category_url'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'category_name') delete newErrs['category_url'];
        return newErrs;
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
      setErrors({});
      await onSubmit({
        ...formData,
        name: formData.category_name.trim(),
        slug: formData.category_url.trim(),
        parent: formData.parent_category.trim() || null,
        meta_keywords: selectedKeywords.length > 0 ? selectedKeywords.join(', ') : null,
        ...(initialData ? {} : { created_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      setErrors({ apiError: err.message || 'An error occurred while saving.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelClass = "saas-label";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
        }
      }}
      className={`saas-form space-y-8 pb-10 transition-opacity duration-200 ${isBusy ? 'opacity-50 pointer-events-none select-none' : ''}`}
    >
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {errors.apiError ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.apiError ? (
              <p className="font-semibold">{errors.apiError}</p>
            ) : (
              <p>
                There are {Object.keys(errors).filter(k => k !== 'submit' && k !== 'apiError').length} fields that require your attention:{' '}
                <span className="font-bold ml-1">
                  {Object.keys(errors).filter(k => k !== 'submit' && k !== 'apiError').map(key => key.replace(/_/g, ' ')).join(', ')}
                </span>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Section */}
      <CollapsibleSection
        id="main_category_section"
        title={initialData ? 'Edit Category' : 'New Category'}
        description="Define core identity and categorization rules."
        hasErrors={!!(errors.category_name || errors.category_url)}
        headerActions={<FormStatusBadge status={formData.status} />}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>
                Category Name <span className="saas-label-required">*</span>
              </label>
              <Input
                name="category_name"
                value={formData.category_name}
                onChange={handleChange}
                placeholder="e.g. Image Generation"
                className={errors.category_name ? 'saas-input-error' : ''}
                required
                suppressHydrationWarning
              />
              {errors.category_name && (
                <p className="saas-error-message">
                  {errors.category_name}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className={labelClass}>
                URL Slug <span className="saas-label-required">*</span>
              </label>
              <Input
                name="category_url"
                value={formData.category_url}
                onChange={handleChange}
                placeholder="image-generation"
                className={`font-mono text-sm ${errors.category_url ? 'saas-input-error' : ''}`}
                required
                suppressHydrationWarning
              />
              {errors.category_url && (
                <p className="saas-error-message">
                  {errors.category_url}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Parent Category</label>
              <div className={`relative focus-within:z-50 ${errors.parent_category ? 'saas-error-wrapper' : ''}`}>
                <KeywordTagInput
                  selectedKeywords={formData.parent_category ? [formData.parent_category] : []}
                  onKeywordsChange={(val) => {
                    setFormData(prev => ({ ...prev, parent_category: val[0] || '' }));
                    if (errors.parent_category) {
                      setErrors(prev => { const n = { ...prev }; delete n.parent_category; return n; });
                    }
                  }}
                  onClearError={() => {
                    if (errors.parent_category) {
                      setErrors(prev => { const n = { ...prev }; delete n.parent_category; return n; });
                    }
                  }}
                  placeholder="Select Parent Category..."
                  type="parent-category"
                  singleSelect={true}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Visibility Status</label>
              <Select
                name="status"
                value={formData.status}
                onChange={(val) => {
                  setFormData(prev => ({ ...prev, status: val }));
                  if (errors.status) {
                    setErrors(prev => { const n = { ...prev }; delete n.status; return n; });
                  }
                }}
                suppressHydrationWarning
              >
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <label className={labelClass}>Description</label>
            <Textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Detailed categorization description..."
              className={errors.description ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* SEO Section */}
      <CollapsibleSection
        id="seo_category_section"
        title="Search Optimization"
        description="Control how this category appears in search engines."
        hasErrors={!!(errors.meta_title || errors.meta_description)}
      >
        <div className="space-y-6">
          <div className="space-y-1">
            <label className={labelClass}>Meta Title</label>
            <Input
              name="meta_title"
              value={formData.meta_title}
              onChange={handleChange}
              placeholder="e.g. Best AI Tools for Category Name"
              className={errors.meta_title ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.meta_title && (
              <p className="saas-error-message">
                {errors.meta_title}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Meta Description</label>
            <Textarea
              name="meta_description"
              value={formData.meta_description}
              onChange={handleChange}
              rows={3}
              placeholder="Compelling search result snippet..."
              className={errors.meta_description ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.meta_description && (
              <p className="saas-error-message">
                {errors.meta_description}
              </p>
            )}
          </div>

          <div className="space-y-1 relative focus-within:z-40">
            <label className={labelClass}>Meta Keywords</label>
            <KeywordTagInput
              selectedKeywords={selectedKeywords}
              onKeywordsChange={setSelectedKeywords}
              placeholder="Type keyword and press Enter..."
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Form Actions */}
      <div className="saas-action-footer flex items-center justify-end gap-3 pt-6 border-t border-[var(--border-color)]">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isBusy}
          className="font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isDirty || isBusy}
          className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs flex items-center gap-2 min-w-[130px]"
        >
          {isBusy ? (
            <>
              <Spinner size={16} className="text-current shrink-0" />
              <span>{initialData ? 'Updating Category...' : 'Creating Category...'}</span>
            </>
          ) : (
            initialData ? 'Update Category' : 'Create Category'
          )}
        </Button>
      </div>
    </form>
  );
}
