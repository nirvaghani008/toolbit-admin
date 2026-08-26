'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { Upload, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import KeywordTagInput from '../categories/KeywordTagInput';
import RichTextEditor from '../common/RichTextEditor';
import { scrollToError, slugify, shortSlugify } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import { uploadImageFile, uploadBase64Image, processAndUploadBase64Images } from '@/lib/image-upload';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface BlogFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

const cleanContentMdx = (val: string): string => {
  if (!val) return '';
  let str = val.replace(/\r\n/g, '\n');
  str = str.replace(/^([\s]*[-*•+]\s*)\t+/gm, '$1 ');
  str = str.replace(/^([\s]*\d+[\.\)]\s*)\t+/gm, '$1 ');

  // Pre-clean broken \n fragments where a short title, word, or list item is separated from its continuation line
  const initialLines = str.split('\n');
  const cleanedLines: string[] = [];

  const isBlockBoundary = (s: string) => /^([#|]|[-*]\s+|\d+\.\s+|<[a-z]|[-*_]{3,}\s*$)/i.test(s.trim());

  for (let i = 0; i < initialLines.length; i++) {
    const line = initialLines[i].trim();
    if (!line) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    if (cleanedLines.length > 0) {
      const prevIdx = cleanedLines.length - 1;
      const prevLine = cleanedLines[prevIdx];

      if (prevLine !== '') {
        const prevIsShort = prevLine.length < 70 && !/[.!?:]$/.test(prevLine);
        const currIsLower = /^[a-z]/.test(line);
        const currIsSymbol = /^[\u2190-\u21FF\u2100-\u214F\u2700-\u27BF\:\,\;\.\-\→\⇒]/.test(line);
        const prevIsListHeader = /^([-*]|\d+\.)\s+[^\n]+$/i.test(prevLine) && !/[.!?]$/.test(prevLine);
        const isBoundary = isBlockBoundary(line) || isBlockBoundary(prevLine);

        if (!isBoundary && (currIsLower || currIsSymbol || prevIsListHeader || (prevIsShort && !prevLine.startsWith('#')))) {
          cleanedLines[prevIdx] = `${prevLine} ${line}`;
          continue;
        }
      } else if (cleanedLines.length >= 2) {
        const prevContentLine = cleanedLines[cleanedLines.length - 2];
        const prevIsListHeader = /^([-*]|\d+\.)\s+[^\n]+$/i.test(prevContentLine) && !/[.!?]$/.test(prevContentLine);
        const prevIsShortWord = /^[A-Za-z0-9\s\u{1F300}-\u{1F9FF}-]{1,50}$/u.test(prevContentLine) && !/[.!?]$/.test(prevContentLine);
        const currIsLower = /^[a-z]/.test(line);
        const currIsSymbol = /^[\u2190-\u21FF\u2100-\u214F\u2700-\u27BF\:\,\;\.\-\→\⇒]/.test(line);
        const isBoundary = isBlockBoundary(line) || isBlockBoundary(prevContentLine);

        if (!isBoundary && (currIsLower || currIsSymbol || prevIsListHeader || prevIsShortWord)) {
          cleanedLines.pop();
          cleanedLines[cleanedLines.length - 1] = `${prevContentLine} ${line}`;
          continue;
        }
      }
    }

    cleanedLines.push(line);
  }

  str = cleanedLines.join('\n');

  str = str.replace(/<span\s+style="[^"]*">(.*?)<\/span>/gi, '$1');
  str = str.replace(/\s*style="[^"]*"/gi, '');

  return str.replace(
    /(?:^|\n)(?:<p[^>]*>)?(?:<strong>|<b>)?([^\n|#-][^\n|]{0,60}?)(?:<\/strong>|<\/b>)?(?:<\/p>)?\s*\n+[^\S\r\n]*\|[^\S\r\n]*([^|\n]+?)[^\S\r\n]*\|[^\S\r\n]*(?:(?:&nbsp;|\s)*)?\|?[^\S\r\n]*(?=\n|$)/gi,
    (match, key, v) => {
      const trimmedKey = key.replace(/<[^>]+>/g, '').trim();
      const trimmedVal = v.replace(/<[^>]+>/g, '').trim();
      if (!trimmedKey || !trimmedVal || trimmedKey.startsWith('http')) return match;
      return `\n| ${trimmedKey} | ${trimmedVal} |`;
    }
  );
};

export default function BlogForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  onBusyChange,
}: BlogFormProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    author_name: initialData?.author_name || '',
    description: initialData?.description || '',
    featured_image_url: initialData?.featured_image_url || '',
    status: initialData?.status || 'draft',
    is_featured: initialData?.is_featured === true ? 'TRUE' : 'FALSE',
    content_mdx: cleanContentMdx(initialData?.content_mdx || ''),
    external_source_url: initialData?.external_source_url || '',
    meta_title: initialData?.meta_title || '',
    meta_description: initialData?.meta_description || '',
    is_paid: initialData?.is_paid === true ? 'TRUE' : 'FALSE',
    submission_tier: initialData?.submission_tier || 'free',
    ai_approved: initialData?.ai_approved === true ? 'TRUE' : initialData?.ai_approved === false ? 'FALSE' : 'PENDING',
    ai_denied_reason: initialData?.ai_denied_reason || '',
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialData?.categories || []);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData?.tags || []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingFeaturedImage, setIsUploadingFeaturedImage] = useState(false);
  const [isRichTextUploading, setIsRichTextUploading] = useState(false);
  const localBusy = isSubmitting || isUploadingFeaturedImage || isRichTextUploading;
  const isBusy = localBusy || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);
  const featuredFileInputRef = useRef<HTMLInputElement>(null);

  const handleFeaturedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFeaturedImage(true);
    try {
      const url = await uploadImageFile(file, 'featured', formData.title || undefined);
      setFormData(prev => ({ ...prev, featured_image_url: url }));
      if (errors.featured_image_url) {
        setErrors(prev => {
          const updated = { ...prev };
          delete updated.featured_image_url;
          return updated;
        });
      }
    } catch (err: any) {
      console.error('Featured image upload error:', err);
      setErrors(prev => ({
        ...prev,
        featured_image_url: `CDN Upload Failed: ${err.message || 'Failed to upload image to cloud server'}`
      }));
    } finally {
      setIsUploadingFeaturedImage(false);
    }
  };

  const isDirty = useMemo(() => {
    if (!initialData) return true;

    const initialCategories = initialData.categories || [];
    const initialTags = initialData.tags || [];
    const initialIsFeatured = initialData.is_featured === true ? 'TRUE' : 'FALSE';
    const initialIsPaid = initialData.is_paid === true ? 'TRUE' : 'FALSE';

    const currentCats = [...selectedCategories].sort().join(',');
    const comparisonCats = [...initialCategories].sort().join(',');

    const currentTagsList = [...selectedTags].sort().join(',');
    const comparisonTagsList = [...initialTags].sort().join(',');

    const initialAiApproved = initialData.ai_approved === true ? 'TRUE' : initialData.ai_approved === false ? 'FALSE' : 'PENDING';

    return (
      formData.title !== (initialData.title || '') ||
      formData.slug !== (initialData.slug || '') ||
      formData.author_name !== (initialData.author_name || '') ||
      formData.description !== (initialData.description || '') ||
      formData.featured_image_url !== (initialData.featured_image_url || '') ||
      formData.status !== (initialData.status || 'draft') ||
      formData.is_featured !== initialIsFeatured ||
      formData.content_mdx !== (initialData.content_mdx || '') ||
      formData.external_source_url !== (initialData.external_source_url || '') ||
      formData.meta_title !== (initialData.meta_title || '') ||
      formData.meta_description !== (initialData.meta_description || '') ||
      formData.is_paid !== initialIsPaid ||
      formData.submission_tier !== (initialData.submission_tier || 'free') ||
      formData.ai_approved !== initialAiApproved ||
      formData.ai_denied_reason !== (initialData.ai_denied_reason || '') ||
      currentCats !== comparisonCats ||
      currentTagsList !== comparisonTagsList
    );
  }, [formData, selectedCategories, selectedTags, initialData]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        slug: initialData.slug || '',
        author_name: initialData.author_name || '',
        description: initialData.description || '',
        featured_image_url: initialData.featured_image_url || '',
        status: initialData.status || 'draft',
        is_featured: initialData.is_featured === true ? 'TRUE' : 'FALSE',
        content_mdx: cleanContentMdx(initialData.content_mdx || ''),
        external_source_url: initialData.external_source_url || '',
        meta_title: initialData.meta_title || '',
        meta_description: initialData.meta_description || '',
        is_paid: initialData.is_paid === true ? 'TRUE' : 'FALSE',
        submission_tier: initialData.submission_tier || 'free',
        ai_approved: initialData.ai_approved === true ? 'TRUE' : initialData.ai_approved === false ? 'FALSE' : 'PENDING',
        ai_denied_reason: initialData.ai_denied_reason || '',
      });
      setSelectedCategories(initialData.categories || []);
      setSelectedTags(initialData.tags || []);
    }
  }, [initialData]);

  const validate = () => {
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/#\?][^\s]*)?$/i;
    const slugRegex = /^[a-z0-9-]+$/;

    const isValidImageUrl = (val: string) => {
      if (!val) return true;
      if (val.startsWith('data:image/')) return false;
      if (val.startsWith('/') || val.startsWith('blob:')) return true;
      return urlRegex.test(val);
    };

    const blogSchema = z.object({
      title: z.string().trim()
        .min(1, 'title is required')
        .min(10, 'title must be at least 10 characters'),
      slug: z.string().trim()
        .min(1, 'slug is required')
        .regex(slugRegex, 'slug must contain only lowercase letters, numbers, and hyphens'),
      content_mdx: z.string().trim()
        .refine(val => val !== '' && val !== '<p></p>', 'content_mdx is required')
        .refine(val => val.length >= 50, 'content_mdx must be at least 50 characters for better SEO')
        .refine(val => !val.includes('data:image/'), 'content_mdx contains base64 image data that could not be uploaded to CDN cloud server'),
      categories: z.array(z.string()).min(1, 'at least one category is required'),
      featured_image_url: z.string().trim()
        .refine(val => !val.startsWith('data:image/'), 'featured_image_url must be a cloud CDN URL, base64 is not allowed')
        .refine(isValidImageUrl, 'invalid featured_image_url format'),
      external_source_url: z.string().trim().regex(urlRegex, 'invalid external_source_url format').or(z.literal('')),
    });

    const validationData = {
      ...formData,
      categories: selectedCategories
    };

    const result = blogSchema.safeParse(validationData);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      // Automatically convert any embedded base64 images to CDN URLs
      let processedMdx = cleanContentMdx(formData.content_mdx);
      if (processedMdx && processedMdx.includes('data:image/')) {
        processedMdx = await processAndUploadBase64Images(processedMdx, formData.title);
      }

      let processedFeaturedImg = formData.featured_image_url;
      if (processedFeaturedImg && processedFeaturedImg.startsWith('data:image/')) {
        processedFeaturedImg = await uploadBase64Image(processedFeaturedImg, formData.title);
      }

      if (processedMdx.includes('data:image/')) {
        throw new Error('Some images in content_mdx failed to upload to the cloud CDN server. Base64 images cannot be saved to the database.');
      }
      if (processedFeaturedImg.startsWith('data:image/')) {
        throw new Error('Featured image failed to upload to the cloud CDN server. Base64 images cannot be saved to the database.');
      }

      if (processedMdx !== formData.content_mdx || processedFeaturedImg !== formData.featured_image_url) {
        setFormData(prev => ({
          ...prev,
          content_mdx: processedMdx,
          featured_image_url: processedFeaturedImg,
        }));
      }

      if (!validate()) {
        return;
      }

      const toNull = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string' && val.trim() === '') return null;
        if (Array.isArray(val) && val.length === 0) return null;
        return val;
      };

      const nowIso = new Date().toISOString();

      const submissionData = {
        title: toNull(formData.title),
        slug: toNull(formData.slug),
        author_name: toNull(formData.author_name) || 'Toolbit AI - Team',
        content_mdx: toNull(processedMdx),
        external_source_url: toNull(formData.external_source_url),
        featured_image_url: toNull(processedFeaturedImg),
        description: toNull(formData.description),
        status: formData.status,
        is_featured: formData.is_featured === 'TRUE' ? true : formData.is_featured === 'FALSE' ? false : null,
        categories: toNull(selectedCategories),
        tags: toNull(selectedTags),
        meta_title: toNull(formData.meta_title),
        meta_description: toNull(formData.meta_description),
        is_paid: formData.is_paid === 'TRUE' ? true : formData.is_paid === 'FALSE' ? false : null,
        ...(initialData ? {} : { created_at: nowIso }),
        updated_at: nowIso,
      };
      await onSubmit(submissionData);
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrors({ submit: err.message || 'An error occurred during submission' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'title' && (!initialData || !prev.slug || prev.slug === slugify(prev.title) || prev.slug === shortSlugify(prev.title))) {
        nextData.slug = shortSlugify(value);
      }
      return nextData;
    });
    if (errors[name] || (name === 'title' && errors['slug'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'title') delete newErrs['slug'];
        return newErrs;
      });
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        return newErrs;
      });
    }
  };

  const labelClass = "saas-label";

  return (
    <form onSubmit={handleSubmit} noValidate className={`saas-form space-y-8 pb-10 transition-opacity duration-200 ${isBusy ? 'opacity-50 pointer-events-none select-none' : ''}`}>
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm font-bold flex items-center gap-2">
            {errors.submit ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription className="text-xs font-semibold mt-1 leading-relaxed">
            {errors.submit ? (
              <span className="font-bold">{errors.submit}</span>
            ) : (
              <>
                There are {Object.keys(errors).filter(k => k !== 'submit').length} fields that require your attention:
                <span className="font-bold ml-1">
                  {Object.keys(errors).filter(k => k !== 'submit').map(key => key.replace(/_/g, ' ')).join(', ')}
                </span>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Content Core */}
      <CollapsibleSection
        id="article_core_section"
        title="Article Core"
        description="Primary identification and publishing status."
        hasErrors={!!(errors.title || errors.slug || errors.content_mdx)}
        headerActions={
          <Badge
            variant={
              formData.status === 'published' ? 'success' :
              formData.status === 'pending' ? 'warning' :
              formData.status === 'draft' ? 'violet' :
              formData.status === 'rejected' ? 'destructive' : 'slate'
            }
            className="text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider"
          >
            {formData.status === 'published' ? 'Published' :
             formData.status === 'pending' ? 'Pending' :
             formData.status === 'draft' ? 'Draft' :
             formData.status === 'rejected' ? 'Rejected' : 'Archived'}
          </Badge>
        }
      >
        {initialData?.ai_approved === false && initialData?.ai_denied_reason && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase tracking-wider">AI Rejection Reason</AlertTitle>
            <AlertDescription className="text-xs mt-1 font-medium leading-relaxed">
              {initialData.ai_denied_reason}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Title <span className="saas-label-required">*</span></label>
            <Input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Article title..."
              className={errors.title ? 'saas-input-error' : ''}
              required
            />
            {errors.title && <p className="saas-error-message">{errors.title}</p>}
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Slug <span className="saas-label-required">*</span></label>
            <Input
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              placeholder="article-slug"
              className={`font-mono text-sm ${errors.slug ? 'saas-input-error' : ''}`}
              required
            />
            {errors.slug && <p className="saas-error-message">{errors.slug}</p>}
          </div>
        </div>

        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Description</label>
          <Textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Brief description or teaser of the article..."
            rows={3}
            className={errors.description ? 'saas-input-error' : ''}
          />
        </div>

        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Content Mdx <span className="saas-label-required">*</span></label>
          <div className={errors.content_mdx ? 'saas-error-wrapper' : ''}>
            <RichTextEditor
              content={formData.content_mdx}
              onChange={(html) => {
                setFormData(prev => ({ ...prev, content_mdx: html }));
                if (errors.content_mdx && html.trim() && html !== '<p></p>') {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.content_mdx;
                    return next;
                  });
                }
              }}
              placeholder="Write or paste your article content here..."
              showFormatButton={false}
              name="content_mdx"
              onBusyChange={setIsRichTextUploading}
            />
          </div>
          {errors.content_mdx && <p className="saas-error-message">{errors.content_mdx}</p>}
        </div>
      </CollapsibleSection>

      {/* 2. Taxonomy & Metadata */}
      <CollapsibleSection
        id="taxonomy_meta_section"
        title="Taxonomy & Meta"
        description="Categories, tags, and SEO settings."
        hasErrors={!!errors.categories}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Categories <span className="saas-label-required">*</span></label>
            <div className={`relative focus-within:z-50 ${errors.categories ? 'saas-error-wrapper' : ''}`}>
              <KeywordTagInput
                selectedKeywords={selectedCategories}
                onKeywordsChange={(cats) => {
                  setSelectedCategories(cats);
                  if (errors.categories) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.categories;
                      return next;
                    });
                  }
                }}
                onClearError={() => {
                  if (errors.categories) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.categories;
                      return next;
                    });
                  }
                }}
                placeholder="Select or type categories..."
                type="category"
                name="categories"
              />
            </div>
            {errors.categories && <p className="saas-error-message">{errors.categories}</p>}
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Tags</label>
            <div className={`relative focus-within:z-40 ${errors.tags ? 'saas-error-wrapper' : ''}`}>
              <KeywordTagInput
                selectedKeywords={selectedTags}
                onKeywordsChange={(tags) => {
                  setSelectedTags(tags);
                  if (errors.tags) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.tags;
                      return next;
                    });
                  }
                }}
                onClearError={() => {
                  if (errors.tags) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.tags;
                      return next;
                    });
                  }
                }}
                placeholder="Select or type tags..."
                type="generic"
                name="tags"
              />
            </div>
            {errors.tags && <p className="saas-error-message">{errors.tags}</p>}
          </div>
        </div>

        {/* Author Name */}
        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Author Name</label>
          <Input
            name="author_name"
            value={formData.author_name}
            onChange={handleChange}
            placeholder="Toolbit AI - Team"
          />
        </div>

        {/* Status & Is Featured */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Status</label>
            <Select
              value={formData.status}
              onChange={(val) => handleSelectChange('status', val)}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Is Featured</label>
            <Select
              value={formData.is_featured}
              onChange={(val) => handleSelectChange('is_featured', val)}
              options={[
                { value: 'FALSE', label: 'FALSE' },
                { value: 'TRUE', label: 'TRUE' },
              ]}
            />
          </div>
        </div>

        {/* Meta Title (SEO) */}
        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Meta Title (SEO)</label>
          <Input
            name="meta_title"
            value={formData.meta_title}
            onChange={handleChange}
            placeholder="Custom SEO Title"
            className={errors.meta_title ? 'saas-input-error' : ''}
          />
        </div>

        {/* Meta Description (SEO) */}
        <div className="space-y-1.5 mt-6">
          <label className={labelClass}>Meta Description (SEO)</label>
          <Textarea
            name="meta_description"
            value={formData.meta_description}
            onChange={handleChange}
            placeholder="Custom SEO description for search engine previews..."
            rows={2}
            className={errors.meta_description ? 'saas-input-error' : ''}
          />
        </div>
      </CollapsibleSection>

      {/* 3. Media & External */}
      <CollapsibleSection
        id="media_external_section"
        title="Media & External"
        description="Visual assets and source links."
        hasErrors={!!(errors.featured_image_url || errors.external_source_url)}
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Featured Image URL</label>
            <div className="flex gap-2.5">
              <Input
                name="featured_image_url"
                value={formData.featured_image_url}
                onChange={handleChange}
                placeholder="https://..."
                className={`flex-1 ${errors.featured_image_url ? 'saas-input-error' : ''}`}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => featuredFileInputRef.current?.click()}
                disabled={isUploadingFeaturedImage}
                className="shrink-0 h-10 px-4 font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs gap-1.5"
              >
                {isUploadingFeaturedImage ? <Spinner size={14} className="text-current shrink-0" /> : <Upload size={14} />}
                <span>Browse</span>
              </Button>
            </div>
            <input
              type="file"
              ref={featuredFileInputRef}
              accept="image/*"
              onChange={handleFeaturedImageUpload}
              className="hidden"
            />
            {errors.featured_image_url && <p className="saas-error-message">{errors.featured_image_url}</p>}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>External Source URL</label>
            <Input
              name="external_source_url"
              value={formData.external_source_url}
              onChange={handleChange}
              placeholder="https://..."
              className={errors.external_source_url ? 'saas-input-error' : ''}
            />
            {errors.external_source_url && <p className="saas-error-message">{errors.external_source_url}</p>}
            <p className="text-[10px] text-[var(--text-muted)] font-medium mt-1">Unique URL where this post is originally sourced or syndicated.</p>
          </div>
        </div>
      </CollapsibleSection>

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
              <Spinner size={14} className="mr-1.5 text-current shrink-0" />
              <span>{initialData ? 'Updating Article...' : 'Creating Article...'}</span>
            </>
          ) : initialData ? (
            'Update Article'
          ) : (
            'Create Article'
          )}
        </Button>
      </div>
    </form>
  );
}
