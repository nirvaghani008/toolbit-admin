'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { scrollToError, slugify } from '@/lib/form-utils';
import CollapsibleSection from '../common/CollapsibleSection';
import RichTextEditor from '../common/RichTextEditor';
import { Model } from './ModelTable';
import { Plus, Trash2, Code, LayoutGrid, AlertCircle, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface ModelFormProps {
  initialData?: Model | null;
  onSubmit?: (data: Partial<Model>) => Promise<void> | void;
  onSave?: (data: Partial<Model>) => Promise<void> | void;
  onCancel?: () => void;
  onClose?: () => void;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

const MODALITY_OPTIONS = ['text', 'image', 'file', 'audio', 'video'];

const PRESET_TOP_SCORE_KEYS = [
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'code', label: 'Code' },
  { key: 'coding', label: 'Coding' },
  { key: 'math', label: 'Math' },
  { key: 'agents', label: 'Agents' },
  { key: 'vision', label: 'Vision' },
  { key: 'multimodal', label: 'Multimodal' },
  { key: 'search', label: 'Search' },
  { key: 'finance', label: 'Finance' },
  { key: 'legal', label: 'Legal' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'language', label: 'Language' },
  { key: 'frontend_development', label: 'Frontend Dev' },
  { key: 'long_context', label: 'Long Context' },
  { key: 'tool_calling', label: 'Tool Calling' },
  { key: 'structured_output', label: 'Structured Output' }
];

interface CustomTopScoreEntry {
  id: string;
  key: string;
  value: string;
}

function getFormStatusVariant(status: string): 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default' {
  const s = (status || '').toLowerCase();
  if (s === 'show' || s === 'active') return 'success';
  if (s === 'show:invalid') return 'warning';
  if (s === 'show:error' || s === 'error') return 'destructive';
  if (s === 'show:inactive') return 'info';
  if (s === 'hide') return 'slate';
  if (s === 'delete') return 'destructive';
  return 'slate';
}

