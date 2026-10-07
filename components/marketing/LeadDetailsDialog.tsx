'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Layers,
  Link as LinkIcon,
  Mail,
  MessageSquare,
  Plus,
  Send,
  ShoppingCart,
  Star,
  Trash2,
  Edit2,
  TrendingUp,
  UserCheck,
  Users,
  X,
  AlertCircle,
  LogIn,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Clock,
  Activity,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  addOutreachLeadEmailAction,
  updateOutreachLeadEmailAction,
  updateOutreachLeadEmailStatusAction,
  deleteOutreachLeadEmailAction,
  getOutreachLeadConversionsAction,
  type MarketingOutreachLead,
  type OutreachConversionEvent,
  type OutreachConversionSummary,
} from '@/app/admin/marketing/actions';
import {
  normalizeBusinessEmails,
  type BusinessEmailsMap,
  type EmailDeliverabilityStatus,
  type EmailRecord,
} from '@/lib/marketing/business-emails';
import { formatMessageTime, formatRelativeTime } from '@/lib/marketing/conversation';
import { formatLeadStatus, getLeadAutomationHint, getLeadStatusVariant } from '@/lib/marketing/lead-status';
import { LinkedinIcon, TwitterIcon } from './SocialIcons';
import EmailDeliverabilityBadge from './EmailDeliverabilityBadge';

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (defensive parsing for scraped data)
// ────────────────────────────────────────────────────────────────────────────

type LinkKind = 'twitter' | 'linkedin' | 'contact' | 'web';

interface DetailLink {
  href: string | null;
  label: string;
  title: string;
  kind: LinkKind;
}

interface TractionStat {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function getEventIcon(type: string) {
  switch (type) {
    case 'page_visit':
      return <Globe size={13} className="text-sky-500" />;
    case 'signup':
      return <UserCheck size={13} className="text-emerald-500" />;
    case 'login':
      return <LogIn size={13} className="text-indigo-500" />;
    case 'submission':
      return <Layers size={13} className="text-violet-500" />;
    case 'checkout':
      return <ShoppingCart size={13} className="text-amber-500" />;
    case 'purchase':
      return <CheckCircle2 size={13} className="text-emerald-500" />;
    default:
      return <TrendingUp size={13} className="text-zinc-500" />;
  }
}

function formatEventType(type: string): string {
  switch (type) {
    case 'page_visit':
      return 'Page Visit';
    case 'signup':
      return 'Account Signup';
    case 'login':
      return 'Account Login';
    case 'submission':
      return 'Tool Submission';
    case 'checkout':
      return 'Checkout Started';
    case 'purchase':
      return 'Successful Purchase';
    default:
      return type.replace(/_/g, ' ');
  }
}

const SOURCE_LABELS: Record<string, string> = {
  'producthunt.com': 'Product Hunt',
  producthunt: 'Product Hunt',
  'toolify.ai': 'Toolify',
  'theresanaiforthat.com': "There's An AI For That",
  'codehype.ai': 'CodeHype',
};

const LINK_TITLES: Record<LinkKind, string> = {
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  contact: 'Contact page',
  web: 'Website',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asText).filter((v): v is string => v !== null) : [];

const asDisplayNumber = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-US');
  return asText(value);
};

