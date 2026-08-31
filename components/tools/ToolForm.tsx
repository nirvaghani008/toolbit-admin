'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { createCategoryAction } from '@/app/admin/tools/categories/actions';
import { createTagAction } from '@/app/admin/tools/tags/actions';
import KeywordTagInput from '../categories/KeywordTagInput';
import RichTextEditor from '../common/RichTextEditor';
import {
  Plus,
  Upload,
  AlertCircle,
  Globe,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Camera,
  Image as ImageIcon,
  DollarSign,
  Layers,
  ChevronDown,
  Check,
  X,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { uploadImageFile } from '@/lib/image-upload';
import { scrollToError, slugify } from '@/lib/form-utils';
import {
  checkToolSiteUrlAvailabilityAction,
  extractToolFieldsAction,
} from '@/app/admin/tools/actions';

import {
  validateToolSiteUrlFormat,
  formatCanonicalSiteUrl,
  deriveToolNameFromUrl,
} from '@/lib/url-normalize';
import {
  getToolSubmissionStatus,
  getToolSubmissionStatusOption,
  TOOL_SUBMISSION_STATUS_OPTIONS,
} from '@/lib/tool-submissions';
import { TOOL_STATUS_OPTIONS } from '@/components/tools/ToolTable';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import CollapsibleSection from '../common/CollapsibleSection';
import LaunchSchedulePicker from '../common/LaunchSchedulePicker';

const btnNeutralClass = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl transition-all shadow-2xs cursor-pointer";
const btnProClass = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl transition-all shadow-2xs cursor-pointer";
const btnConClass = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl transition-all shadow-2xs cursor-pointer";

interface KeyFeature {
  id: string;
  name: string;
  description: string;
}

interface Faq {
  id: string;
  question: string;
  answer: string;
}

interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

interface Plan {
  id: string;
  name: string;
  limits: string[];
  features: string[];
  isPopular: boolean;
  priceText: string;
  priceAmount: string;
  billingCycle: string;
  isEnterprise: boolean;
  isCustomPricing: boolean;
}

interface ToolFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void> | void;
  onCancel: () => void;
  isSubmission?: boolean;
  isLoading?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}

const extractScheduledDate = (data: any, inf: any): string | null => {
  const raw = data?.scheduled_launch_date ||
    data?.scheduledLaunchDate ||
    inf?.scheduled_launch_date ||
    inf?.scheduledLaunchDate ||
    null;
  if (!raw) return null;
  const str = String(raw).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch {}
  return null;
};

