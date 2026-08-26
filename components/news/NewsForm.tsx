'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { scrollToError } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import KeywordTagInput from '../categories/KeywordTagInput';
import { NewsItem, NEWS_STATUS_OPTIONS, normalizeNewsStatus, getNewsStatusVariant, formatNewsStatus } from './NewsTable';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface NewsFormProps {
  initialData?: NewsItem | null;
  onSubmit?: (data: Partial<NewsItem>) => Promise<void> | void;
  onSave?: (data: Partial<NewsItem>) => Promise<void> | void;
  onCancel?: () => void;
  onClose?: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

export default function NewsForm({
  initialData,
  onSubmit,
  onSave,
  onCancel,
  onClose,
  isLoading = false,
  onBusyChange
}: NewsFormProps) {
  const handleCancel = onCancel || onClose || (() => { });
  const handleSave = onSubmit || onSave || (async () => { });

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    source_name: '',
    source_url: '',
    favicon_url: '',
    published_date: '',
    status: 'published'
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isSubmitting || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        summary: initialData.summary || '',
        source_name: initialData.source_name || '',
        source_url: initialData.source_url || '',
        favicon_url: initialData.favicon_url || '',
        published_date: initialData.published_date ? initialData.published_date.substring(0, 10) : '',
        status: initialData.status || 'published'
      });
      const rawCats = initialData.categories;
      if (Array.isArray(rawCats)) {
        setSelectedCategories(rawCats);
      } else if (typeof rawCats === 'string' && rawCats) {
        try {
          const parsed = JSON.parse(rawCats);
          setSelectedCategories(Array.isArray(parsed) ? parsed : [rawCats]);
        } catch {
          setSelectedCategories((rawCats as string).split(',').map(s => s.trim()).filter(Boolean));
        }
      } else {
        setSelectedCategories([]);
      }
    }
  }, [initialData]);

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    const initialCats = initialData.categories || [];
    const initialPubDate = initialData.published_date ? initialData.published_date.substring(0, 10) : '';

    return (
      formData.title !== (initialData.title || '') ||
      formData.summary !== (initialData.summary || '') ||
      formData.source_name !== (initialData.source_name || '') ||
      formData.source_url !== (initialData.source_url || '') ||
      formData.favicon_url !== (initialData.favicon_url || '') ||
      formData.published_date !== initialPubDate ||
      formData.status !== (initialData.status || 'published') ||
      selectedCategories.join(',') !== initialCats.join(',')
    );
  }, [formData, selectedCategories, initialData]);

  const validate = () => {
    const newsSchema = z.object({
      title: z.string().trim().min(1, 'Title is required'),
      source_name: z.string().trim().min(1, 'Source name is required'),
      source_url: z.string().trim().min(1, 'News URL is required').url('Invalid News URL'),
      published_date: z.string().trim().min(1, 'Published date is required'),
      favicon_url: z.string().trim().url('Invalid favicon URL').or(z.literal(''))
    });

    const result = newsSchema.safeParse(formData);
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        newErrors[path] = issue.message;
      });
    }

    if (selectedCategories.length === 0) {
      newErrors.categories = 'At least one category is required';
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
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        return newErrs;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      setErrors({});

      await handleSave({
        title: formData.title,
        summary: formData.summary || null,
        source_name: formData.source_name || null,
        source_url: formData.source_url || null,
        favicon_url: formData.favicon_url || null,
        published_date: formData.published_date ? new Date(formData.published_date).toISOString() : null,
        status: formData.status,
        categories: selectedCategories
      } as any);
    } catch (err: any) {
      setErrors({ submit: err?.message || 'An error occurred while saving news article.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelClass = "saas-label";

  return (
    <form onSubmit={handleSubmit} noValidate className={`saas-form space-y-8 pb-10 transition-opacity duration-200 ${isBusy ? 'opacity-50 pointer-events-none select-none' : ''}`}>
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {errors.submit ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.submit ? (
              <span className="font-semibold">{errors.submit}</span>
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

      {/* 1. Article Content & Metadata */}
      <CollapsibleSection
        id="news_content_section"
        title={initialData ? 'Edit News Article' : 'New News Article'}
        description="Provide headline, category, source details, summary snippet, links, publication date, and visibility status."
        hasErrors={!!errors.title || !!errors.source_url || !!errors.favicon_url}
        headerActions={
          <Badge variant={getNewsStatusVariant(formData.status)} className="text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider">
            {formatNewsStatus(formData.status)}
          </Badge>
        }
      >
        <div className="space-y-6">
          {/* 1. Title (Full Width) */}
          <div className="space-y-1.5">
            <label className={labelClass}>Title <span className="saas-label-required">*</span></label>
            <Input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. OpenAI releases GPT-4o with real-time audio and vision"
              className={errors.title ? 'saas-input-error' : ''}
              required
            />
            {errors.title && <p className="saas-error-message">{errors.title}</p>}
          </div>

          {/* 2. Categories */}
          <div className="space-y-1.5">
            <label className={labelClass}>Categories <span className="saas-label-required">*</span></label>
            <div className={`relative focus-within:z-50 ${errors.categories ? 'saas-error-wrapper' : ''}`}>
              <KeywordTagInput
                selectedKeywords={selectedCategories}
                onKeywordsChange={(cats) => {
                  setSelectedCategories(cats);
                  if (errors.categories) {
                    setErrors(prev => { const n = { ...prev }; delete n.categories; return n; });
                  }
                }}
                onClearError={() => {
                  if (errors.categories) {
                    setErrors(prev => { const n = { ...prev }; delete n.categories; return n; });
                  }
                }}
                placeholder="Type or select news categories..."
                type="generic"
                name="categories"
              />
            </div>
            {errors.categories && <p className="saas-error-message">{errors.categories}</p>}
          </div>

          {/* 3. Source Name & News URL horizontally */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className={labelClass}>Source Name <span className="saas-label-required">*</span></label>
              <Input
                type="text"
                name="source_name"
                value={formData.source_name}
                onChange={handleChange}
                placeholder="e.g. TechCrunch, Reuters, OpenAI Blog"
                className={errors.source_name ? 'saas-input-error' : ''}
                required
              />
              {errors.source_name && <p className="saas-error-message">{errors.source_name}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>News URL <span className="saas-label-required">*</span></label>
              <Input
                type="url"
                name="source_url"
                value={formData.source_url}
                onChange={handleChange}
                placeholder="https://techcrunch.com/2024/05/13/openai-launches-gpt-4o/"
                className={errors.source_url ? 'saas-input-error' : ''}
                required
              />
              {errors.source_url && <p className="saas-error-message">{errors.source_url}</p>}
            </div>
          </div>

          {/* 4. Summary */}
          <div className="space-y-1.5">
            <label className={labelClass}>Summary</label>
            <Textarea
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              rows={4}
              placeholder="Brief summary or highlight of the news update for cards and preview drawers..."
              className="min-h-[100px]"
            />
          </div>

          {/* 5. Favicon URL */}
          <div className="space-y-1.5">
            <label className={labelClass}>Favicon URL</label>
            <Input
              type="url"
              name="favicon_url"
              value={formData.favicon_url}
              onChange={handleChange}
              placeholder="https://techcrunch.com/favicon.ico"
              className={errors.favicon_url ? 'saas-input-error' : ''}
            />
            {errors.favicon_url && <p className="saas-error-message">{errors.favicon_url}</p>}
          </div>

          {/* 6. Published Date & Status in one line */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className={labelClass}>Published Date <span className="saas-label-required">*</span></label>
              <DateField
                name="published_date"
                value={formData.published_date}
                onChange={(value) => handleChange({ target: { name: 'published_date', value } } as React.ChangeEvent<HTMLInputElement>)}
                error={!!errors.published_date}
                required
              />
              {errors.published_date && <p className="saas-error-message">{errors.published_date}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Status</label>
              <Select
                value={normalizeNewsStatus(formData.status)}
                onChange={(val) => {
                  setFormData(prev => ({ ...prev, status: val }));
                  if (errors.status) {
                    setErrors(prev => { const n = { ...prev }; delete n.status; return n; });
                  }
                }}
              >
                {NEWS_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Form Controls */}
      <div className="saas-action-footer flex items-center justify-end gap-3 pt-6 border-t border-[var(--border-color)]">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
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
              <Spinner size={14} className="mr-1.5 text-current shrink-0" />
              <span>{initialData ? 'Updating News...' : 'Creating News...'}</span>
            </>
          ) : initialData ? (
            'Update News Article'
          ) : (
            'Create News Article'
          )}
        </Button>
      </div>
    </form>
  );
}
