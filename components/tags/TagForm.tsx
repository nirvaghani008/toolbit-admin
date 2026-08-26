'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import KeywordTagInput from '../categories/KeywordTagInput';
import { scrollToError, slugify } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import LoadingOverlay from '../common/LoadingOverlay';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

export interface TagFormProps {
  initialData?: any;
  availableStatuses?: string[];
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
}

export function FormStatusBadge({ status }: { status: string }) {
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

const getInitialTagName = (data: any) => {
  if (!data) return '';
  const raw = data.name || data.tag_name || '';
  return String(raw).replace(/^#+/, '').trim();
};

const getInitialTagSlug = (data: any) => {
  if (!data) return '';
  return String(data.slug || data.tag_url || '').toLowerCase().trim();
};

const getInitialParentTag = (data: any) => {
  if (!data) return '';
  const raw = data.parent_tag || data.parent || '';
  return String(raw).replace(/^#+/, '').trim();
};

export default function TagForm({ initialData, availableStatuses = ['show', 'hide'], onSubmit, onCancel }: TagFormProps) {
  const defaultStatus = initialData?.status || availableStatuses[0] || 'show';
  const [formData, setFormData] = useState({
    name: getInitialTagName(initialData),
    slug: getInitialTagSlug(initialData),
    parent_tag: getInitialParentTag(initialData),
    status: defaultStatus,
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

    const initName = getInitialTagName(initialData);
    const initSlug = getInitialTagSlug(initialData);
    const initParent = getInitialParentTag(initialData);
    const initStatus = initialData.status || defaultStatus;
    const initMetaTitle = initialData.meta_title || '';
    const initMetaDesc = initialData.meta_description || '';
    const initDesc = initialData.description || '';

    return (
      formData.name !== initName ||
      formData.slug !== initSlug ||
      formData.parent_tag !== initParent ||
      formData.status !== initStatus ||
      formData.meta_title !== initMetaTitle ||
      formData.meta_description !== initMetaDesc ||
      formData.description !== initDesc ||
      selectedKeywords.join(',') !== initialKeywords.join(',')
    );
  }, [formData, selectedKeywords, initialData, defaultStatus]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: getInitialTagName(initialData),
        slug: getInitialTagSlug(initialData),
        parent_tag: getInitialParentTag(initialData),
        status: initialData.status || defaultStatus,
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
  }, [initialData, defaultStatus]);

  const validate = () => {
    const tagSchema = z.object({
      name: z.string().trim().min(1, 'Tag name is required'),
      slug: z.string().trim()
        .min(1, 'URL slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, numbers, and hyphens only'),
      meta_title: z.string().trim().max(70, 'Meta title should be under 70 characters').or(z.literal('')),
      meta_description: z.string().trim().max(160, 'Meta description should be under 160 characters').or(z.literal('')),
    });

    const result = tagSchema.safeParse(formData);
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
    const cleanVal = (name === 'name' || name === 'parent_tag') ? value.replace(/^#+/, '') : value;

    setFormData(prev => {
      const nextData = { ...prev, [name]: cleanVal };
      if (name === 'name' && !initialData) {
        nextData.slug = slugify(cleanVal);
      }
      return nextData;
    });

    if (errors[name] || (name === 'name' && errors['slug'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'name') delete newErrs['slug'];
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
      const cleanName = formData.name.trim().replace(/^#+/, '');
      const cleanSlug = formData.slug.trim().toLowerCase();
      const cleanParent = formData.parent_tag.trim().replace(/^#+/, '') || null;

      await onSubmit({
        ...formData,
        name: cleanName,
        slug: cleanSlug,
        parent_tag: cleanParent,
        meta_title: formData.meta_title.trim() || null,
        meta_description: formData.meta_description.trim() || null,
        meta_keywords: selectedKeywords.length > 0 ? selectedKeywords.join(', ') : null,
        description: formData.description.trim() || null,
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
    <form onSubmit={handleSubmit} className="saas-form-compact space-y-8 pb-10">
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {errors.apiError ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.apiError ? (
              <p className="font-semibold uppercase tracking-wide">{errors.apiError}</p>
            ) : (
              <p>
                There are {Object.keys(errors).filter(k => k !== 'submit').length} fields that require your attention:{' '}
                <span className="font-bold uppercase tracking-tight">
                  {Object.keys(errors).filter(k => k !== 'submit').map(key => key.replace(/_/g, ' ')).join(', ')}
                </span>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Tag Details */}
      <CollapsibleSection
        id="tag_details_section"
        title={initialData ? 'Edit Tag' : 'New Tag'}
        description="Configure primary tag identity and organization."
        hasErrors={!!(errors.name || errors.slug)}
        headerActions={<FormStatusBadge status={formData.status} />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>
              Tag Name <span className="saas-label-required">*</span>
            </label>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Generative AI"
              className={errors.name ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              required
              suppressHydrationWarning
            />
            {errors.name && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>
              URL Slug <span className="saas-label-required">*</span>
            </label>
            <Input
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              placeholder="generative-ai"
              className={errors.slug ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              required
              suppressHydrationWarning
            />
            {errors.slug && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.slug}
              </p>
            )}
          </div>

          <div className="space-y-1.5 relative focus-within:z-50">
            <label className={labelClass}>Parent Tag</label>
            <KeywordTagInput
              selectedKeywords={formData.parent_tag ? [formData.parent_tag] : []}
              onKeywordsChange={(val) => setFormData(prev => ({ ...prev, parent_tag: val[0] || '' }))}
              placeholder="Select Parent Tag..."
              type="parent-tag"
              singleSelect={true}
            />
          </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Visibility Status</label>
              <Select
                name="status"
                value={formData.status}
                onChange={(val) => handleChange({ target: { name: 'status', value: val } } as any)}
                className="h-10"
                suppressHydrationWarning
              >
                {Array.from(new Set([...availableStatuses, formData.status].filter(Boolean))).map((st) => (
                  <option key={st} value={st}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
        </div>

        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Description</label>
          <Textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            placeholder="Provide a detailed description for this tag..."
            suppressHydrationWarning
          />
        </div>
      </CollapsibleSection>

      {/* SEO & Metadata */}
      <CollapsibleSection
        id="seo_tag_section"
        title="SEO & Metadata"
        description="Fine-tune how this tag appears in search result rankings."
        hasErrors={!!(errors.meta_title || errors.meta_description)}
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Meta Title</label>
            <Input
              name="meta_title"
              value={formData.meta_title}
              onChange={handleChange}
              placeholder="e.g. Explore Top AI Tags & Categories"
              className={errors.meta_title ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              suppressHydrationWarning
            />
            {errors.meta_title && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.meta_title}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Meta Description</label>
            <Textarea
              name="meta_description"
              value={formData.meta_description}
              onChange={handleChange}
              rows={3}
              placeholder="Describe this tag for search engine indexing..."
              className={errors.meta_description ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              suppressHydrationWarning
            />
            {errors.meta_description && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.meta_description}
              </p>
            )}
          </div>

          <div className="space-y-1.5 relative focus-within:z-40">
            <label className={labelClass}>Meta Keywords</label>
            <KeywordTagInput
              selectedKeywords={selectedKeywords}
              onKeywordsChange={setSelectedKeywords}
              placeholder="Press Enter to add keywords..."
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Form Controls */}
      <div className="saas-action-footer flex items-center justify-end gap-3 pt-6 border-t border-[var(--border-color)]">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-11 px-5 font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="min-w-[140px] h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs active:scale-95 rounded-xl cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin mr-2" />
              Saving...
            </>
          ) : (
            initialData ? 'Update Tag' : 'Create Tag'
          )}
        </Button>
      </div>

      {isSubmitting && <LoadingOverlay message="Synchronizing with database..." />}
    </form>
  );
}