export default function ToolForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmission = false,
  isLoading = false,
  onBusyChange,
}: ToolFormProps) {
  const info = initialData?.tool_info || {};

  // Detect model type: 41954 (New) has 'overview', 41889/41953 (Old) has 'fullDescription'
  const [modelType, setModelType] = useState<'old' | 'new'>(
    initialData ? (info.overview ? 'new' : 'old') : 'new'
  );

  const [formData, setFormData] = useState({
    tool_url: initialData?.tool_url || '',
    tool_site_url: initialData?.tool_site_url || '',
    tool_screenshot_url: initialData?.tool_screenshot_url || '',
    favicon_url: initialData?.favicon_url || '',
    status: isSubmission
      ? getToolSubmissionStatus(initialData?.status)
      : initialData?.status || 'hide',
    full_name: initialData?.full_name || '',
    business_email: initialData?.business_email || '',
    is_verified: initialData?.is_verified ?? false,
    tool_domain: initialData?.tool_domain || '',
    scheduled_launch_date: extractScheduledDate(initialData, info),

    // Fields inside tool_info
    toolName: info.toolName || '',
    tagline: info.tagline || '',
    overview: info.overview || '',
    fullDescription: info.fullDescription || '',
    shortDescription: info.shortDescription || info.aboutTool || info.about || '',
    pricingModel: info.pricingModel || info.pricing?.model || 'Free',
    isAIToolOrRelatedSite: info.isAIToolOrRelatedSite ?? false,
    isAIWebsite: info.isAIWebsite ?? false,

    // New Pricing fields
    currency: info.pricing?.currency || null,
    hasPricing: info.pricing?.hasPricing ?? false,
    hasFreePlan: info.pricing?.hasFreePlan ?? false,
    hasFreeTrial: info.pricing?.hasFreeTrial ?? false,

    // Starting Price fields
    sp_currency: info.pricing?.startingPrice?.currency || null,
    sp_planName: info.pricing?.startingPrice?.planName || '',
    sp_priceText: info.pricing?.startingPrice?.priceText || '',
    sp_priceAmount: info.pricing?.startingPrice?.priceAmount || '',
    sp_billingCycle: info.pricing?.startingPrice?.billingCycle || '',
    discounts: Array.isArray(info.pricing?.discounts) ? info.pricing.discounts.join(', ') : (info.pricing?.discounts || ''),
    billingCycles: Array.isArray(info.pricing?.billingCycles) ? info.pricing.billingCycles.join(', ') : (info.pricing?.billingCycles || ''),

    // Important Links
    homepage: info.importantLinks?.homepage || info.importantLinks?.website || '',
    pricing_url: info.importantLinks?.pricing || '',
    blog: info.importantLinks?.blog || '',
    docs: info.importantLinks?.docs || '',
    login: info.importantLinks?.login || '',
    contact: info.importantLinks?.contact || '',
    support: info.importantLinks?.support || '',
    ios: info.importantLinks?.ios || '',
    android: info.importantLinks?.android || '',
  });

  const parseBillingCycles = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    if (typeof val === 'string' && val.trim()) {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const [selectedBillingCycles, setSelectedBillingCycles] = useState<string[]>(parseBillingCycles(info.pricing?.billingCycles));
  const [selectedCategories, setSelectedCategories] = useState<string[]>(info.categories || []);
  const [selectedTags, setSelectedTags] = useState<string[]>(info.tags || info.hashtags || []);
  const [pros, setPros] = useState<string[]>(info.prosAndCons?.pros || []);
  const [cons, setCons] = useState<string[]>(info.prosAndCons?.cons || []);
  const [targetAudience, setTargetAudience] = useState<string[]>(info.targetAudience || []);
  const [integrations, setIntegrations] = useState<string[]>(info.integrations || []);
  const [features, setFeatures] = useState<KeyFeature[]>(
    info.keyFeatures?.map((f: any, i: number) => ({
      id: i.toString(),
      name: typeof f === 'string' ? f : (f.name || ''),
      description: f.description || ''
    })) || []
  );

  const [faqs, setFaqs] = useState<Faq[]>(
    info.faq?.map((f: any, i: number) => ({ id: i.toString(), ...f })) || []
  );

  const initialSocial = info.importantLinks?.socialMedia ?
    Object.entries(info.importantLinks.socialMedia)
      .filter(([, url]) => url !== null && url !== '')
      .map(([platform, url]) => ({ id: platform, platform, url: url as string }))
    : [];
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(initialSocial);

  const [plans, setPlans] = useState<Plan[]>(
    info.pricing?.plans?.map((p: any, i: number) => ({
      id: i.toString(),
      ...p,
      limits: Array.isArray(p.limits) ? p.limits : [],
      features: Array.isArray(p.features) ? p.features : [],
    })) || []
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialStateRef = useRef<any>(null);

  const screenshotFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [isRichTextUploading, setIsRichTextUploading] = useState(false);

  // AI Worker Extraction States
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractingFields, setExtractingFields] = useState<string[]>([]);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionSuccess, setExtractionSuccess] = useState<string | null>(null);
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [selectedExtractTargets, setSelectedExtractTargets] = useState<{
    favicon: boolean;
    screenshot: boolean;
    tool_info: boolean;
    pricing: boolean;
  }>({
    favicon: true,
    screenshot: true,
    tool_info: true,
    pricing: true,
  });

  const localBusy = isSubmitting || uploadingScreenshot || uploadingFavicon || isRichTextUploading || isExtracting;
  const isBusy = localBusy || isLoading;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);


  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingScreenshot(true);
      const url = await uploadImageFile(file, 'post');
      setFormData(prev => ({ ...prev, tool_screenshot_url: url }));
      if (errors.tool_screenshot_url) {
        setErrors(prev => {
          const n = { ...prev };
          delete n.tool_screenshot_url;
          return n;
        });
      }
    } catch (err: any) {
      console.error('Failed to upload screenshot to CDN:', err);
      setErrors(prev => ({ ...prev, tool_screenshot_url: 'Failed to upload image to CDN' }));
    } finally {
      setUploadingScreenshot(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingFavicon(true);
      const url = await uploadImageFile(file, 'post');
      setFormData(prev => ({ ...prev, favicon_url: url }));
      if (errors.favicon_url) {
        setErrors(prev => {
          const n = { ...prev };
          delete n.favicon_url;
          return n;
        });
      }
    } catch (err: any) {
      console.error('Failed to upload favicon to CDN:', err);
      setErrors(prev => ({ ...prev, favicon_url: 'Failed to upload icon to CDN' }));
    } finally {
      setUploadingFavicon(false);
      if (e.target) e.target.value = '';
    }
  };

  // Visibility states
  const [showFaqs, setShowFaqs] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showPros, setShowPros] = useState(false);
  const [showCons, setShowCons] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showSocials, setShowSocials] = useState(false);

  // Tool site URL validation and duplicate check states
  const [isCheckingSiteUrl, setIsCheckingSiteUrl] = useState(false);
  const [siteUrlNotice, setSiteUrlNotice] = useState<{
    type: 'error' | 'warning' | 'info' | 'success';
    message: string;
    toolId?: number;
    toolSlug?: string;
    status?: string;
  } | null>(null);
  const [isDuplicateConflict, setIsDuplicateConflict] = useState(false);
  const lastCheckedUrlRef = useRef<string | null>(initialData?.tool_site_url || null);

  useEffect(() => {
    if (initialData) {
      const i = initialData.tool_info || {};
      const type = i.overview ? 'new' : 'old';
      setModelType(type);

      const initialSocial = i.importantLinks?.socialMedia ?
        Object.entries(i.importantLinks.socialMedia)
          .filter(([, url]) => url !== null && url !== '')
          .map(([platform, url]) => ({ id: platform, platform, url: url as string }))
        : [];

      const loadedFormData = {
        tool_url: initialData.tool_url || '',
        tool_site_url: initialData.tool_site_url || '',
        tool_screenshot_url: initialData.tool_screenshot_url || '',
        favicon_url: initialData.favicon_url || '',
        status: initialData.status || 'hide',
        full_name: initialData.full_name || '',
        business_email: initialData.business_email || '',
        is_verified: initialData.is_verified ?? false,
        tool_domain: initialData.tool_domain || '',
        scheduled_launch_date: extractScheduledDate(initialData, i),
        toolName: i.toolName || '',
        tagline: i.tagline || '',
        overview: i.overview || '',
        fullDescription: i.fullDescription || '',
        shortDescription: i.shortDescription || i.aboutTool || i.about || '',
        pricingModel: i.pricingModel || i.pricing?.model || 'Free',
        isAIToolOrRelatedSite: i.isAIToolOrRelatedSite ?? false,
        isAIWebsite: i.isAIWebsite ?? false,
        currency: i.pricing?.currency || null,
        hasPricing: i.pricing?.hasPricing ?? false,
        hasFreePlan: i.pricing?.hasFreePlan ?? false,
        hasFreeTrial: i.pricing?.hasFreeTrial ?? false,
        sp_currency: i.pricing?.startingPrice?.currency || null,
        sp_planName: i.pricing?.startingPrice?.planName || '',
        sp_priceText: i.pricing?.startingPrice?.priceText || '',
        sp_priceAmount: i.pricing?.startingPrice?.priceAmount || '',
        sp_billingCycle: i.pricing?.startingPrice?.billingCycle || '',
        discounts: Array.isArray(i.pricing?.discounts) ? i.pricing.discounts.join(', ') : (i.pricing?.discounts || ''),
        billingCycles: Array.isArray(i.pricing?.billingCycles) ? i.pricing.billingCycles.join(', ') : (i.pricing?.billingCycles || ''),
        homepage: i.importantLinks?.homepage || i.importantLinks?.website || '',
        pricing_url: i.importantLinks?.pricing || '',
        blog: i.importantLinks?.blog || '',
        docs: i.importantLinks?.docs || '',
        login: i.importantLinks?.login || '',
        contact: i.importantLinks?.contact || '',
        support: i.importantLinks?.support || '',
        ios: i.importantLinks?.ios || '',
        android: i.importantLinks?.android || '',
      };

      const loadedCategories = i.categories || [];
      const loadedBillingCycles = parseBillingCycles(i.pricing?.billingCycles);
      setSelectedBillingCycles(loadedBillingCycles);
      const loadedTags = i.tags || i.hashtags || [];
      const loadedPros = i.prosAndCons?.pros || [];
      const loadedCons = i.prosAndCons?.cons || [];
      const loadedTargetAudience = i.targetAudience || [];
      const loadedIntegrations = i.integrations || [];
      const loadedFeatures = i.keyFeatures?.map((f: any, idx: number) => ({
        id: idx.toString(),
        name: typeof f === 'string' ? f : (f.name || ''),
        description: f.description || ''
      })) || [];
      const loadedFaqs = i.faq?.map((f: any, idx: number) => ({ id: idx.toString(), ...f })) || [];
      const loadedPlans = i.pricing?.plans?.map((p: any, idx: number) => ({
        ...p,
        id: idx.toString(),
        priceAmount: p.priceAmount?.toString() || '',
        limits: Array.isArray(p.limits) ? p.limits : [],
        features: Array.isArray(p.features) ? p.features : [],
      })) || [];

      setFormData(loadedFormData);
      setSelectedCategories(loadedCategories);
      setSelectedTags(loadedTags);
      setPros(loadedPros);
      setCons(loadedCons);
      setTargetAudience(loadedTargetAudience);
      setIntegrations(loadedIntegrations);
      setFeatures(loadedFeatures);
      setFaqs(loadedFaqs);
      setPlans(loadedPlans);
      setSocialLinks(initialSocial);

      initialStateRef.current = {
        formData: loadedFormData,
        selectedCategories: loadedCategories,
        selectedTags: loadedTags,
        pros: loadedPros,
        cons: loadedCons,
        targetAudience: loadedTargetAudience,
        integrations: loadedIntegrations,
        features: loadedFeatures,
        faqs: loadedFaqs,
        plans: loadedPlans,
        socialLinks: initialSocial,
        selectedBillingCycles: loadedBillingCycles
      };

      // Auto-expand sections with data
      if (i.faq?.length > 0) setShowFaqs(true);
      if (i.pricing?.plans?.length > 0) setShowPlans(true);
      if (i.keyFeatures?.length > 0) setShowFeatures(true);
      if (i.prosAndCons?.pros?.length > 0) setShowPros(true);
      if (i.prosAndCons?.cons?.length > 0) setShowCons(true);
      if (i.integrations?.length > 0) setShowIntegrations(true);
      if (initialSocial.length > 0) setShowSocials(true);
    }
  }, [initialData]);

  const isDirty = useMemo(() => {
    if (!initialData) return true;
    if (!initialStateRef.current) return false;

    const currentState = {
      formData,
      selectedCategories,
      selectedTags,
      pros,
      cons,
      targetAudience,
      integrations,
      features,
      faqs,
      plans,
      socialLinks,
      selectedBillingCycles
    };

    return JSON.stringify(currentState) !== JSON.stringify(initialStateRef.current);
  }, [formData, selectedCategories, selectedTags, pros, cons, targetAudience, integrations, features, faqs, plans, socialLinks, initialData]);

  const addFaq = () => {
    setFaqs(prev => [...prev, { id: Date.now().toString(), question: '', answer: '' }]);
    setShowFaqs(true);
  };
  const removeFaq = (id: string) => setFaqs(faqs.filter(f => f.id !== id));
  const updateFaq = (id: string, field: 'question' | 'answer', value: string) => {
    setFaqs(faqs.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const addSocial = () => {
    setSocialLinks([...socialLinks, { id: Date.now().toString(), platform: '', url: '' }]);
    setShowSocials(true);
  };
  const removeSocial = (id: string) => {
    setSocialLinks(socialLinks.filter(s => s.id !== id));
    setErrors(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        if (k.startsWith('socialLinks_')) delete copy[k];
      });
      return copy;
    });
  };
  const updateSocial = (id: string, field: 'platform' | 'url', value: string) => {
    setSocialLinks(socialLinks.map(s => s.id === id ? { ...s, [field]: value } : s));
    setErrors(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        if (k.startsWith('socialLinks_')) delete copy[k];
      });
      return copy;
    });
  };

  const addPlan = () => {
    setPlans([...plans, {
      id: Date.now().toString(),
      name: '',
      limits: [],
      features: [],
      isPopular: false,
      priceText: '',
      priceAmount: '',
      billingCycle: 'monthly',
      isEnterprise: false,
      isCustomPricing: false
    }]);
    setShowPlans(true);
  };
  const removePlan = (id: string) => setPlans(plans.filter(p => p.id !== id));
  const updatePlan = (id: string, field: keyof Plan, value: any) => {
    setPlans(plans.map(p => {
      if (p.id !== id) return p;
      const updatedPlan = { ...p, [field]: value };
      if (field === 'priceAmount' || field === 'billingCycle') {
        const amount = field === 'priceAmount' ? value : p.priceAmount;
        const cycle = field === 'billingCycle' ? value : p.billingCycle;
        if (amount) {
          updatedPlan.priceText = `$${amount}${cycle ? '/' + cycle : ''}`;
        }
      }
      return updatedPlan;
    }));
  };

  const addPlanLimit = (planId: string) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, limits: [...(p.limits || []), ''] } : p));
  };
  const updatePlanLimit = (planId: string, index: number, value: string) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, limits: (p.limits || []).map((l, i) => i === index ? value : l) } : p));
  };
  const removePlanLimit = (planId: string, index: number) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, limits: (p.limits || []).filter((_, i) => i !== index) } : p));
  };

  const addPlanFeature = (planId: string) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, features: [...(p.features || []), ''] } : p));
  };
  const updatePlanFeature = (planId: string, index: number, value: string) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, features: (p.features || []).map((f, i) => i === index ? value : f) } : p));
  };
  const removePlanFeature = (planId: string, index: number) => {
    setPlans(plans.map(p => p.id === planId ? { ...p, features: (p.features || []).filter((_, i) => i !== index) } : p));
  };

  const addPro = () => {
    setPros([...pros, '']);
    setShowPros(true);
  };
  const removePro = (index: number) => setPros(pros.filter((_, i) => i !== index));
  const updatePro = (index: number, value: string) => setPros(pros.map((p, i) => i === index ? value : p));

  const addCon = () => {
    setCons([...cons, '']);
    setShowCons(true);
  };
  const removeCon = (index: number) => setCons(cons.filter((_, i) => i !== index));
  const updateCon = (index: number, value: string) => setCons(cons.map((c, i) => i === index ? value : c));

  const addFeature = () => {
    setFeatures([...features, { id: Date.now().toString(), name: '', description: '' }]);
    setShowFeatures(true);
  };
  const removeFeature = (id: string) => setFeatures(features.filter(f => f.id !== id));
  const updateFeature = (id: string, field: 'name' | 'description', value: string) => {
    setFeatures(features.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'toolName' && (!initialData || !prev.tool_url || prev.tool_url === slugify(prev.toolName || ''))) {
        nextData.tool_url = slugify(value);
      }
      return nextData;
    });
    if (errors[name] || (name === 'toolName' && errors['tool_url'])) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[name];
        if (name === 'toolName') delete newErrs['tool_url'];
        return newErrs;
      });
    }
  };

  const addIntegration = () => {
    setIntegrations([...integrations, '']);
    setShowIntegrations(true);
  };
  const removeIntegration = (index: number) => setIntegrations(integrations.filter((_, i) => i !== index));
  const updateIntegration = (index: number, value: string) => setIntegrations(integrations.map((it, i) => i === index ? value : it));

  const verifySiteUrl = async (rawUrl: string, autoFillMetadata = false) => {
    const t = (rawUrl || '').trim();
    if (!t) {
      setSiteUrlNotice(null);
      setIsDuplicateConflict(false);
      lastCheckedUrlRef.current = null;
      return;
    }

    // 1. Syntax / format validation
    const formatValidation = validateToolSiteUrlFormat(t);
    if (!formatValidation.isValid) {
      setErrors(prev => ({
        ...prev,
        tool_site_url: formatValidation.error || 'Invalid Tool Site URL',
      }));
      setSiteUrlNotice(null);
      setIsDuplicateConflict(false);
      lastCheckedUrlRef.current = t;
      return;
    }

    const cleaned = formatValidation.cleaned || formatCanonicalSiteUrl(t);

    // Update form if cleaned format differs
    if (cleaned !== t) {
      setFormData(prev => ({
        ...prev,
        tool_site_url: cleaned,
        tool_domain: formatValidation.domain || prev.tool_domain,
      }));
    } else if (formatValidation.domain && !formData.tool_domain) {
      setFormData(prev => ({ ...prev, tool_domain: formatValidation.domain || prev.tool_domain }));
    }

    // Auto-fill tool name and slug if new tool form and fields are empty
    if (autoFillMetadata && !initialData) {
      const derivedName = deriveToolNameFromUrl(cleaned);
      if (derivedName) {
        setFormData(prev => {
          const next = { ...prev };
          if (!prev.toolName || prev.toolName.trim() === '') {
            next.toolName = derivedName;
          }
          if (!prev.tool_url || prev.tool_url.trim() === '') {
            next.tool_url = slugify(derivedName);
          }
          return next;
        });
        setErrors(prev => {
          const n = { ...prev };
          delete n.toolName;
          delete n.tool_url;
          return n;
        });
      }
    }

    // Prevent repeated checks for the exact same URL if result already exists
    if (lastCheckedUrlRef.current === cleaned && (siteUrlNotice || isDuplicateConflict)) {
      return;
    }
    lastCheckedUrlRef.current = cleaned;

    // Clear previous format error for tool_site_url
    setErrors(prev => {
      const n = { ...prev };
      delete n.tool_site_url;
      return n;
    });

    // 2. Query database via checkToolSiteUrlAvailabilityAction
    setIsCheckingSiteUrl(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await checkToolSiteUrlAvailabilityAction(
        {
          toolSiteUrl: cleaned,
          excludeToolId: isSubmission ? null : initialData?.tool_id || null,
        },
        token
      );

      if (res.success && res.data) {
        const checkData = res.data;
        if (checkData.exists && checkData.type === 'published' && checkData.tool) {
          setIsDuplicateConflict(true);
          setErrors(prev => ({
            ...prev,
            tool_site_url: `This website URL is already in use by "${checkData.tool!.tool_name}".`,
          }));
          setSiteUrlNotice({
            type: 'error',
            message: checkData.message || `Already registered to "${checkData.tool.tool_name}"`,
            toolId: checkData.tool.tool_id,
            toolSlug: checkData.tool.tool_url,
            status: checkData.tool.status,
          });
        } else if (checkData.exists && checkData.type === 'submission' && checkData.submission) {
          setIsDuplicateConflict(false);
          setSiteUrlNotice({
            type: 'warning',
            message: checkData.message || `Notice: Active submission #${checkData.submission.id} exists for this website.`,
            toolId: checkData.submission.id,
            toolSlug: checkData.submission.tool_url,
            status: checkData.submission.status,
          });
        } else {
          setIsDuplicateConflict(false);
          setSiteUrlNotice({
            type: 'success',
            message: 'Website URL is valid and available.',
          });
        }
      } else if (res.error) {
        console.warn('URL availability check warning:', res.error);
      }
    } catch (err: any) {
      console.warn('Error checking URL availability:', err?.message || err);
    } finally {
      setIsCheckingSiteUrl(false);
    }
  };

  const handleSiteUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, tool_site_url: val }));
    setIsDuplicateConflict(false);
    if (errors.tool_site_url) {
      setErrors(prev => {
        const n = { ...prev };
        delete n.tool_site_url;
        return n;
      });
    }
    if (siteUrlNotice) {
      setSiteUrlNotice(null);
    }
  };

  const handleSiteUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.trim()) {
      setTimeout(() => {
        verifySiteUrl(pastedText.trim(), true);
      }, 50);
    }
  };

  const handleSiteUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value;
    verifySiteUrl(val, !initialData);
  };

  /**
   * Selectively extracts fields from the target website using the AI worker.
   */
  const handleExtractFields = async (
    fieldsToExtract: ('favicon' | 'screenshot' | 'tool_info' | 'pricing')[],
    force = true
  ) => {
    const targetUrl = (formData.tool_site_url || '').trim();
    if (!targetUrl) {
      setErrors(prev => ({ ...prev, tool_site_url: 'Please enter a valid website URL first.' }));
      return;
    }

    const val = validateToolSiteUrlFormat(targetUrl);
    if (!val.isValid) {
      setErrors(prev => ({ ...prev, tool_site_url: val.error || 'Invalid website URL format.' }));
      return;
    }

    setIsExtracting(true);
    setExtractingFields(fieldsToExtract);
    setExtractionError(null);
    setExtractionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await extractToolFieldsAction(
        {
          url: targetUrl,
          targetFields: fieldsToExtract,
          existingFaviconUrl: formData.favicon_url,
          existingScreenshotUrl: formData.tool_screenshot_url,
          forceReextract: force,
        },
        token
      );

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to extract website details from AI worker.');
      }

      const { data } = res;

      // 1. Favicon
      if (fieldsToExtract.includes('favicon') && data.favicon_url) {
        setFormData(prev => ({ ...prev, favicon_url: data.favicon_url }));
        setErrors(prev => {
          const copy = { ...prev };
          delete copy.favicon_url;
          return copy;
        });
      }

      // 2. Screenshot
      if (fieldsToExtract.includes('screenshot') && data.tool_screenshot_url) {
        setFormData(prev => ({ ...prev, tool_screenshot_url: data.tool_screenshot_url }));
        setErrors(prev => {
          const copy = { ...prev };
          delete copy.tool_screenshot_url;
          return copy;
        });
      }

      // 3. Tool Details / Info
      if (fieldsToExtract.includes('tool_info') && data.tool_info) {
        const infoData = data.tool_info;

        setFormData(prev => {
          const next = { ...prev };
          if (infoData.toolName && (!prev.toolName || prev.toolName.trim() === '')) {
            next.toolName = infoData.toolName;
            if (!prev.tool_url || prev.tool_url.trim() === '') {
              next.tool_url = slugify(infoData.toolName);
            }
          }
          if (infoData.tagline) next.tagline = infoData.tagline;

          // Map overview / descriptions
          if (infoData.overview) {
            next.overview = infoData.overview;
          } else if (infoData.fullDescription || infoData.shortDescription) {
            const parts = [];
            if (infoData.fullDescription) parts.push(infoData.fullDescription);
            if (infoData.shortDescription && !infoData.fullDescription) parts.push(infoData.shortDescription);
            if (Array.isArray(infoData.keyFeatures) && infoData.keyFeatures.length > 0) {
              parts.push(`### Key Features\n${infoData.keyFeatures.map((f: any) => `- ${typeof f === 'string' ? f : f.name || f.description || ''}`).join('\n')}`);
            }
            if (parts.length > 0) next.overview = parts.join('\n\n');
          }

          if (infoData.shortDescription) next.shortDescription = infoData.shortDescription;
          if (infoData.fullDescription) next.fullDescription = infoData.fullDescription;
          if (infoData.isAIWebsite !== undefined) next.isAIWebsite = infoData.isAIWebsite;
          if (infoData.isAIToolOrRelatedSite !== undefined) next.isAIToolOrRelatedSite = infoData.isAIToolOrRelatedSite;

          // Important links
          if (infoData.importantLinks) {
            if (infoData.importantLinks.homepage || infoData.importantLinks.website) next.homepage = infoData.importantLinks.homepage || infoData.importantLinks.website;
            if (infoData.importantLinks.pricing) next.pricing_url = infoData.importantLinks.pricing;
            if (infoData.importantLinks.blog) next.blog = infoData.importantLinks.blog;
            if (infoData.importantLinks.docs) next.docs = infoData.importantLinks.docs;
            if (infoData.importantLinks.login) next.login = infoData.importantLinks.login;
            if (infoData.importantLinks.contact) next.contact = infoData.importantLinks.contact;
            if (infoData.importantLinks.support) next.support = infoData.importantLinks.support;
            if (infoData.importantLinks.ios) next.ios = infoData.importantLinks.ios;
            if (infoData.importantLinks.android) next.android = infoData.importantLinks.android;
          }

          return next;
        });

        // Categories
        if (Array.isArray(infoData.categories) && infoData.categories.length > 0) {
          setSelectedCategories(Array.from(new Set([...infoData.categories.map((c: any) => String(c).trim()).filter(Boolean)])));
        }

        // Tags
        const rawTags = infoData.tags || infoData.hashtags;
        if (Array.isArray(rawTags) && rawTags.length > 0) {
          setSelectedTags(Array.from(new Set([...rawTags.map((t: any) => String(t).replace(/^#/, '').trim()).filter(Boolean)])));
        }

        // Pros & Cons
        if (infoData.prosAndCons) {
          if (Array.isArray(infoData.prosAndCons.pros)) {
            setPros(infoData.prosAndCons.pros.map(String).filter(Boolean));
            if (infoData.prosAndCons.pros.length > 0) setShowPros(true);
          }
          if (Array.isArray(infoData.prosAndCons.cons)) {
            setCons(infoData.prosAndCons.cons.map(String).filter(Boolean));
            if (infoData.prosAndCons.cons.length > 0) setShowCons(true);
          }
        }

        // Key Features
        if (Array.isArray(infoData.keyFeatures) && infoData.keyFeatures.length > 0) {
          setFeatures(infoData.keyFeatures.map((f: any, idx: number) => ({
            id: (Date.now() + idx).toString(),
            name: typeof f === 'string' ? f : (f.name || ''),
            description: typeof f === 'string' ? '' : (f.description || '')
          })));
          setShowFeatures(true);
        }

        // FAQs
        if (Array.isArray(infoData.faq) && infoData.faq.length > 0) {
          setFaqs(infoData.faq.map((item: any, idx: number) => ({
            id: (Date.now() + idx).toString(),
            question: item.question || item.q || '',
            answer: item.answer || item.a || ''
          })));
          setShowFaqs(true);
        }

        // Target Audience
        if (Array.isArray(infoData.targetAudience) && infoData.targetAudience.length > 0) {
          setTargetAudience(infoData.targetAudience.map(String).filter(Boolean));
        }

        // Integrations
        if (Array.isArray(infoData.integrations) && infoData.integrations.length > 0) {
          setIntegrations(infoData.integrations.map(String).filter(Boolean));
          setShowIntegrations(true);
        }

        // Social links
        if (infoData.importantLinks?.socialMedia) {
          const newSocial = Object.entries(infoData.importantLinks.socialMedia)
            .filter(([, u]) => Boolean(u))
            .map(([platform, u]) => ({ id: platform, platform, url: u as string }));
          if (newSocial.length > 0) {
            setSocialLinks(newSocial);
            setShowSocials(true);
          }
        }

        // Clear field errors
        setErrors(prev => {
          const copy = { ...prev };
          ['toolName', 'tagline', 'tool_url', 'overview', 'categories', 'tags'].forEach(k => delete copy[k]);
          return copy;
        });
      }

      // 4. Pricing
      if (fieldsToExtract.includes('pricing')) {
        const p = data.pricing || data.tool_info?.pricing || {};
        const model = data.pricingModel || data.tool_info?.pricingModel || p.pricingModel || p.model;

        setFormData(prev => ({
          ...prev,
          pricingModel: model || prev.pricingModel || 'Free',
          currency: p.currency || prev.currency || '$',
          hasPricing: p.hasPricing !== undefined ? p.hasPricing : (Array.isArray(p.plans) && p.plans.length > 0 ? true : prev.hasPricing),
          hasFreePlan: p.hasFreePlan ?? prev.hasFreePlan,
          hasFreeTrial: p.hasFreeTrial ?? prev.hasFreeTrial,
          sp_currency: p.startingPrice?.currency || prev.sp_currency || '$',
          sp_planName: p.startingPrice?.planName || prev.sp_planName || '',
          sp_priceText: p.startingPrice?.priceText || prev.sp_priceText || '',
          sp_priceAmount: p.startingPrice?.priceAmount ? String(p.startingPrice.priceAmount) : prev.sp_priceAmount || '',
          sp_billingCycle: p.startingPrice?.billingCycle || prev.sp_billingCycle || 'month',
        }));

        if (Array.isArray(p.billingCycles) && p.billingCycles.length > 0) {
          setSelectedBillingCycles(p.billingCycles.map(String).filter(Boolean));
        }

        if (Array.isArray(p.plans) && p.plans.length > 0) {
          setPlans(p.plans.map((pl: any, idx: number) => ({
            id: (Date.now() + idx).toString(),
            name: pl.name || '',
            priceText: pl.priceText || pl.price || '',
            priceAmount: pl.priceAmount ? String(pl.priceAmount) : '',
            billingCycle: pl.billingCycle || 'month',
            isPopular: Boolean(pl.isPopular),
            isEnterprise: Boolean(pl.isEnterprise),
            isCustomPricing: Boolean(pl.isCustomPricing),
            limits: Array.isArray(pl.limits) ? pl.limits.map(String).filter(Boolean) : [],
            features: Array.isArray(pl.features) ? pl.features.map(String).filter(Boolean) : [],
          })));
          setShowPlans(true);
        }
      }

      setExtractionSuccess(`Successfully extracted ${fieldsToExtract.join(', ')} from ${targetUrl}`);
      setIsExtractionModalOpen(false);
    } catch (err: any) {
      console.error('AI field extraction error:', err);
      setExtractionError(err?.message || 'Failed to extract selected fields. Please verify the URL.');
    } finally {
      setIsExtracting(false);
      setExtractingFields([]);
    }
  };

  const validate = () => {
    const isValidUrlFormat = (val: string) => {
      if (!val || typeof val !== 'string' || !val.trim()) return true;
      if (val.startsWith('data:image/') || val.startsWith('/') || val.startsWith('blob:')) return true;
      try {
        const testStr = val.trim().startsWith('http://') || val.trim().startsWith('https://') ? val.trim() : `https://${val.trim()}`;
        const parsed = new URL(testStr);
        return Boolean(parsed.hostname && parsed.hostname.includes('.'));
      } catch {
        return false;
      }
    };

    const isValidRequiredSiteUrl = (val: string) => {
      if (!val || typeof val !== 'string' || !val.trim()) return false;
      return isValidUrlFormat(val);
    };

    const toolSchema = z.object({
      toolName: z.string().trim().min(1, 'Tool Name is required'),
      tagline: z.string().trim().min(1, 'Tagline is required'),
      tool_url: z.string().trim().min(1, 'Slug is required'),
      tool_site_url: z.string().trim().refine(isValidRequiredSiteUrl, 'Invalid Site URL format'),
      tool_screenshot_url: z.string().trim().refine(isValidUrlFormat, 'Invalid screenshot URL format'),
      homepage: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      pricing_url: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      docs: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      blog: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      login: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      contact: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      support: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      ios: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),
      android: z.string().trim().refine(isValidUrlFormat, 'Invalid URL format'),

      overview: modelType === 'new'
        ? z.string().trim().refine(val => {
          const emptyVals = ['<p></p>', '<p><br></p>', '<div></div>', '<div><br></div>', ''];
          return !emptyVals.includes(val);
        }, 'Overview content is required')
        : z.string().optional(),

      shortDescription: modelType !== 'new'
        ? z.string().trim().min(1, 'Short description is required')
        : z.string().optional(),

      fullDescription: modelType !== 'new'
        ? z.string().trim().min(1, 'Full description is required')
        : z.string().optional(),

      tags: z.array(z.string()).min(1, 'At least one tag is required'),
      categories: z.array(z.string()).min(1, 'At least one category is required'),

      full_name: z.string().trim().optional().refine(val => !val || val.length >= 3, 'Full name must be at least 3 characters'),
      business_email: z.string().trim().optional().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Invalid business email format'),

      socialLinks: z.array(z.object({
        platform: z.string().trim().min(1, 'Platform is required'),
        url: z.string().trim().min(1, 'URL is required').refine(isValidUrlFormat, 'Invalid URL format')
      })).optional()
    });

    const validationData = {
      ...formData,
      tags: selectedTags,
      categories: selectedCategories,
      socialLinks: socialLinks
    };

    const result = toolSchema.safeParse(validationData);
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach(issue => {
        const path = issue.path.join('_');
        newErrors[path] = issue.message;
      });
    }

    setErrors(newErrors);

    // Also check tool_site_url with dedicated validation
    const siteUrlValidation = validateToolSiteUrlFormat(formData.tool_site_url);
    if (!siteUrlValidation.isValid) {
      newErrors.tool_site_url = siteUrlValidation.error || 'Invalid Tool Site URL';
    } else if (isDuplicateConflict) {
      newErrors.tool_site_url = 'This website URL is already registered to another tool in the database.';
    }

    if (Object.keys(newErrors).length > 0) {
      scrollToError(newErrors);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Helper to convert empty strings/arrays to null/undefined
      const toNull = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string' && val.trim() === '') return null;
        if (Array.isArray(val) && val.length === 0) return undefined;
        if (val !== null && typeof val === 'object' && Object.keys(val).length === 0) return undefined;
        return val;
      };

      const stripHtml = (html: string) => {
        if (!html) return '';
        return html
          .replace(/<p[^>]*>/g, '')
          .replace(/<\/p>/g, '\n')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<[^>]*>?/gm, '')
          .trim();
      };

      const tool_info: any = {
        ...initialData?.tool_info,
        toolName: toNull(formData.toolName),
        tagline: toNull(formData.tagline),
        categories: toNull(selectedCategories),
        targetAudience: toNull(targetAudience.filter(Boolean)),
        integrations: toNull(integrations.filter(Boolean)),
        prosAndCons: {
          pros: toNull(pros.filter(Boolean)),
          cons: toNull(cons.filter(Boolean))
        },
        pricing: {
          ...initialData?.tool_info?.pricing,
          currency: toNull(formData.currency),
          discounts: toNull(formData.discounts),
          hasPricing: formData.hasPricing,
          hasFreePlan: formData.hasFreePlan,
          hasFreeTrial: formData.hasFreeTrial,
          pricingModel: toNull(formData.pricingModel),
          billingCycles: toNull(selectedBillingCycles.length > 0 ? selectedBillingCycles : (formData.billingCycles ? formData.billingCycles.split(',').map((s: string) => s.trim()).filter(Boolean) : null)),
          startingPrice: {
            currency: toNull(formData.sp_currency),
            planName: toNull(formData.sp_planName),
            priceText: toNull(formData.sp_priceText),
            priceAmount: toNull(formData.sp_priceAmount),
            billingCycle: toNull(formData.sp_billingCycle),
          },
          plans: toNull(plans.map((p) => {
            const plan = { ...p };
            delete (plan as any).id;
            return {
              ...plan,
              name: toNull(p.name),
              priceText: toNull(p.priceText),
              priceAmount: toNull(p.priceAmount),
              billingCycle: toNull(p.billingCycle),
              limits: toNull(p.limits?.filter(Boolean)),
              features: toNull(p.features?.filter(Boolean))
            };
          }))
        },
        importantLinks: modelType === 'new' ? {
          website: toNull(formData.homepage),
          pricing: toNull(formData.pricing_url),
          support: toNull(formData.support),
          contact: toNull(formData.contact),
          ios: toNull(formData.ios),
          android: toNull(formData.android),
          socialMedia: {
            twitter: toNull(socialLinks.find(s => s.platform === 'twitter')?.url),
            facebook: toNull(socialLinks.find(s => s.platform === 'facebook')?.url),
            youtube: toNull(socialLinks.find(s => s.platform === 'youtube')?.url),
            instagram: toNull(socialLinks.find(s => s.platform === 'instagram')?.url),
            linkedin: toNull(socialLinks.find(s => s.platform === 'linkedin')?.url),
            discord: toNull(socialLinks.find(s => s.platform === 'discord')?.url),
          }
        } : {
          ...initialData?.tool_info?.importantLinks,
          homepage: toNull(formData.homepage),
          website: toNull(formData.homepage),
          pricing: toNull(formData.pricing_url),
          blog: toNull(formData.blog),
          docs: toNull(formData.docs),
          login: toNull(formData.login),
          contact: toNull(formData.contact),
          support: toNull(formData.support),
          ios: toNull(formData.ios),
          android: toNull(formData.android),
          socialMedia: {
            twitter: toNull(socialLinks.find(s => s.platform === 'twitter')?.url),
            facebook: toNull(socialLinks.find(s => s.platform === 'facebook')?.url),
            youtube: toNull(socialLinks.find(s => s.platform === 'youtube')?.url),
            instagram: toNull(socialLinks.find(s => s.platform === 'instagram')?.url),
            linkedin: toNull(socialLinks.find(s => s.platform === 'linkedin')?.url),
            discord: toNull(socialLinks.find(s => s.platform === 'discord')?.url),
          }
        }
      };

      if (modelType === 'new') {
        const cleanOverview = stripHtml(formData.overview);
        tool_info.overview = cleanOverview === '' ? null : cleanOverview;
        tool_info.tags = toNull(selectedTags);
        tool_info.isAIWebsite = formData.isAIWebsite;
        tool_info.pricingModel = toNull(formData.pricingModel);
        tool_info.faq = toNull(faqs.map(({ question, answer }) => ({
          question: toNull(question),
          answer: toNull(answer)
        })).filter(f => f.question || f.answer));
        delete tool_info.fullDescription;
        delete tool_info.shortDescription;
        delete tool_info.aboutTool;
        delete tool_info.hashtags;
        delete tool_info.isAIToolOrRelatedSite;
        delete tool_info.keyFeatures;
      } else {
        const cleanFullDesc = stripHtml(formData.fullDescription);
        tool_info.fullDescription = cleanFullDesc === '' ? null : cleanFullDesc;
        tool_info.shortDescription = toNull(formData.shortDescription);
        tool_info.tags = toNull(selectedTags);
        delete tool_info.hashtags;
        tool_info.isAIToolOrRelatedSite = formData.isAIToolOrRelatedSite;
        tool_info.faq = toNull(faqs.map(({ question, answer }) => ({
          question: toNull(question),
          answer: toNull(answer)
        })).filter(f => f.question || f.answer));
        tool_info.keyFeatures = toNull(features.map(({ name, description }) => ({
          name: toNull(name),
          description: toNull(description)
        })).filter(f => f.name || f.description));
        delete tool_info.overview;
        delete tool_info.isAIWebsite;
      }

      // Auto-create missing categories & tags in DB tables
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        for (const cat of selectedCategories) {
          if (!cat || !cat.trim()) continue;
          const catName = cat.trim();
          const slug = slugify(catName);
          const { data: existing } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', slug)
            .limit(1);

          if (!existing || existing.length === 0) {
            if (token) {
              await createCategoryAction({
                name: catName,
                slug: slug,
                status: 'show',
              }, token);
            }
          }
        }

        for (const tag of selectedTags) {
          if (!tag || !tag.trim()) continue;
          const rawTag = tag.replace(/^#/, '').trim();
          if (!rawTag) continue;
          const slug = slugify(rawTag);

          // Insert into tags table if missing
          const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .eq('slug', slug)
            .limit(1);

          if (!existingTag || existingTag.length === 0) {
            if (token) {
              await createTagAction({
                name: rawTag,
                slug: slug,
                status: 'show',
              }, token);
            }
          }
        }
      } catch (autoErr) {
        console.warn('Auto-creating missing categories/tags warning:', autoErr);
      }

      await onSubmit({
        tool_url: toNull(formData.tool_url),
        tool_site_url: toNull(formData.tool_site_url),
        tool_screenshot_url: toNull(formData.tool_screenshot_url),
        favicon_url: toNull(formData.favicon_url),
        status: formData.status,
        scheduled_launch_date: formData.scheduled_launch_date ? new Date(formData.scheduled_launch_date).toISOString() : null,
        ...(isSubmission ? {
          full_name: toNull(formData.full_name),
          business_email: toNull(formData.business_email),
          is_verified: formData.is_verified,
          tool_domain: toNull(formData.tool_domain),
        } : {}),
        ...(initialData ? {} : { created_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
        tool_info
      });
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrors({ submit: err.message || 'An error occurred during submission' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelClass = "saas-label";
  const inputClass = "saas-input";
  const areaClass = "saas-textarea";
  const submissionStatusOption = isSubmission ? getToolSubmissionStatusOption(formData.status) : null;

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

      {/* 1. Core Identity */}
      <CollapsibleSection
        id="core-identity"
        title="Core Identity"
        description="Primary details and tool identification."
        defaultOpen={!isSubmission}
        hasErrors={!!(errors.toolName || errors.tagline || errors.tool_url || errors.tool_site_url || errors.overview || errors.fullDescription || errors.shortDescription)}
        headerActions={
          <div className="flex items-center gap-2">
            <Badge
              variant={
                isSubmission
                  ? submissionStatusOption!.variant
                  : (
                    formData.status === 'show' || formData.status === 'approved' ? 'success' :
                    formData.status === 'show:invalid' || formData.status === 'draft' || formData.status === 'pending' ? 'warning' :
                    formData.status === 'show:error' || formData.status === 'error' || formData.status === 'rejected' ? 'destructive' :
                    formData.status === 'archived' ? 'violet' :
                    'slate'
                  )
              }
              className="text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider"
            >
              {isSubmission
                ? submissionStatusOption!.label
                : (
                  formData.status === 'show' ? 'Show' :
                  formData.status === 'show:invalid' ? 'Show: Invalid' :
                  formData.status === 'show:error' ? 'Show: Error' :
                  formData.status === 'show:inactive' ? 'Show: Inactive' :
                  formData.status === 'hide' ? 'Hide' :
                  formData.status === 'draft' ? 'Draft' :
                  formData.status === 'archived' ? 'Archived' :
                  formData.status === 'pending' ? 'Pending' :
                  formData.status === 'error' ? 'Error' :
                  (formData.status || 'Draft')
                )}
            </Badge>
          </div>
        }
      >
        <div className="space-y-6">
          {/* AI Worker Extraction Notification & Feedback */}
          {isExtracting && (
            <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2.5">
                <Spinner size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />
                <div>
                  <span className="font-semibold">AI Worker Extracting: </span>
                  <span className="font-mono text-[11px] bg-sky-100 dark:bg-sky-900 px-1.5 py-0.5 rounded">
                    {extractingFields.join(', ')}
                  </span>
                  <span className="ml-2 text-zinc-500 dark:text-zinc-400">Crawling target site and optimizing assets...</span>
                </div>
              </div>
            </div>
          )}

          {extractionSuccess && !isExtracting && (
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{extractionSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setExtractionSuccess(null)}
                className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {extractionError && !isExtracting && (
            <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{extractionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setExtractionError(null)}
                className="text-rose-700 dark:text-rose-400 hover:text-rose-900 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* AI Worker Extraction Toolbar */}
          <div className="p-3.5 rounded-xl border border-dashed border-sky-300 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  AI Worker Extraction
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800">
                    Cloudflare Worker
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Selectively extract metadata, screenshots, favicons, and pricing directly from URL
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                onClick={() => setIsExtractionModalOpen(!isExtractionModalOpen)}
                disabled={isBusy}
                size="sm"
                variant="outline"
                className="text-xs font-semibold gap-1.5 bg-white dark:bg-zinc-900 shadow-2xs hover:bg-sky-50 dark:hover:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 cursor-pointer"
              >
                <Sparkles size={14} className={isExtracting ? 'animate-spin' : ''} />
                <span>{isExtracting ? `Extracting...` : 'Select Fields to Extract'}</span>
                <ChevronDown size={13} className={`transition-transform duration-200 ${isExtractionModalOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Selective Extraction Config Box */}
          {isExtractionModalOpen && (
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-md space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Choose target fields to extract:
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedExtractTargets({ favicon: true, screenshot: true, tool_info: true, pricing: true })}
                    className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedExtractTargets({ favicon: false, screenshot: false, tool_info: false, pricing: false })}
                    className="text-zinc-500 hover:underline font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${selectedExtractTargets.favicon ? 'border-sky-500/50 bg-sky-50/40 dark:bg-sky-950/20' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedExtractTargets.favicon}
                    onChange={(e) => setSelectedExtractTargets(prev => ({ ...prev, favicon: e.target.checked }))}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <ImageIcon size={13} className="text-sky-500" /> Favicon
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      Fetches brand favicon, uploads to R2 CDN, and updates Favicon URL.
                    </p>
                  </div>
                </label>

                <label className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${selectedExtractTargets.screenshot ? 'border-sky-500/50 bg-sky-50/40 dark:bg-sky-950/20' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedExtractTargets.screenshot}
                    onChange={(e) => setSelectedExtractTargets(prev => ({ ...prev, screenshot: e.target.checked }))}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Camera size={13} className="text-sky-500" /> Screenshot
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      Captures high-res desktop WebP, uploads to R2 CDN, updates Screenshot URL.
                    </p>
                  </div>
                </label>

                <label className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${selectedExtractTargets.tool_info ? 'border-sky-500/50 bg-sky-50/40 dark:bg-sky-950/20' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedExtractTargets.tool_info}
                    onChange={(e) => setSelectedExtractTargets(prev => ({ ...prev, tool_info: e.target.checked }))}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Layers size={13} className="text-sky-500" /> Tool Details
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      Name, tagline, overview description, features, pros/cons, tags & categories.
                    </p>
                  </div>
                </label>

                <label className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${selectedExtractTargets.pricing ? 'border-sky-500/50 bg-sky-50/40 dark:bg-sky-950/20' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedExtractTargets.pricing}
                    onChange={(e) => setSelectedExtractTargets(prev => ({ ...prev, pricing: e.target.checked }))}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <DollarSign size={13} className="text-sky-500" /> Pricing & Plans
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      Pricing model, starting price, free plan, trial status, and tiered plan features.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExtractionModalOpen(false)}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || (!selectedExtractTargets.favicon && !selectedExtractTargets.screenshot && !selectedExtractTargets.tool_info && !selectedExtractTargets.pricing)}
                  onClick={() => {
                    const targets: ('favicon' | 'screenshot' | 'tool_info' | 'pricing')[] = [];
                    if (selectedExtractTargets.favicon) targets.push('favicon');
                    if (selectedExtractTargets.screenshot) targets.push('screenshot');
                    if (selectedExtractTargets.tool_info) targets.push('tool_info');
                    if (selectedExtractTargets.pricing) targets.push('pricing');
                    handleExtractFields(targets, true);
                  }}
                  className="text-xs font-semibold gap-1.5 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  {isExtracting ? <Spinner size={14} /> : <Sparkles size={14} />}
                  <span>Extract Selected Fields</span>
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Tool Site Url <span className="saas-label-required">*</span></label>
                {isCheckingSiteUrl && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <Spinner size={13} />
                    <span>Checking database...</span>
                  </div>
                )}
                {!isCheckingSiteUrl && siteUrlNotice?.type === 'success' && (
                  <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={13} />
                    <span>Available</span>
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  name="tool_site_url"
                  value={formData.tool_site_url || ''}
                  onChange={handleSiteUrlChange}
                  onPaste={handleSiteUrlPaste}
                  onBlur={handleSiteUrlBlur}
                  placeholder="https://example.com"
                  className={`${errors.tool_site_url || isDuplicateConflict ? 'saas-input-error' : ''} ${siteUrlNotice?.type === 'success' ? 'border-emerald-500/50 dark:border-emerald-500/50' : ''}`}
                  required
                />
                {isCheckingSiteUrl && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner size={14} />
                  </div>
                )}
              </div>
              {errors.tool_site_url && <p className="saas-error-message">{errors.tool_site_url}</p>}

              {/* Conflict / Notice Box */}
              {siteUrlNotice && siteUrlNotice.type === 'error' && (
                <div className="mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold text-red-800 dark:text-red-200">
                      Duplicate Tool Detected in Database
                    </div>
                    <p className="leading-relaxed">
                      {siteUrlNotice.message}
                    </p>
                    {siteUrlNotice.toolSlug && (
                      <div className="pt-1 flex items-center gap-2">
                        <span className="font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-[11px]">
                          Slug: {siteUrlNotice.toolSlug}
                        </span>
                        {siteUrlNotice.status && (
                          <span className="font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-[11px] uppercase">
                            Status: {siteUrlNotice.status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {siteUrlNotice && siteUrlNotice.type === 'warning' && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                      Active Submission In Queue
                    </div>
                    <p className="leading-relaxed">{siteUrlNotice.message}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tool Name <span className="saas-label-required">*</span></label>
              <Input name="toolName" value={formData.toolName || ''} onChange={handleChange} placeholder="toolName" className={errors.toolName ? 'saas-input-error' : ''} required />
              {errors.toolName && <p className="saas-error-message">{errors.toolName}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tagline <span className="saas-label-required">*</span></label>
              <Input name="tagline" value={formData.tagline || ''} onChange={handleChange} placeholder="tagline" className={errors.tagline ? 'saas-input-error' : ''} />
              {errors.tagline && <p className="saas-error-message">{errors.tagline}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Slug <span className="saas-label-required">*</span></label>
              <Input name="tool_url" value={formData.tool_url || ''} onChange={handleChange} placeholder="slug" className={`font-mono text-sm ${errors.tool_url ? 'saas-input-error' : ''}`} required />
              {errors.tool_url && <p className="saas-error-message">{errors.tool_url}</p>}
            </div>
          </div>

          {isSubmission && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border-color)]">
              <div className="space-y-1">
                <label className={labelClass}>Submitter Name</label>
                <Input name="full_name" value={formData.full_name || ''} readOnly className="opacity-60 cursor-not-allowed bg-[var(--bg-elevated)]/20" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Submitter Email</label>
                <Input name="business_email" value={formData.business_email || ''} readOnly className="opacity-60 cursor-not-allowed bg-[var(--bg-elevated)]/20" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Tool Domain</label>
                <Input name="tool_domain" value={formData.tool_domain || ''} onChange={handleChange} placeholder="example.com" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Is Verified</label>
                <Select
                  name="is_verified"
                  value={formData.is_verified ? 'true' : 'false'}
                  onChange={(val) => setFormData(prev => ({ ...prev, is_verified: val === 'true' }))}
                >
                  <option value="false">False</option>
                  <option value="true">True</option>
                </Select>
              </div>
            </div>
          )}

          {modelType === 'old' && (
            <div className="space-y-1">
              <label className={labelClass}>Short Description <span className="saas-label-required">*</span></label>
              <Textarea name="shortDescription" value={formData.shortDescription || ''} onChange={handleChange} placeholder="shortDescription" className={errors.shortDescription ? 'saas-input-error' : ''} rows={3} />
              {errors.shortDescription && <p className="saas-error-message">{errors.shortDescription}</p>}
            </div>
          )}
          <div className="space-y-1">
            <label className={labelClass}>{modelType === 'new' ? 'Overview' : 'Full Description'} <span className="saas-label-required">*</span></label>
            {modelType === 'new' ? (
              <div className={errors.overview ? 'saas-error-wrapper' : ''}>
                <RichTextEditor
                  content={formData.overview}
                  onChange={(html) => {
                    setFormData(prev => ({ ...prev, overview: html }));
                    if (errors.overview) setErrors(prev => {
                      const n = { ...prev };
                      delete n.overview;
                      return n;
                    });
                  }}
                  placeholder="overview"
                  showFormatButton={false}
                  name="overview"
                  onBusyChange={setIsRichTextUploading}
                />
              </div>
            ) : (
              <div className={errors.fullDescription ? 'saas-error-wrapper' : ''}>
                <RichTextEditor
                  content={formData.fullDescription}
                  onChange={(html) => {
                    setFormData(prev => ({ ...prev, fullDescription: html }));
                    if (errors.fullDescription) setErrors(prev => {
                      const n = { ...prev };
                      delete n.fullDescription;
                      return n;
                    });
                  }}
                  placeholder="fullDescription"
                  showFormatButton={false}
                  name="fullDescription"
                  onBusyChange={setIsRichTextUploading}
                />
              </div>
            )}
            {(errors.overview || errors.fullDescription) && <p className="saas-error-message">{errors.overview || errors.fullDescription}</p>}
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. Reach & Audience */}
      <CollapsibleSection
        id="reach-audience"
        title="Reach & Audience"
        description="Define how the tool is discovered and who it's for."
        defaultOpen={!isSubmission}
        hasErrors={!!(errors.categories || errors.tags)}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Categories <span className="saas-label-required">*</span></label>
              <div className={`relative focus-within:z-50 ${errors.categories ? 'saas-error-wrapper' : ''}`}>
                <KeywordTagInput
                  selectedKeywords={selectedCategories}
                  onKeywordsChange={(val) => {
                    setSelectedCategories(val);
                    if (errors.categories) setErrors(prev => {
                      const n = { ...prev };
                      delete n.categories;
                      return n;
                    });
                  }}
                  onClearError={() => {
                    if (errors.categories) setErrors(prev => {
                      const n = { ...prev };
                      delete n.categories;
                      return n;
                    });
                  }}
                  placeholder="categories"
                  type="category"
                  name="categories"
                />
              </div>
              {errors.categories && <p className="saas-error-message">{errors.categories}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tags <span className="saas-label-required">*</span></label>
              <div className={`relative focus-within:z-40 ${errors.tags ? 'saas-error-wrapper' : ''}`}>
                <KeywordTagInput
                  selectedKeywords={selectedTags}
                  onKeywordsChange={(val) => {
                    setSelectedTags(val);
                    if (errors.tags) setErrors(prev => {
                      const n = { ...prev };
                      delete n.tags;
                      return n;
                    });
                  }}
                  onClearError={() => {
                    if (errors.tags) setErrors(prev => {
                      const n = { ...prev };
                      delete n.tags;
                      return n;
                    });
                  }}
                  placeholder="tags"
                  type="tag"
                  name="tags"
                />
              </div>
              {errors.tags && <p className="saas-error-message">{errors.tags}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Target Audience</label>
            {targetAudience.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] italic mb-2">No items added yet</p>
            )}
            <div className="flex flex-wrap gap-2 mb-2">
              {targetAudience.map((ta, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <Input
                    value={ta || ''}
                    onChange={(e) => {
                      const next = [...targetAudience];
                      next[i] = e.target.value;
                      setTargetAudience(next);
                    }}
                    placeholder="target audience"
                  />
                  <button type="button" onClick={() => setTargetAudience(targetAudience.filter((_, idx) => idx !== i))} className="text-rose-500 opacity-30 group-hover:opacity-100 transition-all p-2">✕</button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTargetAudience([...targetAudience, ''])}
              className={btnNeutralClass}
            >
              <Plus size={14} /> Add Audience
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Media & Status */}
      <CollapsibleSection
        id="media-visibility"
        title="Media & Visibility"
        description="Assets and publication controls."
        hasErrors={!!(errors.tool_screenshot_url)}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Tool Screenshot Url</label>
              <div className="relative flex items-center">
                <Input
                  name="tool_screenshot_url"
                  value={formData.tool_screenshot_url || ''}
                  onChange={handleChange}
                  placeholder="https://..."
                  style={{ paddingRight: '4.8rem' }}
                  className={errors.tool_screenshot_url ? 'saas-input-error' : ''}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                  <button
                    type="button"
                    onClick={() => handleExtractFields(['screenshot'], true)}
                    disabled={isBusy}
                    className="p-1.5 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-all cursor-pointer"
                    title="Capture screenshot via AI Worker"
                  >
                    {isExtracting && extractingFields.includes('screenshot') ? (
                      <Spinner size={15} className="text-sky-500" />
                    ) : (
                      <Camera size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => screenshotFileInputRef.current?.click()}
                    disabled={uploadingScreenshot || isBusy}
                    className="p-1.5 text-[var(--text-muted)] hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                    title="Browse & upload screenshot to CDN"
                  >
                    {uploadingScreenshot ? (
                      <Spinner size={15} className="text-zinc-500" />
                    ) : (
                      <Upload size={15} />
                    )}
                  </button>
                </div>
                <input
                  type="file"
                  ref={screenshotFileInputRef}
                  onChange={handleScreenshotUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              {errors.tool_screenshot_url && <p className="saas-error-message">{errors.tool_screenshot_url}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Favicon Url</label>
              <div className="relative flex items-center">
                <Input
                  name="favicon_url"
                  value={formData.favicon_url || ''}
                  onChange={handleChange}
                  placeholder="https://..."
                  style={{ paddingRight: '4.8rem' }}
                  className={errors.favicon_url ? 'saas-input-error' : ''}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                  <button
                    type="button"
                    onClick={() => handleExtractFields(['favicon'], true)}
                    disabled={isBusy}
                    className="p-1.5 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-all cursor-pointer"
                    title="Fetch favicon via AI Worker"
                  >
                    {isExtracting && extractingFields.includes('favicon') ? (
                      <Spinner size={15} className="text-sky-500" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => faviconFileInputRef.current?.click()}
                    disabled={uploadingFavicon || isBusy}
                    className="p-1.5 text-[var(--text-muted)] hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                    title="Browse & upload favicon to CDN"
                  >
                    {uploadingFavicon ? (
                      <Spinner size={15} className="text-zinc-500" />
                    ) : (
                      <Upload size={15} />
                    )}
                  </button>
                </div>
                <input
                  type="file"
                  ref={faviconFileInputRef}
                  onChange={handleFaviconUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              {errors.favicon_url && <p className="saas-error-message">{errors.favicon_url}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Visibility Status</label>
              <Select
                name="status"
                value={formData.status}
                onChange={(val) => setFormData(prev => ({ ...prev, status: val }))}
              >
                {isSubmission ? (
                  TOOL_SUBMISSION_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))
                ) : (
                  TOOL_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))
                )}
              </Select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>{modelType === 'new' ? 'isAIWebsite' : 'isAIToolOrRelatedSite'}</label>
              <Select
                name={modelType === 'new' ? 'isAIWebsite' : 'isAIToolOrRelatedSite'}
                value={modelType === 'new' ? (formData.isAIWebsite ? 'true' : 'false') : (formData.isAIToolOrRelatedSite ? 'true' : 'false')}
                onChange={(val) => {
                  const fieldName = modelType === 'new' ? 'isAIWebsite' : 'isAIToolOrRelatedSite';
                  setFormData(prev => ({ ...prev, [fieldName]: val === 'true' }));
                }}
              >
                <option value="false">False</option>
                <option value="true">True</option>
              </Select>
            </div>
          </div>

          <div className="pt-6 border-t border-[var(--border-color)]">
            <LaunchSchedulePicker
              value={formData.scheduled_launch_date}
              onChange={(dateStr) => {
                setFormData(prev => ({ ...prev, scheduled_launch_date: dateStr }));
              }}
              disabled={isBusy}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 4. Pricing & Plans */}
      <CollapsibleSection
        key={formData.hasPricing ? 'pricing-enabled' : 'pricing-disabled'}
        id="pricing-architecture"
        title="Pricing Architecture"
        description="Define monetization and subscription models."
        defaultOpen={formData.hasPricing}
        hasErrors={false}
        headerActions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleExtractFields(['pricing'], true)}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-800 transition-all shadow-2xs cursor-pointer"
              title="Scrape and extract pricing plans via AI Worker"
            >
              {isExtracting && extractingFields.includes('pricing') ? (
                <Spinner size={12} className="text-sky-500" />
              ) : (
                <Sparkles size={12} className="text-sky-500" />
              )}
              <span>Scrape Pricing</span>
            </button>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Has Pricing</span>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, hasPricing: !prev.hasPricing }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400/30 ${
                formData.hasPricing ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`${
                  formData.hasPricing ? 'translate-x-6 bg-white dark:bg-zinc-900' : 'translate-x-1 bg-white dark:bg-zinc-300'
                } inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ease-in-out shadow-xs`}
              />
            </button>
          </div>
        }
      >
        {formData.hasPricing && (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1">
                <label className={labelClass}>Pricing Model</label>
                <Input name="pricingModel" value={formData.pricingModel || ''} onChange={handleChange} placeholder="pricingModel" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Currency</label>
                <Input name="currency" value={formData.currency || ''} onChange={handleChange} placeholder="currency" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Has Free Plan</label>
                <Select name="hasFreePlan" value={formData.hasFreePlan ? 'true' : 'false'} onChange={(val) => setFormData(prev => ({ ...prev, hasFreePlan: val === 'true' }))}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Has Free Trial</label>
                <Select name="hasFreeTrial" value={formData.hasFreeTrial ? 'true' : 'false'} onChange={(val) => setFormData(prev => ({ ...prev, hasFreeTrial: val === 'true' }))}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1">
                <label className={labelClass}>Discounts</label>
                <Input name="discounts" value={formData.discounts || ''} onChange={handleChange} placeholder="e.g. 20% OFF, Black Friday Sale" />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Billing Cycles</label>
                <KeywordTagInput
                  selectedKeywords={selectedBillingCycles}
                  onKeywordsChange={(val) => {
                    setSelectedBillingCycles(val);
                    setFormData(prev => ({ ...prev, billingCycles: val.join(', ') }));
                  }}
                  placeholder="Type cycle (e.g. Monthly, Yearly, One-time) & press Enter..."
                  type="generic"
                  name="billingCycles"
                />
              </div>
            </div>

            <div className="p-5 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/20 space-y-4">
              <h3 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">startingPrice</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">plan Name</label>
                  <Input name="sp_planName" value={formData.sp_planName || ''} onChange={handleChange} placeholder="planName" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">price Amount</label>
                  <Input name="sp_priceAmount" value={formData.sp_priceAmount || ''} onChange={handleChange} placeholder="priceAmount" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">currency</label>
                  <Input name="sp_currency" value={formData.sp_currency || ''} onChange={handleChange} placeholder="currency" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">billing Cycle</label>
                  <Input name="sp_billingCycle" value={formData.sp_billingCycle || ''} onChange={handleChange} placeholder="billingCycle" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">price Text</label>
                  <Input name="sp_priceText" value={formData.sp_priceText || ''} onChange={handleChange} placeholder="priceText" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Plans</label>
                {showPlans && (
                  <button type="button" onClick={() => setShowPlans(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                    − Collapse
                  </button>
                )}
              </div>
              {!showPlans ? (
                <button
                  type="button"
                  onClick={addPlan}
                  className={btnNeutralClass}
                >
                  <Plus size={14} /> Add Plan
                </button>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {plans.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                  )}
                  {plans.map((plan) => (
                    <div key={plan.id} className="p-5 border border-[var(--border-color)] rounded-2xl bg-[var(--bg-elevated)]/30 space-y-6 shadow-sm transition-all hover:border-[var(--border-color)]/80">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Plan</span>
                        <button type="button" onClick={() => removePlan(plan.id)} className="shrink-0 text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-3 py-1.5 rounded-lg font-bold transition-colors uppercase tracking-wider cursor-pointer">Remove Plan</button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Name</label>
                          <Input value={plan.name || ''} onChange={(e) => updatePlan(plan.id, 'name', e.target.value)} placeholder="name" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Price Amount</label>
                          <Input value={plan.priceAmount || ''} onChange={(e) => updatePlan(plan.id, 'priceAmount', e.target.value)} placeholder="priceAmount" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Billing Cycle</label>
                          <Input value={plan.billingCycle || ''} onChange={(e) => updatePlan(plan.id, 'billingCycle', e.target.value)} placeholder="billingCycle" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Price Text</label>
                          <Input value={plan.priceText || ''} onChange={(e) => updatePlan(plan.id, 'priceText', e.target.value)} placeholder="priceText" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">is Popular</label>
                          <Select value={plan.isPopular ? 'true' : 'false'} onChange={(val) => updatePlan(plan.id, 'isPopular', val === 'true')}>
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">is Enterprise</label>
                          <Select value={plan.isEnterprise ? 'true' : 'false'} onChange={(val) => updatePlan(plan.id, 'isEnterprise', val === 'true')}>
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">is Custom Pricing</label>
                          <Select value={plan.isCustomPricing ? 'true' : 'false'} onChange={(val) => updatePlan(plan.id, 'isCustomPricing', val === 'true')}>
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Limits</label>
                          </div>
                          {(!plan.limits || plan.limits.length === 0) && (
                            <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                          )}
                          <div className="space-y-2">
                            {plan.limits?.map((limit, idx) => (
                              <div key={idx} className="flex items-center gap-2 group/item">
                                <Input value={limit || ''} onChange={(e) => updatePlanLimit(plan.id, idx, e.target.value)} placeholder="limits" />
                                <button type="button" onClick={() => removePlanLimit(plan.id, idx)} className="text-rose-500 opacity-30 group-hover/item:opacity-100 transition-all p-1 cursor-pointer">✕</button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => addPlanLimit(plan.id)}
                            className={btnNeutralClass}
                          >
                            <Plus size={14} /> Add Limit
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Features</label>
                          </div>
                          {(!plan.features || plan.features.length === 0) && (
                            <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                          )}
                          <div className="space-y-2">
                            {plan.features?.map((feat, idx) => (
                              <div key={idx} className="flex items-center gap-2 group/item">
                                <Input value={feat || ''} onChange={(e) => updatePlanFeature(plan.id, idx, e.target.value)} placeholder="features" />
                                <button type="button" onClick={() => removePlanFeature(plan.id, idx)} className="text-rose-500 opacity-30 group-hover/item:opacity-100 transition-all p-1 cursor-pointer">✕</button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => addPlanFeature(plan.id)}
                            className={btnNeutralClass}
                          >
                            <Plus size={14} /> Add Feature
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex">
                    <button
                      type="button"
                      onClick={addPlan}
                      className={btnNeutralClass}
                    >
                      <Plus size={14} /> Add Plan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 5. Features & Content */}
      <CollapsibleSection
        id="features-faq"
        title="Features & FAQ"
        description="Deep dive into capabilities and common questions."
        defaultOpen={!isSubmission}
        hasErrors={false}
      >
        <div className="space-y-8">
          {modelType === 'old' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Key Features</label>
                {showFeatures && (
                  <button type="button" onClick={() => setShowFeatures(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                    − Collapse
                  </button>
                )}
              </div>
              {!showFeatures ? (
                <button
                  type="button"
                  onClick={addFeature}
                  className={btnNeutralClass}
                >
                  <Plus size={14} /> Add Feature
                </button>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {features.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                  )}
                  {features.map((feature) => (
                    <div key={feature.id} className="p-4 border border-[var(--border-color)] rounded-xl bg-[var(--bg-elevated)]/20 space-y-3 relative group">
                      <button type="button" onClick={() => removeFeature(feature.id)} className="absolute top-4 right-4 text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-3 py-1.5 rounded-lg font-bold opacity-0 group-hover:opacity-100 transition-all uppercase tracking-wider cursor-pointer">Delete</button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Name</label>
                          <Input value={feature.name || ''} onChange={(e) => updateFeature(feature.id, 'name', e.target.value)} placeholder="name" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Description</label>
                          <Input value={feature.description || ''} onChange={(e) => updateFeature(feature.id, 'description', e.target.value)} placeholder="description" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex">
                    <button
                      type="button"
                      onClick={addFeature}
                      className={btnNeutralClass}
                    >
                      <Plus size={14} /> Add Feature
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <label className={labelClass}>FAQ</label>
              {showFaqs && (
                <button type="button" onClick={() => setShowFaqs(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                  − Collapse
                </button>
              )}
            </div>
            {!showFaqs ? (
              <button
                type="button"
                onClick={addFaq}
                className={btnNeutralClass}
              >
                <Plus size={14} /> Add FAQ
              </button>
            ) : (
              <div className="space-y-4">
                {faqs.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                )}
                {faqs.map((faq) => (
                  <div key={faq.id} className="p-6 border border-[var(--border-color)] rounded-xl bg-[var(--bg-elevated)]/30 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">FAQ</span>
                      <button type="button" onClick={() => removeFaq(faq.id)} className="shrink-0 text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-3 py-1.5 rounded-lg font-bold transition-colors uppercase tracking-wider cursor-pointer">Delete</button>
                    </div>
                    <Input value={faq.question || ''} onChange={(e) => updateFaq(faq.id, 'question', e.target.value)} placeholder="question" />
                    <Textarea value={faq.answer || ''} onChange={(e) => updateFaq(faq.id, 'answer', e.target.value)} placeholder="answer" rows={2} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addFaq}
                  className={btnNeutralClass}
                >
                  <Plus size={14} /> Add FAQ
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Pros</label>
                {showPros && (
                  <button type="button" onClick={() => setShowPros(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                    − Collapse
                  </button>
                )}
              </div>
              {!showPros ? (
                <button
                  type="button"
                  onClick={addPro}
                  className={btnProClass}
                >
                  <Plus size={14} /> Add Pro
                </button>
              ) : (
                <div className="space-y-2">
                  {pros.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                  )}
                  {pros.map((pro, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <Input value={pro || ''} onChange={(e) => updatePro(i, e.target.value)} placeholder="pros" />
                      <button type="button" onClick={() => removePro(i)} className="text-rose-500 opacity-30 group-hover:opacity-100 transition-all p-2 cursor-pointer">✕</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPro}
                    className={btnProClass}
                  >
                    <Plus size={14} /> Add Pro
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Cons</label>
                {showCons && (
                  <button type="button" onClick={() => setShowCons(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                    − Collapse
                  </button>
                )}
              </div>
              {!showCons ? (
                <button
                  type="button"
                  onClick={addCon}
                  className={btnConClass}
                >
                  <Plus size={14} /> Add Con
                </button>
              ) : (
                <div className="space-y-2">
                  {cons.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                  )}
                  {cons.map((con, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <Input value={con || ''} onChange={(e) => updateCon(i, e.target.value)} placeholder="cons" />
                      <button type="button" onClick={() => removeCon(i)} className="text-rose-500 opacity-30 group-hover:opacity-100 transition-all p-2 cursor-pointer">✕</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addCon}
                    className={btnConClass}
                  >
                    <Plus size={14} /> Add Con
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Integrations</label>
              {showIntegrations && (
                <button type="button" onClick={() => setShowIntegrations(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                  − Collapse
                </button>
              )}
            </div>
            {!showIntegrations ? (
              <button
                type="button"
                onClick={addIntegration}
                className={btnNeutralClass}
              >
                <Plus size={14} /> Add Integration
              </button>
            ) : (
              <div className="space-y-4">
                {integrations.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {integrations.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <Input value={it || ''} onChange={(e) => updateIntegration(i, e.target.value)} placeholder="integration" />
                      <button type="button" onClick={() => removeIntegration(i)} className="text-rose-500 opacity-30 group-hover:opacity-100 transition-all p-2 cursor-pointer">✕</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addIntegration}
                  className={btnNeutralClass}
                >
                  <Plus size={14} /> Add Integration
                </button>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 6. Resources & Links */}
      <CollapsibleSection
        id="resources-links"
        title="Resources & Links"
        description="Primary URLs and social media profiles."
        defaultOpen={!isSubmission}
        hasErrors={!!(
          errors.homepage || errors.pricing_url || errors.contact || errors.support || errors.ios || errors.android ||
          (modelType === 'old' && (errors.docs || errors.blog || errors.login)) ||
          Object.keys(errors).some(k => k.startsWith('socialLinks_'))
        )}
      >
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className={labelClass}>Website / Homepage</label>
              <Input name="homepage" value={formData.homepage || ''} onChange={handleChange} placeholder="https://..." className={errors.homepage ? 'saas-input-error' : ''} />
              {errors.homepage && <p className="saas-error-message">{errors.homepage}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Pricing Page</label>
              <Input name="pricing_url" value={formData.pricing_url || ''} onChange={handleChange} placeholder="https://..." className={errors.pricing_url ? 'saas-input-error' : ''} />
              {errors.pricing_url && <p className="saas-error-message">{errors.pricing_url}</p>}
            </div>
            {modelType === 'old' && (
              <>
                <div className="space-y-1">
                  <label className={labelClass}>Documentation</label>
                  <Input name="docs" value={formData.docs || ''} onChange={handleChange} placeholder="https://..." className={errors.docs ? 'saas-input-error' : ''} />
                  {errors.docs && <p className="saas-error-message">{errors.docs}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Blog</label>
                  <Input name="blog" value={formData.blog || ''} onChange={handleChange} placeholder="https://..." className={errors.blog ? 'saas-input-error' : ''} />
                  {errors.blog && <p className="saas-error-message">{errors.blog}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Login Page</label>
                  <Input name="login" value={formData.login || ''} onChange={handleChange} placeholder="https://..." className={errors.login ? 'saas-input-error' : ''} />
                  {errors.login && <p className="saas-error-message">{errors.login}</p>}
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className={labelClass}>Contact Page</label>
              <Input name="contact" value={formData.contact || ''} onChange={handleChange} placeholder="https://..." className={errors.contact ? 'saas-input-error' : ''} />
              {errors.contact && <p className="saas-error-message">{errors.contact}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Support / Help</label>
              <Input name="support" value={formData.support || ''} onChange={handleChange} placeholder="https://..." className={errors.support ? 'saas-input-error' : ''} />
              {errors.support && <p className="saas-error-message">{errors.support}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>iOS App URL</label>
              <Input name="ios" value={formData.ios || ''} onChange={handleChange} placeholder="https://apps.apple.com/..." className={errors.ios ? 'saas-input-error' : ''} />
              {errors.ios && <p className="saas-error-message">{errors.ios}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Android App URL</label>
              <Input name="android" value={formData.android || ''} onChange={handleChange} placeholder="https://play.google.com/..." className={errors.android ? 'saas-input-error' : ''} />
              {errors.android && <p className="saas-error-message">{errors.android}</p>}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Social Media</label>
              {showSocials && (
                <button type="button" onClick={() => setShowSocials(false)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                  − Collapse
                </button>
              )}
            </div>
            {!showSocials ? (
              <button
                type="button"
                onClick={addSocial}
                className={btnNeutralClass}
              >
                <Plus size={14} /> Add Social Link
              </button>
            ) : (
              <div className="space-y-4">
                {socialLinks.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] italic">No items added yet</p>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {socialLinks.map((social, index) => {
                    const availablePlatforms = [
                      { id: 'twitter', label: 'twitter' },
                      { id: 'facebook', label: 'facebook' },
                      { id: 'youtube', label: 'youtube' },
                      { id: 'instagram', label: 'instagram' },
                      { id: 'linkedin', label: 'linkedin' },
                      { id: 'discord', label: 'discord' }
                    ].filter(p => !socialLinks.some(s => s.platform === p.id && s.id !== social.id));

                    const hasPlatformError = !!errors[`socialLinks_${index}_platform`];
                    const hasUrlError = !!errors[`socialLinks_${index}_url`];

                    return (
                      <div key={social.id} className="flex flex-col gap-1.5 w-full">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 sm:p-0 border border-[var(--border-color)]/40 sm:border-none rounded-xl bg-[var(--bg-elevated)]/10 sm:bg-transparent relative group">
                          <div className="flex items-center gap-2">
                            <Select
                              value={social.platform || ''}
                              onChange={(val) => updateSocial(social.id, 'platform', val)}
                              className={`sm:w-40 ${hasPlatformError ? 'saas-input-error' : ''}`}
                            >
                              <option value="">platform</option>
                              {availablePlatforms.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </Select>
                            <button type="button" onClick={() => removeSocial(social.id)} className="sm:hidden p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer">✕</button>
                          </div>
                          <Input
                            value={social.url || ''}
                            onChange={(e) => updateSocial(social.id, 'url', e.target.value)}
                            placeholder="url"
                            className={hasUrlError ? 'saas-input-error' : ''}
                          />
                          <button type="button" onClick={() => removeSocial(social.id)} className="hidden sm:block p-2 text-rose-500 opacity-30 group-hover:opacity-100 transition-all cursor-pointer">✕</button>
                        </div>
                        {(hasPlatformError || hasUrlError) && (
                          <p className="saas-error-message pl-1">
                            {errors[`socialLinks_${index}_platform`] || errors[`socialLinks_${index}_url`]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addSocial}
                  className={btnNeutralClass}
                >
                  <Plus size={14} /> Add Social Link
                </button>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Form Navigation/Actions */}
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
              <span>{initialData ? 'Updating Tool...' : 'Creating Tool...'}</span>
            </>
          ) : (
            initialData ? 'Update Tool' : 'Create Tool'
          )}
        </Button>
      </div>
    </form>
  );
}
