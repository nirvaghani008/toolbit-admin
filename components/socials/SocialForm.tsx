'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { scrollToError, slugify } from '@/lib/form-utils';
import { supabase } from '@/lib/supabase';
import { createTagAction } from '@/app/admin/tools/tags/actions';
import CollapsibleSection from '../common/CollapsibleSection';
import { Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import KeywordTagInput from '../categories/KeywordTagInput';
import { SocialItem } from './SocialTable';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface SocialFormProps {
  initialData?: SocialItem | null;
  onSubmit?: (data: Partial<SocialItem>) => Promise<void> | void;
  onSave?: (data: Partial<SocialItem>) => Promise<void> | void;
  onCancel?: () => void;
  onClose?: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

const PLATFORM_OPTIONS = [
  { value: 'YouTube', label: 'YouTube' },
  { value: 'Twitter', label: 'Twitter / X' },
  { value: 'Reddit', label: 'Reddit' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Other', label: 'Other' }
];

const CONTENT_TYPE_OPTIONS = [
  { value: 'Tutorial', label: 'Tutorial' },
  { value: 'Podcast', label: 'Podcast' },
  { value: 'Review', label: 'Review' },
  { value: 'Demo', label: 'Demo' },
  { value: 'News Recap', label: 'News Recap' },
  { value: 'Comparison', label: 'Comparison' },
  { value: 'Livestream', label: 'Livestream' },
  { value: 'Interview', label: 'Interview' },
  { value: 'Official Post', label: 'Official Post' },
  { value: 'Thread', label: 'Thread' },
  { value: 'Announcement', label: 'Announcement' },
  { value: 'Opinion', label: 'Opinion' },
  { value: 'Tip', label: 'Tip' },
  { value: 'Rumor', label: 'Rumor' },
  { value: 'Discussion', label: 'Discussion' },
  { value: 'Question', label: 'Question' },
  { value: 'Showcase', label: 'Showcase' },
  { value: 'Reel', label: 'Reel' },
  { value: 'Carousel', label: 'Carousel' },
  { value: 'Creator Post', label: 'Creator Post' },
  { value: 'Short Tip', label: 'Short Tip' }
];

// The socials.status column has a DB CHECK constraint allowing only 'Show' / 'Hide'.
const STATUS_OPTIONS = [
  { value: 'Show', label: 'Show' },
  { value: 'Hide', label: 'Hide' }
];

const BOOLEAN_OPTIONS = [
  { value: 'FALSE', label: 'False' },
  { value: 'TRUE', label: 'True' }
];

interface JsonDataEntry {
  id: string;
  key: string;
  value: string;
}

interface ThumbnailItem {
  id: string;
  url: string;
  width: string | number;
  height: string | number;
}

const PRESET_JSON_KEYS = [
  'source_name',
  'video_id',
  'author',
  'subreddit',
  'content_kind',
  'publish_date',
  'duration',
  'reference_tool_name'
];

export default function SocialForm({
  initialData,
  onSubmit,
  onSave,
  onCancel,
  onClose,
  isLoading = false,
  onBusyChange
}: SocialFormProps) {
  const handleCancel = onCancel || onClose || (() => { });
  const handleSave = onSubmit || onSave || (async () => { });

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    platform: 'Twitter',
    content_type: 'Announcement',
    source_url: '',
    published_date: '',
    is_featured: false,
    is_trending: false,
    status: 'Show'
  });

  const [hasJsonData, setHasJsonData] = useState(false);
  const [presetJsonData, setPresetJsonData] = useState<Record<string, string>>({
    source_name: '',
    video_id: '',
    author: '',
    subreddit: '',
    content_kind: '',
    publish_date: '',
    duration: '',
    reference_tool_name: ''
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [jsonEntries, setJsonEntries] = useState<JsonDataEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
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
        description: initialData.description || '',
        platform: initialData.platform || 'Twitter',
        content_type: Array.isArray(initialData.content_type)
          ? (initialData.content_type[0] || 'Announcement')
          : (initialData.content_type || 'Announcement'),
        source_url: initialData.source_url || '',
        published_date: initialData.published_date ? initialData.published_date.substring(0, 10) : '',
        is_featured: !!initialData.is_featured,
        is_trending: !!initialData.is_trending,
        status: initialData.status || 'Show'
      });
      const rawTags = initialData.tags;
      if (Array.isArray(rawTags)) {
        setSelectedTags(rawTags);
      } else if (typeof rawTags === 'string' && rawTags) {
        try {
          const parsed = JSON.parse(rawTags);
          setSelectedTags(Array.isArray(parsed) ? parsed : [rawTags]);
        } catch {
          setSelectedTags((rawTags as string).split(',').map(s => s.trim()).filter(Boolean));
        }
      } else {
        setSelectedTags([]);
      }

      let loadedJson = initialData.json_data || {};
      if (typeof loadedJson === 'string') {
        try { loadedJson = JSON.parse(loadedJson); } catch { loadedJson = {}; }
      }
      const loadedPresets: Record<string, string> = {
        source_name: '',
        video_id: '',
        author: '',
        subreddit: '',
        content_kind: '',
        publish_date: '',
        duration: '',
        reference_tool_name: ''
      };
      const extraEntries: JsonDataEntry[] = [];

      Object.entries(loadedJson).forEach(([key, val], idx) => {
        if (key === 'thumbnails') return; // Handled separately
        const lowerKey = key.toLowerCase();
        const matchKey = PRESET_JSON_KEYS.find(pk => pk.toLowerCase() === lowerKey);
        if (matchKey) {
          if (matchKey === 'publish_date' && val) {
            const dateStr = String(val).substring(0, 10);
            loadedPresets[matchKey] = dateStr;
          } else {
            loadedPresets[matchKey] = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
          }
        } else {
          extraEntries.push({
            id: `${Date.now()}-${idx}`,
            key,
            value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')
          });
        }
      });

      const loadedThumbs = Array.isArray(loadedJson.thumbnails)
        ? loadedJson.thumbnails.map((t: any, idx: number) => ({
          id: `${Date.now()}-thumb-${idx}`,
          url: t.url || '',
          width: t.width ?? '',
          height: t.height ?? ''
        }))
        : [];

      setPresetJsonData(loadedPresets);
      setJsonEntries(extraEntries);
      setThumbnails(loadedThumbs);
      setHasJsonData(Object.keys(loadedJson).length > 0);
    }
  }, [initialData]);

  const addThumbnail = () => {
    setThumbnails(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, url: '', width: '', height: '' }
    ]);
  };

  const removeThumbnail = (id: string) => {
    setThumbnails(prev => prev.filter(t => t.id !== id));
  };

  const updateThumbnail = (id: string, field: 'url' | 'width' | 'height', val: string) => {
    setThumbnails(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    const initialTagString = JSON.stringify(initialData.tags || []);
    const currentTagString = JSON.stringify(selectedTags);
    const initialContentType = Array.isArray(initialData.content_type)
      ? (initialData.content_type[0] || 'Announcement')
      : (initialData.content_type || 'Announcement');
    const initialPubDate = initialData.published_date ? initialData.published_date.substring(0, 10) : '';

    const initialJsonStr = JSON.stringify(initialData.json_data || {});
    const currentJsonObj: Record<string, any> = {};
    if (hasJsonData) {
      Object.entries(presetJsonData).forEach(([k, v]) => {
        const trimmedVal = v.trim();
        if (!trimmedVal) return;
        currentJsonObj[k] = (!isNaN(Number(trimmedVal)) && trimmedVal !== '') ? Number(trimmedVal) : trimmedVal;
      });
      jsonEntries.forEach(entry => {
        const k = entry.key.trim();
        if (!k) return;
        let v: any = entry.value.trim();
        if (v !== '' && !isNaN(Number(v))) v = Number(v);
        currentJsonObj[k] = v;
      });

      const formattedThumbs = thumbnails
        .filter(t => t.url.trim() !== '')
        .map(t => ({
          url: t.url.trim(),
          width: (t.width !== '' && !isNaN(Number(t.width))) ? Number(t.width) : t.width,
          height: (t.height !== '' && !isNaN(Number(t.height))) ? Number(t.height) : t.height
        }));

      if (formattedThumbs.length > 0) {
        currentJsonObj.thumbnails = formattedThumbs;
      }
    }
    const currentJsonStr = JSON.stringify(currentJsonObj);

    return (
      formData.title !== (initialData.title || '') ||
      formData.description !== (initialData.description || '') ||
      formData.platform !== (initialData.platform || 'Twitter') ||
      formData.content_type !== initialContentType ||
      formData.source_url !== (initialData.source_url || '') ||
      formData.published_date !== initialPubDate ||
      currentTagString !== initialTagString ||
      formData.is_featured !== (!!initialData.is_featured) ||
      formData.is_trending !== (!!initialData.is_trending) ||
      formData.status !== (initialData.status || 'Show') ||
      currentJsonStr !== initialJsonStr
    );
  }, [formData, selectedTags, hasJsonData, presetJsonData, jsonEntries, thumbnails, initialData]);

  const validate = () => {
    const socialSchema = z.object({
      title: z.string().trim().min(1, 'Post title is required'),
      platform: z.string().trim().min(1, 'Platform is required'),
      content_type: z.string().trim().min(1, 'Content type is required'),
      source_url: z.string().trim().min(1, 'Source URL is required').url('Invalid source URL'),
      published_date: z.string().trim().min(1, 'Published date is required')
    });

    const result = socialSchema.safeParse(formData);
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        newErrors[path] = issue.message;
      });
    }

    if (selectedTags.length === 0) {
      newErrors.tags = 'At least one tag is required';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToError(newErrors);
      return false;
    }
    return true;
  };

  const handleFieldChange = (name: string, value: any) => {
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

      // Auto-create missing tags in tags DB table
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      for (const tag of selectedTags) {
        if (!tag || !tag.trim()) continue;
        const tagName = tag.trim();
        const slug = slugify(tagName);
        try {
          const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .or(`name.ilike.${tagName},slug.eq.${slug}`);
          if (!existingTag || existingTag.length === 0) {
            if (token) {
              await createTagAction({ name: tagName, slug, status: 'show' }, token);
            }
          }
        } catch {
          // ignore tag auto-creation errors if table schema differs
        }
      }

      // Build json_data object
      const jsonDataObj: Record<string, any> = {};
      if (hasJsonData) {
        Object.entries(presetJsonData).forEach(([k, v]) => {
          const trimmedVal = v.trim();
          if (!trimmedVal) return;
          jsonDataObj[k] = (trimmedVal !== '' && !isNaN(Number(trimmedVal))) ? Number(trimmedVal) : trimmedVal;
        });
        jsonEntries.forEach(entry => {
          const k = entry.key.trim();
          if (!k) return;
          let v: any = entry.value.trim();
          if (v !== '' && !isNaN(Number(v))) v = Number(v);
          jsonDataObj[k] = v;
        });

        const formattedThumbs = thumbnails
          .filter(t => t.url.trim() !== '')
          .map(t => ({
            url: t.url.trim(),
            width: (t.width !== '' && !isNaN(Number(t.width))) ? Number(t.width) : t.width,
            height: (t.height !== '' && !isNaN(Number(t.height))) ? Number(t.height) : t.height
          }));

        if (formattedThumbs.length > 0) {
          jsonDataObj.thumbnails = formattedThumbs;
        }
      }

      await handleSave({
        title: formData.title,
        description: formData.description || null,
        platform: formData.platform,
        content_type: [formData.content_type],
        source_url: formData.source_url || null,
        published_date: formData.published_date ? new Date(formData.published_date).toISOString() : null,
        tags: selectedTags,
        is_featured: formData.is_featured,
        is_trending: formData.is_trending,
        status: formData.status,
        json_data: (hasJsonData || Object.keys(jsonDataObj).length > 0) ? jsonDataObj : {}
      });
    } catch (err: any) {
      setErrors({ submit: err?.message || 'An error occurred while saving social post update.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' => {
    const s = (status || '').toLowerCase();
    if (s === 'show' || s === 'active' || s === 'published') return 'success';
    if (s === 'hide') return 'destructive';
    if (s === 'draft') return 'warning';
    if (s === 'archived') return 'violet';
    return 'slate';
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
              errors.submit
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

      {/* 1. Post Details & Content */}
      <CollapsibleSection
        id="social_post_section"
        title={initialData ? 'Edit Social Update' : 'New Social Update'}
        description="Configure social post title, description, platform, content type, and tags."
        hasErrors={!!(errors.title || errors.platform || errors.content_type || errors.tags || errors.source_url || errors.published_date)}
        headerActions={
          <Badge variant={getStatusBadgeVariant(formData.status)} className="text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider">
            {formData.status}
          </Badge>
        }
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Post Title <span className="saas-label-required">*</span></label>
            <Input
              type="text"
              name="title"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="e.g. Major feature release announcement on X"
              className={errors.title ? 'saas-input-error' : ''}
              required
            />
            {errors.title && <p className="saas-error-message">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Description</label>
            <Textarea
              name="description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={6}
              placeholder="Social post text, tweet body, or summary snippet..."
              className="min-h-[140px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className={labelClass}>Platform <span className="saas-label-required">*</span></label>
              <Select
                value={formData.platform}
                onChange={(val) => handleFieldChange('platform', val)}
                options={PLATFORM_OPTIONS}
                className={errors.platform ? 'saas-input-error' : ''}
              />
              {errors.platform && <p className="saas-error-message">{errors.platform}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Content Type <span className="saas-label-required">*</span></label>
              <Select
                value={formData.content_type}
                onChange={(val) => handleFieldChange('content_type', val)}
                options={CONTENT_TYPE_OPTIONS}
                className={errors.content_type ? 'saas-input-error' : ''}
              />
              {errors.content_type && <p className="saas-error-message">{errors.content_type}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className={labelClass}>Tags <span className="saas-label-required">*</span></label>
              <div className={`relative focus-within:z-50 ${errors.tags ? 'saas-error-wrapper' : ''}`}>
                <KeywordTagInput
                  selectedKeywords={selectedTags}
                  onKeywordsChange={(tags) => {
                    setSelectedTags(tags);
                    if (errors.tags) {
                      setErrors(prev => { const n = { ...prev }; delete n.tags; return n; });
                    }
                  }}
                  onClearError={() => {
                    if (errors.tags) {
                      setErrors(prev => { const n = { ...prev }; delete n.tags; return n; });
                    }
                  }}
                  placeholder="Type or select tags from database..."
                  type="generic"
                  name="tags"
                />
              </div>
              {errors.tags && <p className="saas-error-message">{errors.tags}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Status</label>
              <Select
                value={formData.status}
                onChange={(val) => handleFieldChange('status', val)}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className={labelClass}>Source URL <span className="saas-label-required">*</span></label>
              <Input
                type="url"
                name="source_url"
                value={formData.source_url}
                onChange={(e) => handleFieldChange('source_url', e.target.value)}
                placeholder="https://x.com/username/status/123456789"
                className={errors.source_url ? 'saas-input-error' : ''}
                required
              />
              {errors.source_url && <p className="saas-error-message">{errors.source_url}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={labelClass}>Published Date <span className="saas-label-required">*</span></label>
              <DateField
                name="published_date"
                value={formData.published_date}
                onChange={(value) => handleFieldChange('published_date', value)}
                error={!!errors.published_date}
                required
              />
              {errors.published_date && <p className="saas-error-message">{errors.published_date}</p>}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Custom Metadata & JSON Details */}
      <CollapsibleSection
        id="social_json_section"
        title="Custom Metadata"
        description="Add key-value metadata fields such as video ID, author, duration, or custom JSON parameters."
        hasErrors={false}
        isOpen={hasJsonData}
        onToggle={(open) => setHasJsonData(open)}
        hideChevron={true}
        headerActions={
          <div className="flex items-center gap-3">
            <Switch
              checked={hasJsonData}
              onCheckedChange={setHasJsonData}
            />
          </div>
        }
      >
        {hasJsonData && (
          <div className="space-y-8 animate-fade-in">
            {/* Standard Attributes Form Fields */}
            <div className="p-5 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/20 space-y-4">
              <h3 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                Standard Attributes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Source Name</label>
                  <Input
                    type="text"
                    value={presetJsonData.source_name || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, source_name: e.target.value }))}
                    placeholder="source_name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Video ID</label>
                  <Input
                    type="number"
                    value={presetJsonData.video_id || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, video_id: e.target.value }))}
                    placeholder="video_id"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Author</label>
                  <Input
                    type="text"
                    value={presetJsonData.author || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, author: e.target.value }))}
                    placeholder="author"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Subreddit</label>
                  <Input
                    type="text"
                    value={presetJsonData.subreddit || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, subreddit: e.target.value }))}
                    placeholder="subreddit"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Content Kind</label>
                  <Input
                    type="text"
                    value={presetJsonData.content_kind || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, content_kind: e.target.value }))}
                    placeholder="content_kind"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Video Publish Date</label>
                  <DateField
                    value={presetJsonData.publish_date || ''}
                    onChange={(value) => setPresetJsonData(prev => ({ ...prev, publish_date: value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Duration (sec)</label>
                  <Input
                    type="number"
                    value={presetJsonData.duration || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, duration: e.target.value }))}
                    placeholder="duration"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Reference Tool Name</label>
                  <Input
                    type="text"
                    value={presetJsonData.reference_tool_name || ''}
                    onChange={(e) => setPresetJsonData(prev => ({ ...prev, reference_tool_name: e.target.value }))}
                    placeholder="reference_tool_name"
                  />
                </div>
              </div>
            </div>

            {/* Thumbnails Section */}
            <div className="p-5 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/20 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                    Thumbnails
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                {thumbnails.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic">No thumbnails added yet.</p>
                ) : (
                  thumbnails.map((thumb) => (
                    <div key={thumb.id} className="p-4 border border-[var(--border-color)] rounded-xl bg-[var(--bg-surface)] space-y-3 relative group">
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        onClick={() => removeThumbnail(thumb.id)}
                        className="absolute top-3 right-3 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all duration-200 uppercase tracking-wider flex items-center gap-1"
                        title="Delete Thumbnail"
                      >
                        <Trash2 size={12} /> Delete
                      </Button>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pr-16 md:pr-20">
                        <div className="md:col-span-6 space-y-1.5">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Image URL</label>
                          <Input
                            type="text"
                            value={thumb.url}
                            onChange={(e) => updateThumbnail(thumb.id, 'url', e.target.value)}
                            placeholder="https://i.ytimg.com/vi/.../hqdefault.jpg"
                          />
                        </div>
                        <div className="md:col-span-3 space-y-1.5">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Width (px)</label>
                          <Input
                            type="number"
                            value={thumb.width}
                            onChange={(e) => updateThumbnail(thumb.id, 'width', e.target.value)}
                            placeholder="e.g. 1920"
                          />
                        </div>
                        <div className="md:col-span-3 space-y-1.5">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Height (px)</label>
                          <Input
                            type="number"
                            value={thumb.height}
                            onChange={(e) => updateThumbnail(thumb.id, 'height', e.target.value)}
                            placeholder="e.g. 1080"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addThumbnail}
                  className="border-dashed font-bold text-xs"
                >
                  <Plus size={14} /> Add Thumbnail
                </Button>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 3. Promotion Settings */}
      <CollapsibleSection
        id="social_promotion_section"
        title="Promotion Settings"
        description="Set feature and trending flags for this social post."
        hasErrors={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelClass}>Is Featured</label>
            <Select
              value={formData.is_featured ? 'TRUE' : 'FALSE'}
              onChange={(val) => handleFieldChange('is_featured', val === 'TRUE')}
              options={BOOLEAN_OPTIONS}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Is Trending</label>
            <Select
              value={formData.is_trending ? 'TRUE' : 'FALSE'}
              onChange={(val) => handleFieldChange('is_trending', val === 'TRUE')}
              options={BOOLEAN_OPTIONS}
            />
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
              <span>{initialData ? 'Updating Post...' : 'Creating Post...'}</span>
            </>
          ) : initialData ? (
            'Update Social Post'
          ) : (
            'Create Social Post'
          )}
        </Button>
      </div>
    </form>
  );
}
