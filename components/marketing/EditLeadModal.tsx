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
  Edit2,
  Globe,
  AlertCircle,
  ExternalLink,
  Save,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { LinkedinIcon, TwitterIcon } from './SocialIcons';
import {
  updateOutreachLeadAction,
  type UpdateOutreachLeadInput,
} from '@/app/admin/marketing/actions';
import type { MarketingOutreachLead } from '@/lib/marketing/leads-query';
import { LEAD_STATUS_OPTIONS } from '@/lib/marketing/lead-status';

interface EditLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: MarketingOutreachLead | null;
  token: string;
  onLeadUpdated: (updatedLead: MarketingOutreachLead) => void;
}

const PRICING_OPTIONS = [
  'Free',
  'Freemium',
  'Paid',
  'Free Trial',
  'Open Source',
  'Contact for Pricing',
];

export default function EditLeadModal({
  open,
  onOpenChange,
  lead,
  token,
  onLeadUpdated,
}: EditLeadModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [toolName, setToolName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [status, setStatus] = useState('pending');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [contactUrl, setContactUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('');
  const [pricingModel, setPricingModel] = useState('');

  // Sync state when lead changes
  useEffect(() => {
    if (lead) {
      setToolName(lead.tool_name || '');
      setSiteUrl(lead.tool_site_url || '');
      setStatus(lead.status || 'pending');

      const socials = Array.isArray(lead.social_links) ? lead.social_links : [];
      const tw = socials.find((s) => s.includes('twitter.com') || s.includes('x.com')) || '';
      const li = socials.find((s) => s.includes('linkedin.com')) || '';
      setTwitterUrl(tw);
      setLinkedinUrl(li);

      const contacts = Array.isArray(lead.contact_page_url) ? lead.contact_page_url : [];
      setContactUrl(contacts[0] || '');

      const meta = (lead.metadata || {}) as Record<string, any>;
      setDescription(meta.description || '');

      const cats = Array.isArray(meta.categories) ? meta.categories.join(', ') : '';
      setCategoriesInput(cats);

      setPricingModel(meta.pricing_model || '');
      setError(null);
    }
  }, [lead]);

  if (!lead) return null;

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
      // Rebuild socials array preserving non-twitter/linkedin links
      const otherSocials = (lead.social_links || []).filter(
        (s) => !s.includes('twitter.com') && !s.includes('x.com') && !s.includes('linkedin.com')
      );
      if (twitterUrl.trim()) otherSocials.push(twitterUrl.trim());
      if (linkedinUrl.trim()) otherSocials.push(linkedinUrl.trim());

      // Rebuild contact URLs
      const otherContacts = (lead.contact_page_url || []).slice(1);
      const contactPages: string[] = [];
      if (contactUrl.trim()) contactPages.push(contactUrl.trim());
      contactPages.push(...otherContacts);

      // Parse categories
      const categories = categoriesInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const payload: UpdateOutreachLeadInput = {
        tool_name: cleanName,
        tool_site_url: cleanUrl,
        status: status,
        social_links: otherSocials,
        contact_page_url: contactPages,
        metadata: {
          ...(lead.metadata || {}),
          description: description.trim(),
          categories: categories,
          pricing_model: pricingModel.trim() || undefined,
        },
      };

      const res = await updateOutreachLeadAction(token, lead.id, payload);

      if (res.success && res.data) {
        onLeadUpdated(res.data);
        onOpenChange(false);
      } else {
        setError(res.error || 'Failed to update outreach lead.');
      }
    } catch (err: any) {
      console.error('Error updating outreach lead:', err);
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
              <Edit2 size={18} />
            </div>
            <div>
              <DialogTitle id={titleId} className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Edit Lead: {lead.tool_name}
              </DialogTitle>
              <DialogDescription id={descriptionId} className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Update details, website link, status, and metadata for this lead.
              </DialogDescription>
            </div>
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

            {/* Tool Identity Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <span>Tool / Product Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  placeholder="Tool name"
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

            {/* Status & Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Pricing Model
                </label>
                <Select
                  value={pricingModel || 'none'}
                  onChange={(val) => setPricingModel(val === 'none' ? '' : val)}
                  className="h-9 text-xs"
                >
                  <SelectItem value="none">Not Specified</SelectItem>
                  {PRICING_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>

            {/* Social Links & Contact Page */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Online Links & Socials
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
                  placeholder="Short description of what the tool does..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[75px] text-xs resize-none"
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
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