const uniqueCaseInsensitive = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Only http(s) URLs are rendered as links. */
function toSafeUrl(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const formatUrlLabel = (url: string): string =>
  url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSourceName(source: unknown): string {
  const raw = asText(source);
  if (!raw) return 'Scraped';
  return SOURCE_LABELS[raw.toLowerCase()] || raw.replace(/\.(com|ai|io|co)$/i, '');
}

function getLinkKind(href: string | null, fallback: LinkKind): LinkKind {
  if (!href) return fallback;
  const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'twitter';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  return fallback;
}

function toDetailLink(raw: string, fallback: LinkKind): DetailLink {
  const href = toSafeUrl(raw);
  const kind = getLinkKind(href, fallback);
  return { href, kind, title: LINK_TITLES[kind], label: formatUrlLabel(href || raw) };
}

function buildLeadDetails(lead: MarketingOutreachLead) {
  const meta = asRecord(lead.metadata);
  const traction = asRecord(meta.upvotes_reviews);
  const liveness = asRecord(meta.liveness);

  const launchDates = asStringList(meta.launch_dates)
    .filter((d) => !Number.isNaN(Date.parse(d)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  const pricingBadges = asStringList(meta.pricing_badges);
  const pricingModel = asText(meta.pricing_model);

  const rating = asDisplayNumber(traction.reviews_rating);
  const reviewsCount = asDisplayNumber(traction.reviews_count);
  const tractionCandidates: Array<Omit<TractionStat, 'value'> & { value: string | null }> = [
    { label: 'Followers', value: asDisplayNumber(traction.followers), icon: <Users size={12} /> },
    {
      label: reviewsCount ? `Rating (${reviewsCount})` : 'Rating',
      value: rating ? `${rating} / 5` : null,
      icon: <Star size={12} />,
    },
    { label: 'Monthly visits', value: asDisplayNumber(traction.toolify_monthly_visitors), icon: <Eye size={12} /> },
    { label: 'TAAFT saves', value: asDisplayNumber(traction.taaft_saves), icon: <Bookmark size={12} /> },
  ];
  const tractionStats = tractionCandidates.filter((s): s is TractionStat => s.value !== null);

  const sources = (Array.isArray(lead.sources) ? lead.sources : [])
    .filter((src) => src && typeof src === 'object')
    .map((src) => {
      const href = toSafeUrl(src.listing_url);
      return { name: formatSourceName(src.source), href, label: href ? formatUrlLabel(href) : null };
    });

  // Socials first, then contact pages; de-duplicated by URL.
  const seenLinks = new Set<string>();
  const links = [
    ...asStringList(lead.social_links).map((url) => toDetailLink(url, 'web')),
    ...asStringList(lead.contact_page_url).map((url) => toDetailLink(url, 'contact')),
  ].filter((link) => {
    const key = (link.href || link.label).toLowerCase();
    if (seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  const siteAlive = typeof liveness.site_alive === 'boolean' ? liveness.site_alive : null;

  return {
    siteUrl: toSafeUrl(lead.tool_site_url),
    description: asText(meta.description),
    recipientName: asText(meta.recipient_name),
    categories: uniqueCaseInsensitive(asStringList(meta.categories)),
    pricing: uniqueCaseInsensitive(pricingBadges.length > 0 ? pricingBadges : pricingModel ? [pricingModel] : []),
    mediums: uniqueCaseInsensitive(asStringList(lead.marketing_medium)),
    latestLaunch: launchDates[0] || null,
    launchCount: launchDates.length,
    siteAlive,
    livenessCheckedAt: asText(liveness.checked_at),
    emails: normalizeBusinessEmails(lead.business_emails),
    tractionStats,
    sources,
    links,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Presentational building blocks
// ────────────────────────────────────────────────────────────────────────────

const CHIP_CLASS = 'text-[10px] font-medium px-2 py-0.5 rounded-md';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="size-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? 'Copied to clipboard' : 'Copy'}
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </Button>
  );
}

function LinkKindIcon({ kind }: { kind: LinkKind }) {
  if (kind === 'twitter') return <TwitterIcon size={12} />;
  if (kind === 'linkedin') return <LinkedinIcon size={12} />;
  if (kind === 'contact') return <LinkIcon size={12} />;
  return <Globe size={12} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog
// ────────────────────────────────────────────────────────────────────────────

interface LeadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: MarketingOutreachLead;
  token?: string;
  onViewConversation?: (lead: MarketingOutreachLead) => void;
  onSendEmail?: (lead: MarketingOutreachLead) => void;
  onEditLead?: (lead: MarketingOutreachLead) => void;
  onDeleteLead?: (lead: MarketingOutreachLead) => void;
  onLeadUpdated?: (lead: MarketingOutreachLead) => void;
}

export default function LeadDetailsDialog({
  open,
  onOpenChange,
  lead,
  token,
  onViewConversation,
  onSendEmail,
  onEditLead,
  onDeleteLead,
  onLeadUpdated,
}: LeadDetailsDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync internal lead representation when external prop updates
  const [prevLead, setPrevLead] = useState(lead);
  const [currentLead, setCurrentLead] = useState<MarketingOutreachLead>(lead);
  if (lead !== prevLead) {
    setPrevLead(lead);
    setCurrentLead(lead);
  }

  // Business email operations state
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [newEmailVal, setNewEmailVal] = useState('');
  const [newEmailStatus, setNewEmailStatus] = useState<EmailDeliverabilityStatus>('unverified');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editEmailVal, setEditEmailVal] = useState('');
  const [editEmailStatus, setEditEmailStatus] = useState<EmailDeliverabilityStatus>('unverified');
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailActionTarget, setEmailActionTarget] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const details = useMemo(() => buildLeadDetails(currentLead), [currentLead]);
  const emailEntries = useMemo(() => Object.entries(details.emails || {}), [details.emails]);
  const automationHint = getLeadAutomationHint(currentLead);
  const summary = currentLead.conversation_summary;
  const hasEmail = emailEntries.length > 0;
  const initial = (currentLead.tool_name || '?').trim().charAt(0).toUpperCase() || '?';

  const initialConvEvents = currentLead.conversions?.events || currentLead.conversion_events || [];
  const initialConvSummary = currentLead.conversions?.summary || currentLead.conversion_summary || null;

  const handleAddEmail = async () => {
    if (!token) return;
    setEmailError(null);
    setEmailSuccess(null);

    const trimmed = newEmailVal.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Please enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email format.');
      return;
    }
    if (currentLead.business_emails && currentLead.business_emails[trimmed] !== undefined) {
      setEmailError(`"${trimmed}" is already added.`);
      return;
    }

    try {
      setEmailSubmitting(true);
      setEmailActionTarget('add');
      const res = await addOutreachLeadEmailAction(token, currentLead.id, trimmed, newEmailStatus);
      if (!res.success || !res.data) {
        setEmailError(res.error || 'Failed to add email.');
        return;
      }
      const updatedLead = { ...currentLead, business_emails: res.data.business_emails };
      setCurrentLead(updatedLead);
      onLeadUpdated?.(updatedLead);
      setIsAddingEmail(false);
      setNewEmailVal('');
      setNewEmailStatus('unverified');
      setEmailSuccess(`Added "${trimmed}" successfully.`);
      setTimeout(() => setEmailSuccess(null), 3000);
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to add email.');
    } finally {
      setEmailSubmitting(false);
      setEmailActionTarget(null);
    }
  };

  const handleStartEditEmail = (email: string, status: EmailDeliverabilityStatus) => {
    setEmailError(null);
    setEmailSuccess(null);
    setDeletingEmail(null);
    setIsAddingEmail(false);
    setEditingEmail(email);
    setEditEmailVal(email);
    setEditEmailStatus(status);
  };

  const handleSaveEditEmail = async (oldEmail: string) => {
    if (!token) return;
    setEmailError(null);
    setEmailSuccess(null);

    const trimmed = editEmailVal.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Email cannot be empty.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email format.');
      return;
    }
    if (trimmed === oldEmail.toLowerCase() && editEmailStatus === currentLead.business_emails?.[oldEmail]?.status) {
      setEditingEmail(null);
      setEditEmailVal('');
      return;
    }
    if (
      currentLead.business_emails &&
      currentLead.business_emails[trimmed] !== undefined &&
      trimmed !== oldEmail.toLowerCase()
    ) {
      setEmailError(`"${trimmed}" is already listed.`);
      return;
    }

    try {
      setEmailSubmitting(true);
      setEmailActionTarget(oldEmail);
      const res = await updateOutreachLeadEmailAction(token, currentLead.id, oldEmail, trimmed, editEmailStatus);
      if (!res.success || !res.data) {
        setEmailError(res.error || 'Failed to update email.');
        return;
      }
      const updatedLead = { ...currentLead, business_emails: res.data.business_emails };
      setCurrentLead(updatedLead);
      onLeadUpdated?.(updatedLead);
      setEditingEmail(null);
      setEditEmailVal('');
      setEmailSuccess(`Updated to "${trimmed}".`);
      setTimeout(() => setEmailSuccess(null), 3000);
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to update email.');
    } finally {
      setEmailSubmitting(false);
      setEmailActionTarget(null);
    }
  };

  const handleStatusChange = async (email: string, newStatus: EmailDeliverabilityStatus) => {
    if (!token) return;
    setEmailError(null);
    setEmailSuccess(null);

    try {
      setEmailSubmitting(true);
      setEmailActionTarget(email);
      const res = await updateOutreachLeadEmailStatusAction(token, currentLead.id, email, newStatus);
      if (!res.success || !res.data) {
        setEmailError(res.error || 'Failed to update email deliverability status.');
        return;
      }
      const updatedLead = { ...currentLead, business_emails: res.data.business_emails };
      setCurrentLead(updatedLead);
      onLeadUpdated?.(updatedLead);
      setEmailSuccess(`Updated "${email}" to ${newStatus}.`);
      setTimeout(() => setEmailSuccess(null), 3000);
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to update email status.');
    } finally {
      setEmailSubmitting(false);
      setEmailActionTarget(null);
    }
  };

  const handleDeleteEmail = async (emailToDelete: string) => {
    if (!token) return;
    setEmailError(null);
    setEmailSuccess(null);

    try {
      setEmailSubmitting(true);
      setEmailActionTarget(emailToDelete);
      const res = await deleteOutreachLeadEmailAction(token, currentLead.id, emailToDelete);
      if (!res.success || !res.data) {
        setEmailError(res.error || 'Failed to delete email.');
        return;
      }
      const updatedLead = { ...currentLead, business_emails: res.data.business_emails };
      setCurrentLead(updatedLead);
      onLeadUpdated?.(updatedLead);
      setDeletingEmail(null);
      setEmailSuccess(`Removed "${emailToDelete}".`);
      setTimeout(() => setEmailSuccess(null), 3000);
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to delete email.');
    } finally {
      setEmailSubmitting(false);
      setEmailActionTarget(null);
    }
  };

  // Conversion tracking state
  const [conversionData, setConversionData] = useState<{
    events: OutreachConversionEvent[];
    summary: OutreachConversionSummary | null;
  }>({
    events: initialConvEvents,
    summary: initialConvSummary,
  });
  const [loadingConversions, setLoadingConversions] = useState(false);

  useEffect(() => {
    if (!token || !open) return;
    if (initialConvEvents.length > 0) return;

    let isCancelled = false;
    const fetchConversions = async () => {
      try {
        setLoadingConversions(true);
        const res = await getOutreachLeadConversionsAction(token, lead.id);
        if (!isCancelled && res.success && res.data) {
          setConversionData(res.data);
        }
      } catch (err) {
        console.error('Failed to load lead conversions:', err);
      } finally {
        if (!isCancelled) setLoadingConversions(false);
      }
    };
    fetchConversions();
    return () => {
      isCancelled = true;
    };
  }, [open, token, lead.id, lead.conversions, lead.conversion_events, lead.conversion_summary]);

  const convSummary = conversionData.summary || initialConvSummary;
  const conversionEvents = conversionData.events.length > 0 ? conversionData.events : initialConvEvents;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-4xl xl:max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-zinc-800/80 shadow-2xl transition-all"
      >
        {/* ── Dialog Header ── */}
        <DialogHeader className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-left space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              {/* Tool Avatar */}
              <div
                aria-hidden="true"
                className="size-11 sm:size-12 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200/80 dark:from-zinc-800 dark:to-zinc-800/50 border border-zinc-200/90 dark:border-zinc-700/60 flex items-center justify-center text-lg font-bold text-zinc-900 dark:text-zinc-100 shrink-0 shadow-2xs"
              >
                {initial}
              </div>

              {/* Title & Metadata row */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <DialogTitle
                    id={titleId}
                    className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate"
                  >
                    {lead.tool_name || 'Untitled lead'}
                  </DialogTitle>
                  <Badge variant={getLeadStatusVariant(lead.status)} className="font-semibold shadow-2xs">
                    {formatLeadStatus(lead.status)}
                  </Badge>
                  {(lead.metadata?.is_tool_submission === true || lead.metadata?.is_tool_submission === 'true') && (
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                      Submitted Tool
                    </Badge>
                  )}
                  {automationHint && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/60"
                      title={automationHint.title}
                    >
                      <Sparkles size={11} className="text-amber-500 shrink-0" />
                      {automationHint.label}
                    </span>
                  )}
                </div>

                {/* Subtitle: URL & Website Status */}
                <div className="flex items-center gap-2.5 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                  {details.siteUrl ? (
                    <a
                      href={details.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
                    >
                      <span className="truncate max-w-[280px] sm:max-w-md">{formatUrlLabel(details.siteUrl)}</span>
                      <ArrowUpRight size={12} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : lead.tool_site_url ? (
                    <span className="font-mono truncate max-w-[280px] sm:max-w-md">{lead.tool_site_url}</span>
                  ) : null}

                  {details.siteAlive !== null && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <span
                          className={`size-2 rounded-full ${
                            details.siteAlive ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-rose-500 ring-2 ring-rose-500/20'
                          }`}
                        />
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">
                          {details.siteAlive ? 'Live' : 'Unreachable'}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {/* Description */}
                <DialogDescription
                  id={descriptionId}
                  className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1 line-clamp-2 max-w-3xl"
                >
                  {details.description || 'No description available for this tool.'}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Header Action Buttons (with margin for X button) */}
            <div className="flex items-center gap-2 self-start shrink-0 pr-8 sm:pr-8">
              {onEditLead && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditLead(currentLead)}
                  className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={`Edit ${lead.tool_name}`}
                >
                  <Edit2 size={12} />
                  <span>Edit</span>
                </Button>
              )}
              {onViewConversation && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewConversation(lead)}
                  className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <MessageSquare size={12} />
                  <span>Chat</span>
                </Button>
              )}
              {onSendEmail && (
                <Button
                  size="sm"
                  onClick={() => onSendEmail(lead)}
                  disabled={!hasEmail}
                  className="h-8 text-xs gap-1.5 font-medium shadow-xs"
                  title={hasEmail ? `Send email to ${lead.tool_name}` : 'No email available'}
                >
                  <Send size={12} />
                  <span>Send email</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ── Dialog Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
          {/* ── 1. Hero Funnel & Metrics Strip (Unified 5-KPI milestone cards) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* Outreach Activity */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Outreach</span>
                <Mail size={13} className="text-zinc-400" />
              </div>
              <div className="my-1 text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {(summary?.outbound_count ?? 0).toLocaleString('en-US')} sent
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                {(summary?.reply_count ?? 0)} replies · {emailEntries.length} emails
              </div>
            </div>

            {/* Website Visits */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Visits</span>
                <Globe size={13} className="text-sky-500" />
              </div>
              <div className="my-1 text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {convSummary?.visit_count
                  ? `${convSummary.visit_count} ${convSummary.visit_count === 1 ? 'visit' : 'visits'}`
                  : '0 visits'}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">Attributed traffic</div>
            </div>

            {/* Toolbit User */}
            <div
              className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${
                convSummary?.signed_up
                  ? 'border-emerald-200/80 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/10'
                  : 'border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Account</span>
                <UserCheck
                  size={13}
                  className={convSummary?.signed_up ? 'text-emerald-500' : 'text-zinc-400'}
                />
              </div>
              <div
                className={`my-1 text-base font-bold truncate ${
                  convSummary?.signed_up ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {convSummary?.signed_up ? 'Signed Up' : 'Anonymous'}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                {convSummary?.signed_up ? 'Registered user' : 'No account yet'}
              </div>
            </div>

            {/* Tool Submission */}
            <div
              className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${
                convSummary?.submitted
                  ? 'border-violet-200/80 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/10'
                  : 'border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Submission</span>
                <Layers
                  size={13}
                  className={convSummary?.submitted ? 'text-violet-500' : 'text-zinc-400'}
                />
              </div>
              <div
                className={`my-1 text-base font-bold truncate ${
                  convSummary?.submitted ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {convSummary?.submitted ? `${convSummary.submission_count || 1} submitted` : 'None'}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                {convSummary?.submitted_at ? formatDate(convSummary.submitted_at) : 'No submissions'}
              </div>
            </div>

            {/* Orders / Revenue */}
            <div
              className={`p-3 rounded-xl border col-span-2 sm:col-span-1 flex flex-col justify-between transition-colors ${
                convSummary?.purchased
                  ? 'border-amber-200/80 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/10'
                  : 'border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>Revenue</span>
                <ShoppingCart
                  size={13}
                  className={convSummary?.purchased ? 'text-amber-500' : 'text-zinc-400'}
                />
              </div>
              <div
                className={`my-1 text-base font-bold truncate ${
                  convSummary?.purchased ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {convSummary?.purchased ? `$${convSummary.total_spent_usd || 0}` : '$0'}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                {convSummary?.purchased ? 'Paid customer' : 'No purchases'}
              </div>
            </div>
          </div>

          {/* ── 2. Two-Column Layout (Main Actions/Timeline & Sidebar Meta) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── Left Column: Operations & Activity Journey (7 cols) ── */}
            <div className="lg:col-span-7 space-y-6">
              {/* Linked Toolbit User Banner (if present) */}
              {(convSummary?.toolbit_user_email || convSummary?.toolbit_user_id) && (
                <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <UserCheck size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                          Linked Toolbit Account:
                        </span>
                        <span className="font-mono text-xs font-medium text-emerald-800 dark:text-emerald-300 truncate">
                          {convSummary.toolbit_user_email || 'Email not recorded'}
                        </span>
                      </div>
                      {convSummary.toolbit_user_id && (
                        <div className="text-[10px] font-mono text-emerald-700/70 dark:text-emerald-400/70 truncate mt-0.5">
                          ID: {convSummary.toolbit_user_id}
                        </div>
                      )}
                    </div>
                  </div>
                  {convSummary.toolbit_user_email && (
                    <CopyButton value={convSummary.toolbit_user_email} label="User email" />
                  )}
                </div>
              )}

              {/* Business Emails Card */}
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 shadow-2xs">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-zinc-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Business Emails
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {emailEntries.length}
                    </span>
                  </div>

                  {token && !isAddingEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingEmail(true);
                        setEmailError(null);
                        setEditingEmail(null);
                        setDeletingEmail(null);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>Add email</span>
                    </button>
                  )}
                </div>

                {/* Inline Alert Feedback */}
                {emailError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle size={13} className="shrink-0 text-rose-600 dark:text-rose-400" />
                      <span className="truncate">{emailError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailError(null)}
                      className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {emailSuccess && (
                  <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate">{emailSuccess}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailSuccess(null)}
                      className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Inline Add Email Form */}
                {isAddingEmail && (
                  <div className="mb-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="email"
                        value={newEmailVal}
                        onChange={(e) => {
                          setNewEmailVal(e.target.value);
                          if (emailError) setEmailError(null);
                        }}
                        placeholder="e.g. founder@domain.com"
                        className="h-8 text-xs font-mono flex-1 bg-white dark:bg-zinc-900"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddEmail();
                          } else if (e.key === 'Escape') {
                            setIsAddingEmail(false);
                            setNewEmailVal('');
                          }
                        }}
                        disabled={emailSubmitting && emailActionTarget === 'add'}
                      />
                      <select
                        value={newEmailStatus}
                        onChange={(e) => setNewEmailStatus(e.target.value as EmailDeliverabilityStatus)}
                        disabled={emailSubmitting && emailActionTarget === 'add'}
                        className="h-8 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
                        title="Initial deliverability status"
                      >
                        <option value="unverified">Unverified</option>
                        <option value="deliverable">Deliverable</option>
                        <option value="undeliverable">Undeliverable</option>
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddEmail}
                        disabled={(emailSubmitting && emailActionTarget === 'add') || !newEmailVal.trim()}
                        className="h-8 text-xs px-3 font-semibold gap-1 shrink-0"
                      >
                        {emailSubmitting && emailActionTarget === 'add' ? <Spinner size={12} /> : <Check size={12} />}
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsAddingEmail(false);
                          setNewEmailVal('');
                        }}
                        disabled={emailSubmitting && emailActionTarget === 'add'}
                        className="h-8 text-xs px-2.5 shrink-0"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Emails List */}
                {hasEmail ? (
                  <div className="space-y-1.5">
                    {emailEntries.map(([email, rawRecord]) => {
                      const record: EmailRecord =
                        typeof rawRecord === 'object' && rawRecord !== null
                          ? (rawRecord as EmailRecord)
                          : { status: (rawRecord as any) || 'unverified' };
                      const isEditingThis = editingEmail === email;
                      const isDeletingThis = deletingEmail === email;
                      const isBusyThis = emailSubmitting && emailActionTarget === email;

                      if (isEditingThis) {
                        return (
                          <div
                            key={email}
                            className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40"
                          >
                            <div className="flex items-center gap-2">
                              <Input
                                type="email"
                                value={editEmailVal}
                                onChange={(e) => setEditEmailVal(e.target.value)}
                                className="h-7 text-xs font-mono flex-1 bg-white dark:bg-zinc-900"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveEditEmail(email);
                                  } else if (e.key === 'Escape') {
                                    setEditingEmail(null);
                                    setEditEmailVal('');
                                  }
                                }}
                                disabled={isBusyThis}
                              />
                              <select
                                value={editEmailStatus}
                                onChange={(e) => setEditEmailStatus(e.target.value as EmailDeliverabilityStatus)}
                                disabled={isBusyThis}
                                className="h-7 text-xs px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
                              >
                                <option value="unverified">Unverified</option>
                                <option value="deliverable">Deliverable</option>
                                <option value="undeliverable">Undeliverable</option>
                              </select>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleSaveEditEmail(email)}
                                disabled={isBusyThis || !editEmailVal.trim()}
                                className="h-7 text-xs px-2.5 font-semibold gap-1 shrink-0"
                              >
                                {isBusyThis ? <Spinner size={10} /> : <Check size={11} />}
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingEmail(null);
                                  setEditEmailVal('');
                                }}
                                disabled={isBusyThis}
                                className="h-7 text-xs px-2 shrink-0"
                              >
                                <X size={11} />
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      if (isDeletingThis) {
                        return (
                          <div
                            key={email}
                            className="flex items-center justify-between gap-3 p-2 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40"
                          >
                            <span className="text-xs text-rose-700 dark:text-rose-300 font-medium truncate">
                              Delete <strong>{email}</strong>?
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteEmail(email)}
                                disabled={isBusyThis}
                                className="h-6 text-[11px] px-2 font-semibold gap-1 bg-rose-600 hover:bg-rose-700 text-white"
                              >
                                {isBusyThis ? <Spinner size={10} /> : <Trash2 size={11} />}
                                Delete
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDeletingEmail(null)}
                                disabled={isBusyThis}
                                className="h-6 text-[11px] px-2"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={email}
                          className="rounded-lg border border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-800/20 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 transition-colors group"
                        >
                          <div className="flex items-center justify-between gap-3 p-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="size-6 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                                <Mail size={12} />
                              </span>
                              <span
                                className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 select-all truncate"
                                title={email}
                              >
                                {email}
                              </span>
                              <EmailDeliverabilityBadge
                                email={email}
                                record={record}
                                size="sm"
                                showEmail={false}
                                showPrimaryBadge={false}
                                onStatusChange={token ? (st) => handleStatusChange(email, st) : undefined}
                                disabled={!token || emailSubmitting}
                              />
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <CopyButton value={email} label={email} />

                              {token && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditEmail(email, record.status)}
                                    disabled={emailSubmitting}
                                    className="size-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Edit email"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingEmail(email);
                                      setEditingEmail(null);
                                      setIsAddingEmail(false);
                                    }}
                                    disabled={emailSubmitting}
                                    className="size-7 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Delete email"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {record.resend_status === 'bounced' && record.bounce_reason && (
                            <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 px-3 pb-2.5 font-medium">
                              <AlertCircle size={12} className="shrink-0" />
                              <span>Bounced in Resend: {record.bounce_reason}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  !isAddingEmail && (
                    <div className="flex items-center justify-between p-3.5 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
                      <span>No business email found for this tool.</span>
                      {token && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAddingEmail(true)}
                          className="h-7 text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                        >
                          <Plus size={11} />
                          Add email
                        </Button>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Activity Journey Card (Clean Modern Timeline) */}
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={13} className="text-zinc-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Activity Journey
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {conversionEvents.length}
                    </span>
                  </div>
                  {loadingConversions && <Spinner size={12} />}
                </div>

                {conversionEvents.length > 0 ? (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
                    {conversionEvents.map((evt, idx) => (
                      <div key={evt.id || idx} className="relative group">
                        {/* Timeline Node Icon */}
                        <span className="absolute -left-6 top-0.5 size-5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center text-zinc-500 dark:text-zinc-400 shadow-2xs">
                          {getEventIcon(evt.type)}
                        </span>

                        {/* Event Content */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {formatEventType(evt.type)}
                            </span>
                            <time
                              className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0"
                              title={formatMessageTime(evt.at)}
                            >
                              {formatRelativeTime(evt.at)}
                            </time>
                          </div>

                          {/* Event Attribute Tags */}
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                            {evt.page && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 font-mono">
                                {evt.page}
                              </span>
                            )}
                            {(evt.utm_campaign || evt.data?.utm_campaign) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/50 font-medium">
                                {evt.utm_campaign || evt.data?.utm_campaign}
                              </span>
                            )}
                            {evt.user_email && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 font-mono">
                                {evt.user_email}
                              </span>
                            )}
                            {evt.type === 'purchase' && (evt.data?.amount_usd || evt.data?.amount) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 font-bold">
                                ${evt.data?.amount_usd || evt.data?.amount}
                              </span>
                            )}
                            {evt.type === 'submission' && evt.data?.tool_name && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-200/50 dark:border-violet-800/50 font-medium">
                                Tool: {evt.data.tool_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 text-center">
                    {loadingConversions
                      ? 'Loading conversion events...'
                      : 'No website activity recorded yet for this outreach lead.'}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Column: Overview, Traction & Links (5 cols) ── */}
            <div className="lg:col-span-5 space-y-5">
              {/* Tool Overview Card */}
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Info size={13} className="text-zinc-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Overview & Details
                  </h3>
                </div>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
                  {/* Categories */}
                  <div className="py-2 first:pt-0 flex items-start justify-between gap-3">
                    <span className="text-zinc-400 shrink-0">Categories</span>
                    <div className="text-right">
                      {details.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {details.categories.map((cat) => (
                            <Badge key={cat} variant="secondary" className={CHIP_CLASS}>
                              {cat}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="py-2 flex items-center justify-between gap-3">
                    <span className="text-zinc-400 shrink-0">Pricing</span>
                    <div>
                      {details.pricing.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {details.pricing.map((price) => (
                            <Badge key={price} variant="outline" className={CHIP_CLASS}>
                              {price}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                  </div>

                  {/* Recipient */}
                  {details.recipientName && (
                    <div className="py-2 flex items-center justify-between gap-3">
                      <span className="text-zinc-400 shrink-0">Recipient</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {details.recipientName}
                      </span>
                    </div>
                  )}

                  {/* Outreach Medium */}
                  {details.mediums.length > 0 && (
                    <div className="py-2 flex items-center justify-between gap-3">
                      <span className="text-zinc-400 shrink-0">Medium</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                        {details.mediums.join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Website Status */}
                  {details.siteAlive !== null && (
                    <div className="py-2 flex items-center justify-between gap-3">
                      <span className="text-zinc-400 shrink-0">Website</span>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span
                          className={`size-2 rounded-full ${
                            details.siteAlive ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className={details.siteAlive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                          {details.siteAlive ? 'Online' : 'Unreachable'}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Latest Launch */}
                  {details.latestLaunch && (
                    <div className="py-2 flex items-center justify-between gap-3">
                      <span className="text-zinc-400 shrink-0">Launch</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatDate(details.latestLaunch)}
                        {details.launchCount > 1 && (
                          <span className="text-zinc-400 font-normal"> ({details.launchCount})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Date Added */}
                  <div className="py-2 flex items-center justify-between gap-3">
                    <span className="text-zinc-400 shrink-0">Added</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {lead.created_at ? formatMessageTime(lead.created_at) : '—'}
                    </span>
                  </div>

                  {/* Last Updated */}
                  <div className="py-2 last:pb-0 flex items-center justify-between gap-3">
                    <span className="text-zinc-400 shrink-0">Updated</span>
                    <span className="text-zinc-600 dark:text-zinc-400" title={lead.updated_at ? formatMessageTime(lead.updated_at) : ''}>
                      {lead.updated_at ? formatRelativeTime(lead.updated_at) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Traction Stats Card (if available) */}
              {details.tractionStats.length > 0 && (
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Star size={13} className="text-amber-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Traction & Social Proof
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {details.tractionStats.map((stat) => (
                      <div
                        key={stat.label}
                        className="p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30"
                      >
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px]">
                          {stat.icon}
                          <span className="truncate">{stat.label}</span>
                        </div>
                        <div className="mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources Card */}
              {details.sources.length > 0 && (
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers size={13} className="text-zinc-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Listing Sources
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {details.sources.length}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {details.sources.map((src, i) => (
                      <div
                        key={`${src.name}-${src.href || i}`}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-6 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                            <Layers size={12} />
                          </span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {src.name}
                          </span>
                        </div>
                        {src.href && (
                          <a
                            href={src.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1"
                            title="Open listing"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Socials & Links Card */}
              {details.links.length > 0 && (
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LinkIcon size={13} className="text-zinc-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Socials & Links
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {details.links.length}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {details.links.map((link) => (
                      <div
                        key={link.href || link.label}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-6 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                            <LinkKindIcon kind={link.kind} />
                          </span>
                          <div className="min-w-0">
                            <span className="block font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {link.title}
                            </span>
                            <span className="block text-[10px] font-mono text-zinc-400 truncate">
                              {link.label}
                            </span>
                          </div>
                        </div>
                        {link.href && (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1 shrink-0"
                            title={`Open ${link.title}`}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Dialog Footer ── */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-400 font-mono">
              {lead.id ? `Lead ID: ${lead.id.slice(0, 8)}...` : ''}
            </span>
            {onDeleteLead && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteLead(currentLead)}
                className="h-7 text-xs px-2 gap-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 cursor-pointer"
                title={`Delete ${lead.tool_name}`}
              >
                <Trash2 size={12} />
                <span>Delete Lead</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs border-zinc-200 dark:border-zinc-800"
            >
              Close
            </Button>
            {onEditLead && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditLead(currentLead)}
                className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                title={`Edit ${lead.tool_name}`}
              >
                <Edit2 size={12} />
                <span>Edit Details</span>
              </Button>
            )}
            {onViewConversation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewConversation(lead)}
                className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800"
              >
                <MessageSquare size={12} />
                <span>View conversation</span>
              </Button>
            )}
            {onSendEmail && (
              <Button
                size="sm"
                onClick={() => onSendEmail(lead)}
                disabled={!hasEmail}
                className="h-8 text-xs gap-1.5 font-medium shadow-xs"
                title={hasEmail ? `Send email to ${lead.tool_name}` : 'No email available'}
              >
                <Send size={12} />
                <span>Send email</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
