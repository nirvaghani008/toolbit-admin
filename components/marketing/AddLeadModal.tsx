'use client';

import React, { useState, useId, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Sparkles,
  Search,
  Globe,
  Mail,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
  Layers,
  Wrench,
  FileText,
} from 'lucide-react';
import { LinkedinIcon, TwitterIcon } from './SocialIcons';
import MarketingToolSearchSelect from './MarketingToolSearchSelect';
import {
  createOutreachLeadAction,
  type CreateOutreachLeadInput,
} from '@/app/admin/marketing/actions';
import type { MarketingOutreachLead } from '@/lib/marketing/leads-query';
import type { EmailDeliverabilityStatus } from '@/lib/marketing/business-emails';
import { LEAD_STATUS_OPTIONS } from '@/lib/marketing/lead-status';

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onLeadCreated: (newLead: MarketingOutreachLead) => void;
}

type Mode = 'catalog' | 'manual';

export default function AddLeadModal({
  open,
  onOpenChange,
  token,
  onLeadCreated,
}: AddLeadModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const [mode, setMode] = useState<Mode>('catalog');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields - Common
  const [toolName, setToolName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [status, setStatus] = useState('pending');
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailDeliverabilityStatus>('unverified');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [contactUrl, setContactUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('');

  // Catalog Tool Selection Metadata
  const [selectedCatalogTool, setSelectedCatalogTool] = useState<{
    id?: number | string;
    name: string;
    slug: string;
    site_url: string;
    favicon_url?: string | null;
  } | null>(null);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (open) {
      setError(null);
      setIsSubmitting(false);
    } else {
      setToolName('');
      setSiteUrl('');
      setStatus('pending');
      setEmail('');
      setEmailStatus('unverified');
      setTwitterUrl('');
      setLinkedinUrl('');
      setContactUrl('');
      setDescription('');
      setCategoriesInput('');
      setSelectedCatalogTool(null);
      setError(null);
    }
  }, [open]);

  // Handler for tool select from Catalog
  const handleSelectCatalogTool = (tool: {
    id?: number | string;
    name: string;
    slug: string;
    site_url: string;
    favicon_url?: string | null;
  }) => {
    setSelectedCatalogTool(tool);
    setToolName(tool.name);
    setSiteUrl(tool.site_url);
    setError(null);
  };

  const handleClearCatalogTool = () => {
    setSelectedCatalogTool(null);
    setToolName('');
    setSiteUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = toolName.trim();
    if (!cleanName) {
      setError('Please provide a tool name.');
      return;
    }

    const cleanUrl = siteUrl.trim();
    if (!cleanUrl) {
      setError('Please provide a valid website URL.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build business_emails map if provided
      const businessEmails: Record<string, any> = {};
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          setError('Please provide a valid email address.');
          setIsSubmitting(false);
          return;
        }
        businessEmails[cleanEmail] = {
          status: emailStatus,
        };
      }

      // Build socials array
      const socialLinks: string[] = [];
      if (twitterUrl.trim()) socialLinks.push(twitterUrl.trim());
      if (linkedinUrl.trim()) socialLinks.push(linkedinUrl.trim());

      // Build contact page array
      const contactPages: string[] = [];
      if (contactUrl.trim()) contactPages.push(contactUrl.trim());

      // Parse categories
      const categories = categoriesInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      // Build sources
      const sources: Array<{ source?: string; listing_url?: string; [key: string]: any }> = [];
      if (mode === 'catalog' && selectedCatalogTool) {
        sources.push({
          source: 'toolbit_catalog',
          tool_id: selectedCatalogTool.id,
          slug: selectedCatalogTool.slug,
        });
      } else {
        sources.push({ source: 'manual' });
      }

      const payload: CreateOutreachLeadInput = {
        tool_name: cleanName,
        tool_site_url: cleanUrl,
        business_emails: businessEmails,
        status: status,
        social_links: socialLinks,
        contact_page_url: contactPages,
        sources,
        metadata: {
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(categories.length > 0 ? { categories } : {}),
          ...(selectedCatalogTool?.favicon_url ? { favicon_url: selectedCatalogTool.favicon_url } : {}),
          ...(selectedCatalogTool?.id ? { tool_id: selectedCatalogTool.id } : {}),
        },
      };

      const res = await createOutreachLeadAction(token, payload);

      if (res.success && res.data) {
        onLeadCreated(res.data);
        onOpenChange(false);
      } else {
        setError(res.error || 'Failed to create outreach lead.');
      }
    } catch (err: any) {
      console.error('Error creating outreach lead:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[95vw] max-w-xl max-h-[90vh] flex flex-col p-0 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
              <Plus size={18} />
            </div>
            <div>
              <DialogTitle id={titleId} className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Add Outreach Lead
              </DialogTitle>
              <DialogDescription id={descriptionId} className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Add a new tool or product record to your outreach marketing leads.
              </DialogDescription>
            </div>
          </div>

          {/* Mode switch pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 mt-4">
            <button
              type="button"
              onClick={() => {
                setMode('catalog');
                setError(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'catalog'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Layers size={13} />
              <span>Import from Catalog</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setError(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Wrench size={13} />
              <span>Custom Manual Record</span>
            </button>
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs animate-in fade-in-50">
                <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Catalog Selector Mode */}
            {mode === 'catalog' && (
              <div className="space-y-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                  <span>Search Catalog Tool</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    ai_tools directory
                  </Badge>
                </label>
                <MarketingToolSearchSelect
                  token={token}
                  value={toolName}
                  siteUrl={siteUrl}
                  onSelectTool={(tool) => handleSelectCatalogTool(tool)}
                  onChangeToolName={(name) => setToolName(name)}
                  onChangeSiteUrl={(url) => setSiteUrl(url)}
                  onClear={handleClearCatalogTool}
                />
                {selectedCatalogTool && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span className="font-semibold truncate">{selectedCatalogTool.name}</span>
                    </div>
                    {selectedCatalogTool.slug && (
                      <span className="text-[10px] font-mono opacity-70 truncate max-w-[150px]">
                        {selectedCatalogTool.slug}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tool Identity Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <span>Tool / Product Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  placeholder="e.g. Cursor, Lovable, v0"
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <span>Website URL</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Globe size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    required
                    type="url"
                    placeholder="https://example.com"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    className="pl-8 h-9 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Business Email & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Initial Business Email
                </label>
                <div className="relative">
                  <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="email"
                    placeholder="contact@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-8 h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Outreach Status
                </label>
                <Select
                  value={status}
                  onChange={(val) => setStatus(val)}
                  className="h-9 text-xs"
                >
                  {LEAD_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>

            {/* Social Links & Contact Page */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Online Links & Socials (Optional)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <TwitterIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Twitter/X URL"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    className="pl-8 h-8 text-xs font-mono"
                  />
                </div>
                <div className="relative">
                  <LinkedinIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="LinkedIn URL"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="pl-8 h-8 text-xs font-mono"
                  />
                </div>
                <div className="relative">
                  <ExternalLink size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Contact Page URL"
                    value={contactUrl}
                    onChange={(e) => setContactUrl(e.target.value)}
                    className="pl-8 h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Description & Categories */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description / Pitch Notes
                </label>
                <Textarea
                  placeholder="Short description of what the tool does, key value prop, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[70px] text-xs resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Categories / Tags</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Comma-separated</span>
                </label>
                <Input
                  placeholder="AI Coding, Productivity, Marketing"
                  value={categoriesInput}
                  onChange={(e) => setCategoriesInput(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="h-9 text-xs gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-semibold cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Spinner size={14} />
                  <span>Adding Lead...</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Add Outreach Lead</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
