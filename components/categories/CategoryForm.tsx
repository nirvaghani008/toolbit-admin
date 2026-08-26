'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import KeywordTagInput from './KeywordTagInput';
import { scrollToError, slugify } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import LoadingOverlay from '../common/LoadingOverlay';
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
}

function FormStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Show</Badge>;
  }
  if (s === 'hide') {
    return <Badge variant="destructive" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Hide</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="warning" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Draft</Badge>;
  }
  return <Badge variant="slate" className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase">Archived</Badge>;
}

const getInitialCategoryName = (data: any) => {
  if (!data) return '';
  return String(data.name || data.category_name || '').trim();
};

const getInitialCategoryUrl = (data: any) => {
  if (!data) return '';
  return String(data.slug || data.category_url || '').toLowerCase().trim();
};

const getInitialParentCategory = (data: any) => {
  if (!data) return '';
  return String(data.parent || data.parent_category || '').trim();
};

export default function CategoryForm({ initialData, onSubmit, onCancel }: CategoryFormProps) {
  const [formData, setFormData] = useState({
    category_name: getInitialCategoryName(initialData),
    category_url: getInitialCategoryUrl(initialData),
    parent_category: getInitialParentCategory(initialData),
    status: initialData?.status || 'show',
    meta_title: initialData?.meta_title || '',
    meta_description: initialData?.meta_description || '',
    description: initialData?.description || '',
  });

  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(() => {
    if (initialData?.meta_keywords) {
      return typeof initialData.meta_keywords === 'string'
        ? initialData.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
        : Array.isArray(initialData.meta_keywords) ? initialData.meta_keywords : [];
    }
    return [];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    const initialKeywords = typeof initialData.meta_keywords === 'string'
      ? initialData.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
      : Array.isArray(initialData.meta_keywords) ? initialData.meta_keywords : [];

    const initialCategoryName = getInitialCategoryName(initialData);
    const initialCategoryUrl = getInitialCategoryUrl(initialData);
    const initialParentCategory = getInitialParentCategory(initialData);
    const initialStatus = initialData.status || 'show';
    const initialMetaTitle = initialData.meta_title || '';
    const initialMetaDesc = initialData.meta_description || '';
    const initialDesc = initialData.description || '';

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
    if (initialData) {
      setFormData({
        category_name: getInitialCategoryName(initialData),
        category_url: getInitialCategoryUrl(initialData),
        parent_category: getInitialParentCategory(initialData),
        status: initialData.status || 'show',
        meta_title: initialData.meta_title || '',
        meta_description: initialData.meta_description || '',
        description: initialData.description || '',
      });

      if (initialData.meta_keywords) {
        const keywords = typeof initialData.meta_keywords === 'string'
          ? initialData.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          : Array.isArray(initialData.meta_keywords) ? initialData.meta_keywords : [];
        setSelectedKeywords(keywords);
      } else {
        setSelectedKeywords([]);
      }
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
        }
      }}
      className="saas-form space-y-8 pb-10"
    >
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {errors.apiError ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.apiError ? (
              <p className="font-semibold uppercase tracking-wider">{errors.apiError}</p>
            ) : (
              <p>
                There are {Object.keys(errors).filter(k => k !== 'submit' && k !== 'apiError').length} fields that require your attention:{' '}
                <span className="font-bold uppercase tracking-tight">
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
                <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider">
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
                <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider">
                  {errors.category_url}
                </p>
              )}
            </div>

            <div className="space-y-1 relative focus-within:z-50">
              <label className={labelClass}>Parent Category</label>
              <KeywordTagInput
                selectedKeywords={formData.parent_category ? [formData.parent_category] : []}
                onKeywordsChange={(val) => setFormData(prev => ({ ...prev, parent_category: val[0] || '' }))}
                placeholder="Select Parent Category..."
                type="parent-category"
                singleSelect={true}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Visibility Status</label>
              <Select
                name="status"
                value={formData.status}
                onChange={(val) => setFormData(prev => ({ ...prev, status: val }))}
                suppressHydrationWarning
              >
                <option value="show">Show</option>
                <option value="hide">Hide</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
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
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider">
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
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider">
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
          disabled={isSubmitting}
          className="font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs flex items-center gap-2 min-w-[130px]"
        >
          {isSubmitting ? 'Processing...' : (initialData ? 'Update Category' : 'Create Category')}
        </Button>
      </div>

      {isSubmitting && <LoadingOverlay message="Synchronizing with database..." />}
    </form>
  );
}
