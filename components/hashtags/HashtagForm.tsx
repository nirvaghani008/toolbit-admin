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

interface HashtagFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
}

function FormStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'show') {
    return <Badge variant="success">Show</Badge>;
  }
  if (s === 'hide') {
    return <Badge variant="destructive">Hide</Badge>;
  }
  if (s === 'draft') {
    return <Badge variant="warning">Draft</Badge>;
  }
  return <Badge variant="slate">Archived</Badge>;
}

export default function HashtagForm({ initialData, onSubmit, onCancel }: HashtagFormProps) {
  const [formData, setFormData] = useState({
    hashtag_name: '',
    hashtag_url: '',
    parent_hashtag: '',
    status: 'draft', // Default for NEW records
    meta_title: '',
    meta_description: '',
    description: '',
  });

  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    const initialKeywords = typeof initialData.meta_keywords === 'string'
      ? initialData.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
      : [];

    return (
      formData.hashtag_name !== (initialData.hashtag_name || '') ||
      formData.hashtag_url !== (initialData.hashtag_url || '') ||
      formData.parent_hashtag !== (initialData.parent_hashtag || '') ||
      formData.status !== (initialData.status || 'draft') ||
      formData.meta_title !== (initialData.meta_title || '') ||
      formData.meta_description !== (initialData.meta_description || '') ||
      formData.description !== (initialData.description || '') ||
      selectedKeywords.join(',') !== initialKeywords.join(',')
    );
  }, [formData, selectedKeywords, initialData]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        hashtag_name: initialData.hashtag_name || '',
        hashtag_url: initialData.hashtag_url || '',
        parent_hashtag: initialData.parent_hashtag || '',
        status: initialData.status || 'draft', // Preserve existing status
        meta_title: initialData.meta_title || '',
        meta_description: initialData.meta_description || '',
        description: initialData.description || '',
      });

      if (initialData.meta_keywords) {
        const keywords = typeof initialData.meta_keywords === 'string'
          ? initialData.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          : [];
        setSelectedKeywords(keywords);
      } else {
        setSelectedKeywords([]);
      }
    }
  }, [initialData]);

  const validate = () => {
    const hashtagSchema = z.object({
      hashtag_name: z.string().trim()
        .min(1, 'Hashtag name is required')
        .refine(val => val.startsWith('#'), 'Hashtag name must start with #'),
      hashtag_url: z.string().trim()
        .min(1, 'URL slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, numbers, and hyphens only'),
      meta_title: z.string().trim().max(70, 'Meta title should be under 70 characters').or(z.literal('')),
      meta_description: z.string().trim().max(160, 'Meta description should be under 160 characters').or(z.literal('')),
    });

    const result = hashtagSchema.safeParse(formData);
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
      if (name === 'hashtag_name') {
        nextData.hashtag_url = slugify(value);
      }
      return nextData;
    });
    if (errors[name] || (name === 'hashtag_name' && errors['hashtag_url'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'hashtag_name') delete newErrs['hashtag_url'];
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
        meta_keywords: selectedKeywords.join(', '),
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

      {/* Hashtag Details */}
      <CollapsibleSection
        id="hashtag_details_section"
        title={initialData ? 'Edit Hashtag' : 'New Hashtag'}
        description="Configure primary hashtag identity and organization."
        hasErrors={!!(errors.hashtag_name || errors.hashtag_url)}
        headerActions={<FormStatusBadge status={formData.status} />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>
              Hashtag Name <span className="saas-label-required">*</span>
            </label>
            <Input
              name="hashtag_name"
              value={formData.hashtag_name}
              onChange={handleChange}
              placeholder="e.g. #GenerativeAI"
              className={errors.hashtag_name ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              required
              suppressHydrationWarning
            />
            {errors.hashtag_name && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.hashtag_name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>
              URL Slug <span className="saas-label-required">*</span>
            </label>
            <Input
              name="hashtag_url"
              value={formData.hashtag_url}
              onChange={handleChange}
              placeholder="generative-ai"
              className={errors.hashtag_url ? 'border-rose-500 ring-2 ring-rose-500/20' : ''}
              required
              suppressHydrationWarning
            />
            {errors.hashtag_url && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.hashtag_url}
              </p>
            )}
          </div>

          <div className="space-y-1.5 relative focus-within:z-50">
            <label className={labelClass}>Parent Hashtag</label>
            <KeywordTagInput
              selectedKeywords={formData.parent_hashtag ? [formData.parent_hashtag] : []}
              onKeywordsChange={(val) => setFormData(prev => ({ ...prev, parent_hashtag: val[0] || '' }))}
              placeholder="Select Parent Hashtag..."
              type="parent-hashtag"
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
              <option value="show">Show</option>
              <option value="hide">Hide</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
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
            placeholder="Provide a detailed description for this hashtag..."
            suppressHydrationWarning
          />
        </div>
      </CollapsibleSection>

      {/* SEO & Metadata */}
      <CollapsibleSection
        id="seo_hashtag_section"
        title="SEO & Metadata"
        description="Fine-tune how this hashtag appears in search result rankings."
        hasErrors={!!(errors.meta_title || errors.meta_description)}
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Meta Title</label>
            <Input
              name="meta_title"
              value={formData.meta_title}
              onChange={handleChange}
              placeholder="e.g. Explore Top #Hashtag Tools"
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
              placeholder="Describe this hashtag for search engine indexing..."
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
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={!isDirty || isSubmitting}
          className="min-w-[140px] font-bold shadow-md shadow-indigo-600/20"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Saving...
            </>
          ) : (
            initialData ? 'Update Hashtag' : 'Create Hashtag'
          )}
        </Button>
      </div>

      {isSubmitting && <LoadingOverlay message="Synchronizing with database..." />}
    </form>
  );
}