export default function ModelForm({
  initialData,
  onSubmit,
  onSave,
  onCancel,
  onClose,
  isLoading = false,
  onBusyChange
}: ModelFormProps) {
  const handleCancel = onCancel || onClose || (() => { });
  const handleSave = onSubmit || onSave || (async () => { });

  const [formData, setFormData] = useState({
    name: '',
    model_id_slug: '',
    provider: '',
    release_date: '',
    status: 'show',
    site_url: '',
    news_url: '',
    favicon_url: '',
    review: '',
    meta_title: '',
    meta_description: '',

    // Architecture & Specs
    context_length: '',
    knowledge_cutoff: '',
    modality: '',
    tokenizer: '',
    input_modalities: [] as string[],
    output_modalities: [] as string[],

    // Benchmarks
    benchmarks: [] as any[]
  });

  const [hasArchitecture, setHasArchitecture] = useState(false);
  const [hasBenchmarks, setHasBenchmarks] = useState(false);
  const [hasTopScores, setHasTopScores] = useState(false);

  const [presetTopScores, setPresetTopScores] = useState<Record<string, string>>({
    reasoning: '',
    code: '',
    coding: '',
    math: '',
    agents: '',
    vision: '',
    multimodal: '',
    search: '',
    finance: '',
    legal: '',
    healthcare: '',
    language: '',
    frontend_development: '',
    long_context: '',
    tool_calling: '',
    structured_output: ''
  });
  const [customTopScores, setCustomTopScores] = useState<CustomTopScoreEntry[]>([]);

  const [benchmarkTab, setBenchmarkTab] = useState<'visual' | 'json'>('visual');
  const [benchmarksRawJson, setBenchmarksRawJson] = useState('[]');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRichTextUploading, setIsRichTextUploading] = useState(false);
  const localBusy = isSubmitting || isRichTextUploading;
  const isBusy = localBusy || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    if (initialData) {
      let formattedReleaseDate = initialData.release_date || '';
      if (formattedReleaseDate && formattedReleaseDate.includes('T')) {
        formattedReleaseDate = formattedReleaseDate.split('T')[0];
      }

      let arch = initialData.architecture || {};
      if (typeof arch === 'string') {
        try { arch = JSON.parse(arch); } catch { arch = {}; }
      }

      let bench: any[] = [];
      if (Array.isArray(initialData.benchmarks)) {
        bench = initialData.benchmarks;
      } else if (typeof initialData.benchmarks === 'string' && initialData.benchmarks) {
        try {
          const parsed = JSON.parse(initialData.benchmarks);
          if (Array.isArray(parsed)) bench = parsed;
        } catch { bench = []; }
      }

      let loadedTopScores = initialData.top_scores || {};
      if (typeof loadedTopScores === 'string') {
        try { loadedTopScores = JSON.parse(loadedTopScores); } catch { loadedTopScores = {}; }
      }

      const hasArchData = Object.keys(arch).length > 0 || !!initialData.context_length || !!initialData.knowledge_cutoff;
      setHasArchitecture(hasArchData);
      setHasBenchmarks(bench.length > 0);

      const loadedPresetTopScores: Record<string, string> = {
        reasoning: '',
        code: '',
        coding: '',
        math: '',
        agents: '',
        vision: '',
        multimodal: '',
        search: '',
        finance: '',
        legal: '',
        healthcare: '',
        language: '',
        frontend_development: '',
        long_context: '',
        tool_calling: '',
        structured_output: ''
      };
      const extraCustomScores: CustomTopScoreEntry[] = [];

      Object.entries(loadedTopScores).forEach(([key, val], idx) => {
        const lowerKey = key.toLowerCase();
        const presetMatch = PRESET_TOP_SCORE_KEYS.find(p => p.key.toLowerCase() === lowerKey);
        if (presetMatch) {
          loadedPresetTopScores[presetMatch.key] = String(val ?? '');
        } else {
          extraCustomScores.push({
            id: `top-score-${Date.now()}-${idx}`,
            key,
            value: String(val ?? '')
          });
        }
      });

      setPresetTopScores(loadedPresetTopScores);
      setCustomTopScores(extraCustomScores);
      setHasTopScores(Object.keys(loadedTopScores).length > 0);

      const modelInfo = (initialData as any)?.model_info || {};

      setFormData({
        name: initialData.name || modelInfo.model_name || '',
        model_id_slug: initialData.model_id_slug || initialData.slug || slugify(initialData.name || ''),
        provider: initialData.provider || '',
        release_date: formattedReleaseDate,
        status: initialData.status || 'show',
        site_url: initialData.site_url || '',
        news_url: initialData.news_url || '',
        favicon_url: initialData.favicon_url || '',
        review: (initialData as any)?.Review || initialData.review || modelInfo.overview || '',
        meta_title: initialData.meta_title || modelInfo.meta_title || '',
        meta_description: initialData.meta_description || modelInfo.meta_description || '',

        context_length: initialData.context_length ? String(initialData.context_length) : '',
        knowledge_cutoff: initialData.knowledge_cutoff || '',
        modality: arch.modality || '',
        tokenizer: arch.tokenizer || '',
        input_modalities: Array.isArray(arch.input_modalities) ? arch.input_modalities : [],
        output_modalities: Array.isArray(arch.output_modalities) ? arch.output_modalities : [],

        benchmarks: bench
      });

      setBenchmarksRawJson(JSON.stringify(bench, null, 2));
    }
  }, [initialData]);

  const addCustomTopScore = () => {
    setCustomTopScores(prev => [
      ...prev,
      { id: `top-score-${Date.now()}-${Math.random()}`, key: '', value: '' }
    ]);
  };

  const removeCustomTopScore = (id: string) => {
    setCustomTopScores(prev => prev.filter(item => item.id !== id));
  };

  const updateCustomTopScore = (id: string, field: 'key' | 'value', val: string) => {
    setCustomTopScores(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
  };

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    return true;
  }, [formData, initialData]);

  const validate = () => {
    const modelSchema = z.object({
      name: z.string().trim().min(1, 'Model name is required'),
      model_id_slug: z.string().trim()
        .min(1, 'URL slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, numbers, and hyphens only'),
      provider: z.string().trim().min(1, 'Provider is required'),
      context_length: z.string().trim().refine(val => !val || (!isNaN(Number(val)) && Number(val) > 0), 'Context length must be a valid number'),
      site_url: z.string().trim().url('Invalid official site URL').or(z.literal('')),
      news_url: z.string().trim().url('Invalid announcement URL').or(z.literal('')),
      favicon_url: z.string().trim().url('Invalid favicon logo URL').or(z.literal('')),
      meta_title: z.string().trim().max(70, 'Meta title should be under 70 characters').or(z.literal('')),
      meta_description: z.string().trim().max(160, 'Meta description should be under 160 characters').or(z.literal(''))
    });

    const result = modelSchema.safeParse(formData);
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        newErrors[path] = issue.message;
      });
    }

    if (formData.input_modalities.length === 0) {
      newErrors.input_modalities = 'At least one input modality is required';
    }

    if (formData.output_modalities.length === 0) {
      newErrors.output_modalities = 'At least one output modality is required';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setHasArchitecture(true);
      scrollToError(newErrors);
      return false;
    }
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'name' && (!initialData || !prev.model_id_slug)) {
        nextData.model_id_slug = slugify(value);
      }
      return nextData;
    });

    if (errors[name] || (name === 'name' && errors['model_id_slug'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'name') delete newErrs['model_id_slug'];
        return newErrs;
      });
    }
  };

  const handleModalityToggle = (type: 'input' | 'output', value: string) => {
    setFormData(prev => {
      const list = type === 'input' ? prev.input_modalities : prev.output_modalities;
      const updated = list.includes(value)
        ? list.filter(item => item !== value)
        : [...list, value];

      const newInputMods = type === 'input' ? updated : prev.input_modalities;
      const newOutputMods = type === 'output' ? updated : prev.output_modalities;

      const inputStr = newInputMods.join('+');
      const outputStr = newOutputMods.join('+');

      let autoModality = '';
      if (inputStr && outputStr) {
        autoModality = `${inputStr}->${outputStr}`;
      } else if (inputStr) {
        autoModality = inputStr;
      } else if (outputStr) {
        autoModality = outputStr;
      }

      return {
        ...prev,
        [type === 'input' ? 'input_modalities' : 'output_modalities']: updated,
        modality: autoModality
      };
    });

    const errKey = type === 'input' ? 'input_modalities' : 'output_modalities';
    if (errors[errKey]) {
      setErrors(prev => { const n = { ...prev }; delete n[errKey]; return n; });
    }
  };

  // Benchmark Variant Handlers
  const addBenchmarkVariant = () => {
    const newVariant = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `variant-${Date.now()}`,
      variant_key: '',
      variant_name: '',
      model_name: '',
      pricing: {
        price_1m_input_tokens: null,
        price_1m_output_tokens: null,
        price_1m_blended_3_to_1: null,
        price_1m_cache_hit_tokens: null,
        price_1m_cache_write_tokens: null
      },
      evaluations: {
        hle: null,
        lcr: null,
        aime: null,
        aime_25: null,
        gpqa: null,
        tau2: null,
        tau_banking: null,
        ifbench: null,
        scicode: null,
        math_500: null,
        mmlu_pro: null,
        livecodebench: null,
        terminalbench_hard: null,
        terminalbench_v2_1: null,
        artificial_analysis_math_index: null,
        artificial_analysis_coding_index: null,
        artificial_analysis_agentic_index: null,
        artificial_analysis_intelligence_index: null
      },
      performance: {
        median_output_tokens_per_second: null,
        median_time_to_first_answer_token: null,
        median_time_to_first_token_seconds: null,
        median_end_to_end_response_time_seconds: null
      }
    };
    setFormData(prev => {
      const updated = [...prev.benchmarks, newVariant];
      setBenchmarksRawJson(JSON.stringify(updated, null, 2));
      return { ...prev, benchmarks: updated };
    });
  };

  const removeBenchmarkVariant = (index: number) => {
    setFormData(prev => {
      const updated = prev.benchmarks.filter((_, i) => i !== index);
      setBenchmarksRawJson(JSON.stringify(updated, null, 2));
      return { ...prev, benchmarks: updated };
    });
  };

  const updateBenchmarkVariant = (index: number, path: string, value: any) => {
    setFormData(prev => {
      const updated = [...prev.benchmarks];
      const target = JSON.parse(JSON.stringify(updated[index] || {}));
      const keys = path.split('.');
      let current = target;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }

      let parsedVal: any = value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') {
          parsedVal = null;
        } else if (!isNaN(Number(trimmed)) && path !== 'variant_key' && path !== 'variant_name' && path !== 'model_name') {
          parsedVal = Number(trimmed);
        }
      }

      current[keys[keys.length - 1]] = parsedVal;
      updated[index] = target;
      setBenchmarksRawJson(JSON.stringify(updated, null, 2));
      return { ...prev, benchmarks: updated };
    });
  };

  const handleRawJsonChange = (val: string) => {
    setBenchmarksRawJson(val);
    const trimmed = val.trim();
    if (!trimmed || trimmed === '[]') {
      setFormData(prev => ({ ...prev, benchmarks: [] }));
      setJsonError(null);
      return;
    }

    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        setFormData(prev => ({ ...prev, benchmarks: parsed }));
        setJsonError(null);
      } else {
        setJsonError('JSON must be an array of benchmark objects [ {...} ]');
      }
    } catch (e: any) {
      setJsonError(e.message || 'Invalid JSON format');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      setErrors({});

      const architecturePayload = hasArchitecture ? {
        modality: formData.modality,
        tokenizer: formData.tokenizer,
        input_modalities: formData.input_modalities,
        output_modalities: formData.output_modalities
      } : null;

      // Build top_scores payload
      const topScoresObj: Record<string, any> = {};
      if (hasTopScores) {
        Object.entries(presetTopScores).forEach(([k, v]) => {
          const trimmedVal = String(v).trim();
          if (!trimmedVal) return;
          topScoresObj[k] = (!isNaN(Number(trimmedVal)) && trimmedVal !== '') ? Number(trimmedVal) : trimmedVal;
        });
        customTopScores.forEach(entry => {
          const k = entry.key.trim();
          if (!k) return;
          let v: any = entry.value.trim();
          if (v !== '' && !isNaN(Number(v))) v = Number(v);
          topScoresObj[k] = v;
        });
      }

      // Build model_info object to preserve legacy / modal fields
      const modelInfoPayload = {
        ...(initialData?.model_info || {}),
        model_name: formData.name,
        overview: formData.review || null,
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null
      };

      await handleSave({
        name: formData.name,
        model_id_slug: formData.model_id_slug,
        slug: formData.model_id_slug,
        provider: formData.provider,
        release_date: formData.release_date ? new Date(formData.release_date).toISOString() : null,
        site_url: formData.site_url || null,
        news_url: formData.news_url || null,
        favicon_url: formData.favicon_url || null,
        status: formData.status,
        model_info: modelInfoPayload,
        context_length: formData.context_length ? Number(formData.context_length) : null,
        knowledge_cutoff: formData.knowledge_cutoff || null,
        architecture: (hasArchitecture || formData.modality || formData.tokenizer || formData.input_modalities.length > 0 || formData.output_modalities.length > 0) ? architecturePayload : null,
        benchmarks: (hasBenchmarks || formData.benchmarks.length > 0) ? formData.benchmarks : [],
        top_scores: Object.keys(topScoresObj).length > 0 ? topScoresObj : null
      });
    } catch (err: any) {
      setErrors({ submit: err?.message || 'An error occurred while saving model.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelClass = "saas-label";

  return (
    <form onSubmit={handleSubmit} noValidate className={`saas-form space-y-8 pb-10 transition-opacity duration-200 ${isBusy ? 'opacity-50 pointer-events-none select-none' : ''}`}>
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {errors.submit ? 'Save Failed' : 'Validation Alert'}
          </AlertTitle>
          <AlertDescription>
            {errors.submit ? (
              <p className="font-semibold">{errors.submit}</p>
            ) : (
              <p>
                There are {Object.keys(errors).filter(k => k !== 'submit').length} fields that require your attention:{' '}
                <span className="font-bold ml-1">
                  {Object.keys(errors).filter(k => k !== 'submit').map(key => key.replace(/_/g, ' ')).join(', ')}
                </span>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Model Identity & Provider Section */}
      <CollapsibleSection
        id="model_identity_section"
        title={initialData ? 'Edit AI Model' : 'New AI Model'}
        description="Configure primary model identity, slug, provider, and release date."
        hasErrors={!!(errors.name || errors.model_id_slug || errors.provider)}
        headerActions={
          <Badge variant={getFormStatusVariant(formData.status)}>
            {formData.status}
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className={labelClass}>Model Name <span className="saas-label-required">*</span></label>
            <Input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro"
              className={errors.name ? 'saas-input-error' : ''}
              required
              suppressHydrationWarning
            />
            {errors.name && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>URL Slug <span className="saas-label-required">*</span></label>
            <Input
              type="text"
              name="model_id_slug"
              value={formData.model_id_slug}
              onChange={handleChange}
              placeholder="gpt-4o"
              className={errors.model_id_slug ? 'saas-input-error' : ''}
              required
              suppressHydrationWarning
            />
            {errors.model_id_slug && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.model_id_slug}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Provider Name <span className="saas-label-required">*</span></label>
            <Input
              type="text"
              name="provider"
              value={formData.provider}
              onChange={handleChange}
              placeholder="e.g. OpenAI, Anthropic, Google, Meta"
              className={errors.provider ? 'saas-input-error' : ''}
              required
              suppressHydrationWarning
            />
            {errors.provider && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.provider}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Release Date</label>
            <DateField
              name="release_date"
              value={formData.release_date}
              onChange={(value) => handleChange({ target: { name: 'release_date', value } } as React.ChangeEvent<HTMLInputElement>)}
              suppressHydrationWarning
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className={labelClass}>Status</label>
            <Select
              name="status"
              value={formData.status}
              onChange={(val) => handleChange({ target: { name: 'status', value: val } } as any)}
              className="h-10 font-semibold"
              suppressHydrationWarning
            >
              <option value="show">Show</option>
              <option value="hide">Hide</option>
              <option value="delete">Delete</option>
            </Select>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Overview & Description Section */}
      <CollapsibleSection
        id="model_overview_section"
        title="Overview & Description"
        description="Detailed breakdown and SEO metadata."
        hasErrors={!!(errors.meta_title || errors.meta_description)}
      >
        <div className="space-y-5">
          <div className="space-y-1">
            <label className={labelClass}>Model Overview</label>
            <RichTextEditor
              content={formData.review}
              onChange={(html) => setFormData(prev => ({ ...prev, review: html }))}
              placeholder="GPT-4o ('o' for 'omni') is OpenAI's flagship model designed to accept any combination of text, audio, image, and video input..."
              name="review"
              showFormatButton={false}
              onBusyChange={setIsRichTextUploading}
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Meta Title</label>
            <Input
              type="text"
              name="meta_title"
              value={formData.meta_title}
              onChange={handleChange}
              placeholder="e.g. GPT-4o: Architecture, Benchmarks & Features"
              className={errors.meta_title ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.meta_title && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.meta_title}
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
              placeholder="Compelling search result snippet for this model..."
              className={errors.meta_description ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.meta_description && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.meta_description}
              </p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Technical Architecture & Specs Section */}
      <CollapsibleSection
        id="model_architecture_section"
        title="Technical Architecture & Specs"
        description="Specify context length, knowledge cutoff date, tokenizer, and input/output modalities."
        hasErrors={!!(errors.context_length || errors.input_modalities || errors.output_modalities)}
        defaultOpen={true}
        isOpen={hasArchitecture}
        onToggle={(open) => setHasArchitecture(open)}
      >
        {hasArchitecture && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className={labelClass}>Context Length (Tokens)</label>
                <Input
                  type="number"
                  name="context_length"
                  value={formData.context_length}
                  onChange={handleChange}
                  placeholder="e.g. 128000 or 1000000"
                  className={errors.context_length ? 'saas-input-error' : ''}
                  suppressHydrationWarning
                />
                {errors.context_length && (
                  <p className="saas-error-message">
                    <AlertTriangle size={11} /> {errors.context_length}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Knowledge Cutoff Date</label>
                <Input
                  type="text"
                  name="knowledge_cutoff"
                  value={formData.knowledge_cutoff}
                  onChange={handleChange}
                  placeholder="e.g. Oct 2023 or April 2024"
                  suppressHydrationWarning
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Modality Format</label>
                <Input
                  type="text"
                  name="modality"
                  value={formData.modality}
                  onChange={handleChange}
                  placeholder="e.g. text+image+file->text"
                  suppressHydrationWarning
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Tokenizer Name</label>
                <Input
                  type="text"
                  name="tokenizer"
                  value={formData.tokenizer}
                  onChange={handleChange}
                  placeholder="e.g. Claude, Tiktoken, Llama3"
                  suppressHydrationWarning
                />
              </div>
            </div>

            {/* Modality Multi-Selects */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[var(--border-color)]">
              <div className="space-y-2">
                <label className={labelClass}>Input Modalities <span className="saas-label-required">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {MODALITY_OPTIONS.map(mod => {
                    const selected = formData.input_modalities.includes(mod);
                    return (
                      <button
                        type="button"
                        key={`input-${mod}`}
                        onClick={() => handleModalityToggle('input', mod)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${selected ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-color)]'}`}
                      >
                        {selected ? '✓ ' : '+ '}{mod}
                      </button>
                    );
                  })}
                </div>
                {errors.input_modalities && (
                  <p className="saas-error-message">
                    <AlertTriangle size={11} /> {errors.input_modalities}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Output Modalities <span className="saas-label-required">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {MODALITY_OPTIONS.map(mod => {
                    const selected = formData.output_modalities.includes(mod);
                    return (
                      <button
                        type="button"
                        key={`output-${mod}`}
                        onClick={() => handleModalityToggle('output', mod)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${selected ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-color)]'}`}
                      >
                        {selected ? '✓ ' : '+ '}{mod}
                      </button>
                    );
                  })}
                </div>
                {errors.output_modalities && (
                  <p className="saas-error-message">
                    <AlertTriangle size={11} /> {errors.output_modalities}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 4. Benchmarks & Pricing Variants Section */}
      <CollapsibleSection
        id="model_benchmarks_section"
        title="Benchmarks & Performance Variants"
        description="Add multiple benchmark evaluation records, pricing tiers, and performance stats."
        hasErrors={false}
        defaultOpen={false}
        isOpen={hasBenchmarks}
        onToggle={(open) => setHasBenchmarks(open)}
      >
        {hasBenchmarks && (
          <div className="space-y-6">
            {/* Top Toolbar with Segmented Control Tab */}
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  View Mode:
                </span>
                <div className="inline-flex p-1 bg-[var(--bg-elevated)]/60 rounded-xl border border-[var(--border-color)] shadow-inner">
                  <button
                    type="button"
                    onClick={() => setBenchmarkTab('visual')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${benchmarkTab === 'visual'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <LayoutGrid size={13} /> Visual Fields
                  </button>
                  <button
                    type="button"
                    onClick={() => setBenchmarkTab('json')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${benchmarkTab === 'json'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <Code size={13} /> Raw JSON Mode
                  </button>
                </div>
              </div>

              {formData.benchmarks.length > 0 && benchmarkTab === 'visual' && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={addBenchmarkVariant}
                  className="h-7 px-3 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 font-bold"
                >
                  <Plus size={14} /> Add Variant
                </Button>
              )}
            </div>

            {benchmarkTab === 'json' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Raw Benchmarks JSON Array</label>
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">{"Paste array of variant objects `[ {...} ]`"}</span>
                </div>
                <Textarea
                  value={benchmarksRawJson}
                  onChange={(e) => handleRawJsonChange(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="Paste JSON array..."
                  suppressHydrationWarning
                />
                {jsonError && (
                  <p className="saas-error-message">
                    <AlertTriangle size={11} /> {jsonError}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {formData.benchmarks.length === 0 ? (
                  <div className="p-8 text-center bg-[var(--bg-elevated)]/20 border border-dashed border-[var(--border-color)] rounded-2xl space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto border border-zinc-200 dark:border-zinc-700">
                      <LayoutGrid size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">No Benchmark Variants</h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Add performance evaluation metrics, pricing tiers, and indices for this model.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addBenchmarkVariant}
                      className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold text-xs uppercase tracking-wider"
                    >
                      <Plus size={14} /> Add First Variant
                    </Button>
                  </div>
                ) : (
                  formData.benchmarks.map((bench, idx) => (
                    <div key={bench.id || idx} className="p-5 bg-[var(--bg-elevated)]/30 border border-[var(--border-color)] rounded-2xl space-y-5 relative group">
                      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-zinc-900/10 dark:bg-zinc-100/10 text-zinc-900 dark:text-zinc-100 text-xs font-bold flex items-center justify-center border border-zinc-900/20 dark:border-zinc-100/20">
                            {idx + 1}
                          </span>
                          <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            Variant: {bench.variant_name || bench.variant_key || `Variant ${idx + 1}`}
                          </h4>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => removeBenchmarkVariant(idx)}
                          className="h-7 px-2.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                          title="Remove Variant"
                        >
                          <Trash2 size={13} /> Remove
                        </Button>
                      </div>

                      {/* 1. Basic Variant Identification */}
                      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className={labelClass}>Variant Key</label>
                            <Input
                              type="text"
                              value={bench.variant_key || ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'variant_key', e.target.value)}
                              placeholder="e.g. default, reasoning, instruct"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div className="space-y-1">
                            <label className={labelClass}>Variant Name</label>
                            <Input
                              type="text"
                              value={bench.variant_name || ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'variant_name', e.target.value)}
                              placeholder="e.g. Default"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div className="space-y-1">
                            <label className={labelClass}>Model Variant Name</label>
                            <Input
                              type="text"
                              value={bench.model_name || ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'model_name', e.target.value)}
                              placeholder="e.g. Nex-N2-Pro"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      </div>

                      {/* 2. Pricing Fields (5 Fields) */}
                      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Input 1M ($)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.pricing?.price_1m_input_tokens ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'pricing.price_1m_input_tokens', e.target.value)}
                              placeholder="e.g. 0.5"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Output 1M ($)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.pricing?.price_1m_output_tokens ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'pricing.price_1m_output_tokens', e.target.value)}
                              placeholder="e.g. 2.5"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Blended 3:1 ($)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.pricing?.price_1m_blended_3_to_1 ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'pricing.price_1m_blended_3_to_1', e.target.value)}
                              placeholder="e.g. 1.0"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Cache Hit 1M ($)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.pricing?.price_1m_cache_hit_tokens ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'pricing.price_1m_cache_hit_tokens', e.target.value)}
                              placeholder="e.g. 0.25"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Cache Write 1M ($)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.pricing?.price_1m_cache_write_tokens ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'pricing.price_1m_cache_write_tokens', e.target.value)}
                              placeholder="e.g. 0.5"
                              className="h-9 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      </div>

                      {/* 3. Evaluations Fields (18 Fields) */}
                      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                          {[
                            { key: 'hle', label: 'HLE' },
                            { key: 'lcr', label: 'LCR' },
                            { key: 'aime', label: 'AIME' },
                            { key: 'aime_25', label: 'AIME 25' },
                            { key: 'gpqa', label: 'GPQA' },
                            { key: 'tau2', label: 'TAU2' },
                            { key: 'tau_banking', label: 'TAU Banking' },
                            { key: 'ifbench', label: 'IF Bench' },
                            { key: 'scicode', label: 'Sci Code' },
                            { key: 'math_500', label: 'Math 500' },
                            { key: 'mmlu_pro', label: 'MMLU Pro' },
                            { key: 'livecodebench', label: 'Live Code Bench' },
                            { key: 'terminalbench_hard', label: 'Terminal Bench Hard' },
                            { key: 'terminalbench_v2_1', label: 'Terminal Bench V2.1' },
                            { key: 'artificial_analysis_math_index', label: 'AA Math Index' },
                            { key: 'artificial_analysis_coding_index', label: 'AA Coding Index' },
                            { key: 'artificial_analysis_agentic_index', label: 'AA Agentic Index' },
                            { key: 'artificial_analysis_intelligence_index', label: 'AA Intelligence Index' }
                          ].map(item => (
                            <div key={item.key}>
                              <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider truncate block" title={item.label}>{item.label}</label>
                              <Input
                                type="number"
                                step="any"
                                value={bench.evaluations?.[item.key] ?? ''}
                                onChange={(e) => updateBenchmarkVariant(idx, `evaluations.${item.key}`, e.target.value)}
                                placeholder="0.0"
                                className="h-8 text-xs"
                                suppressHydrationWarning
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 4. Performance Fields (4 Fields) */}
                      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Output Tokens / Sec</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.performance?.median_output_tokens_per_second ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'performance.median_output_tokens_per_second', e.target.value)}
                              placeholder="e.g. 102.75"
                              className="h-8 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Time to 1st Answer Token (s)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.performance?.median_time_to_first_answer_token ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'performance.median_time_to_first_answer_token', e.target.value)}
                              placeholder="e.g. 20.65"
                              className="h-8 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Time to 1st Token (s)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.performance?.median_time_to_first_token_seconds ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'performance.median_time_to_first_token_seconds', e.target.value)}
                              placeholder="e.g. 1.19"
                              className="h-8 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">End-to-End Response (s)</label>
                            <Input
                              type="number"
                              step="any"
                              value={bench.performance?.median_end_to_end_response_time_seconds ?? ''}
                              onChange={(e) => updateBenchmarkVariant(idx, 'performance.median_end_to_end_response_time_seconds', e.target.value)}
                              placeholder="e.g. 28.85"
                              className="h-8 text-xs"
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* 5. Top Scores & Capability Ratings Section */}
      <CollapsibleSection
        id="model_top_scores_section"
        title="Top Scores & Capability Ratings"
        description="Add key capability ratings (e.g. Reasoning, Coding, Math, Vision, Agents) as top score metrics."
        hasErrors={false}
        isOpen={hasTopScores}
        onToggle={(open) => setHasTopScores(open)}
        hideChevron={true}
        headerActions={
          <div className="flex items-center gap-3">
            <Switch
              checked={hasTopScores}
              onCheckedChange={setHasTopScores}
            />
          </div>
        }
      >
        {hasTopScores && (
          <div className="space-y-6 animate-fade-in">
            {/* Preset Standard Top Scores */}
            <div className="p-5 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/20 space-y-4">
              <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Standard Capability Ratings
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {PRESET_TOP_SCORE_KEYS.map((preset) => (
                  <div key={preset.key} className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      {preset.label}
                    </label>
                    <Input
                      type="text"
                      value={presetTopScores[preset.key] || ''}
                      onChange={(e) => setPresetTopScores(prev => ({ ...prev, [preset.key]: e.target.value }))}
                      placeholder="e.g. 0.8 or 85"
                      className="h-9 text-xs"
                      suppressHydrationWarning
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Top Scores */}
            <div className="p-5 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/20 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Custom Capability Scores
                </h4>
              </div>

              <div className="space-y-3">
                {customTopScores.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic">No custom top score ratings added.</p>
                ) : (
                  customTopScores.map((entry) => (
                    <div key={entry.id} className="p-3 border border-[var(--border-color)] rounded-xl bg-[var(--bg-surface)] flex items-center gap-3 relative group">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Metric Key</label>
                          <Input
                            type="text"
                            value={entry.key}
                            onChange={(e) => updateCustomTopScore(entry.id, 'key', e.target.value)}
                            placeholder="e.g. robotics, 3d, legal"
                            className="h-9 text-xs"
                            suppressHydrationWarning
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase">Score / Rating Value</label>
                          <Input
                            type="text"
                            value={entry.value}
                            onChange={(e) => updateCustomTopScore(entry.id, 'value', e.target.value)}
                            placeholder="e.g. 0.9 or 95"
                            className="h-9 text-xs"
                            suppressHydrationWarning
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomTopScore(entry.id)}
                        className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                        title="Delete Entry"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={addCustomTopScore}
                  className="border-dashed font-bold"
                >
                  <Plus size={14} /> Add Custom Top Score
                </Button>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. Official Links & Media Section */}
      <CollapsibleSection
        id="model_links_section"
        title="Links & Media Assets"
        description="Web links to official provider website, announcement article, and icon."
        hasErrors={!!(errors.site_url || errors.news_url || errors.favicon_url)}
      >
        <div className="space-y-5">
          <div className="space-y-1">
            <label className={labelClass}>Official Site URL</label>
            <Input
              type="url"
              name="site_url"
              value={formData.site_url}
              onChange={handleChange}
              placeholder="https://openai.com/index/hello-gpt-4o/"
              className={errors.site_url ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.site_url && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.site_url}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Announcement / News URL</label>
            <Input
              type="url"
              name="news_url"
              value={formData.news_url}
              onChange={handleChange}
              placeholder="https://openai.com/news/gpt-4o-announcement"
              className={errors.news_url ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.news_url && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.news_url}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Favicon URL</label>
            <Input
              type="url"
              name="favicon_url"
              value={formData.favicon_url}
              onChange={handleChange}
              placeholder="https://openai.com/favicon.ico"
              className={errors.favicon_url ? 'saas-input-error' : ''}
              suppressHydrationWarning
            />
            {errors.favicon_url && (
              <p className="saas-error-message">
                <AlertTriangle size={11} /> {errors.favicon_url}
              </p>
            )}
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
              <span>{initialData ? 'Updating Model...' : 'Creating Model...'}</span>
            </>
          ) : (
            initialData ? 'Update Model' : 'Create Model'
          )}
        </Button>
      </div>
    </form>
  );
}
