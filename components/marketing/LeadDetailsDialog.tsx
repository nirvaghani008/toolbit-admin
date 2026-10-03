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
// Pure helpers (lead data is scraped, so every field is parsed defensively)
// ────────────────────────────────────────────────────────────────────────────

type LinkKind = 'twitter' | 'linkedin' | 'contact' | 'web';

interface DetailLink {
  /** Safe http(s) URL, or null when the stored value can't be linked. */
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
      return <Globe size={13} />;
    case 'signup':
      return <UserCheck size={13} className="text-emerald-500" />;
    case 'login':
      return <LogIn size={13} className="text-indigo-500" />;
    case 'submission':
      return <Layers size={13} className="text-indigo-500" />;
    case 'checkout':
      return <ShoppingCart size={13} className="text-amber-500" />;
    case 'purchase':
      return <CheckCircle2 size={13} className="text-emerald-500" />;
    default:
      return <TrendingUp size={13} />;
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
    { label: 'Followers', value: asDisplayNumber(traction.followers), icon: <Users size={13} /> },
    {
      label: reviewsCount ? `Rating · ${reviewsCount} reviews` : 'Rating',
      value: rating ? `${rating} / 5` : null,
      icon: <Star size={13} />,
    },
    { label: 'Monthly visits', value: asDisplayNumber(traction.toolify_monthly_visitors), icon: <Eye size={13} /> },
    { label: 'TAAFT saves', value: asDisplayNumber(traction.taaft_saves), icon: <Bookmark size={13} /> },
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

const CHIP_CLASS = 'normal-case tracking-normal text-[11px] font-medium px-2 py-0.5';

function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="flex items-center justify-between mb-2.5">
        <h3
          id={headingId}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          <span aria-hidden="true" className="text-zinc-400">
            {icon}
          </span>
          {title}
          {typeof count === 'number' && (
            <span className="font-semibold text-zinc-400 dark:text-zinc-500">({count})</span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">{label}</dt>
      <dd className="text-xs font-medium text-zinc-900 dark:text-zinc-100 break-words">{children}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3.5 py-3 text-xs text-zinc-400">
      {children}
    </p>
  );
}

const LIST_CLASS =
  'rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800';
const ICON_TILE_CLASS =
  'size-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0';

function LinkRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string | null;
  icon: React.ReactNode;
  title: string;
  subtitle?: string | null;
}) {
  const content = (
    <>
      <span className={ICON_TILE_CLASS} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</span>
        {subtitle && (
          <span className="block text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate" title={subtitle}>
            {subtitle}
          </span>
        )}
      </span>
      {href && (
        <ExternalLink
          size={12}
          aria-hidden="true"
          className="shrink-0 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors"
        />
      )}
    </>
  );

  const rowClass = 'flex items-center gap-3 px-3.5 py-2.5';
  return (
    <li>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`group ${rowClass} hover:bg-zinc-50 dark:hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:bg-zinc-50 dark:focus-visible:bg-zinc-800/50 transition-colors`}
        >
          {content}
        </a>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context or permission denied); the value stays selectable.
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-7 w-7 rounded-lg shrink-0"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
    </Button>
  );
}

function LinkKindIcon({ kind }: { kind: LinkKind }) {
  if (kind === 'twitter') return <TwitterIcon size={13} />;
  if (kind === 'linkedin') return <LinkedinIcon size={13} />;
  if (kind === 'contact') return <LinkIcon size={13} />;
  return <Globe size={13} />;
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
  onLeadUpdated?: (lead: MarketingOutreachLead) => void;
}

/**
 * Read-only, structured view of one outreach lead. Uses only the row data that
 * the leads list already loaded (no extra request). Mount it conditionally: the
 * shared DialogContent locks body scroll for as long as it is mounted.
 */
export default function LeadDetailsDialog({
  open,
  onOpenChange,
  lead,
  token,
  onViewConversation,
  onSendEmail,
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
    // If the lead already has conversion events passed from the parent table, skip refetch
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

  // Move focus into the dialog and restore it to the row on close (the shared dialog doesn't manage focus).
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  const activityStats = [
    { label: 'Business emails', value: emailEntries.length.toLocaleString('en-US') },
    { label: 'Emails sent', value: (summary?.outbound_count ?? 0).toLocaleString('en-US') },
    { label: 'Replies', value: (summary?.reply_count ?? 0).toLocaleString('en-US') },
    { label: 'Last activity', value: formatRelativeTime(summary?.last_message_at) || '—' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 pr-14 border-b border-zinc-100 dark:border-zinc-800 text-left sm:text-left space-y-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              aria-hidden="true"
              className="size-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-base font-extrabold text-zinc-900 dark:text-zinc-100 shrink-0"
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <DialogTitle id={titleId} className="text-lg font-bold leading-tight text-zinc-900 dark:text-zinc-100 break-words">
                  {lead.tool_name || 'Untitled lead'}
                </DialogTitle>
                <Badge variant={getLeadStatusVariant(lead.status)}>{formatLeadStatus(lead.status)}</Badge>
                {(lead.metadata?.is_tool_submission === true || lead.metadata?.is_tool_submission === 'true') && (
                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] font-medium">
                    Submitted Tool
                  </Badge>
                )}
                {automationHint && (
                  <span className="text-[10px] text-zinc-400" title={automationHint.title}>
                    {automationHint.label}
                  </span>
                )}
              </div>
              {details.siteUrl ? (
                <a
                  href={details.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 max-w-full text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <span className="truncate">{formatUrlLabel(details.siteUrl)}</span>
                  <ExternalLink size={11} aria-hidden="true" className="shrink-0" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                lead.tool_site_url && (
                  <span className="block text-[11px] font-mono text-zinc-500 truncate">{lead.tool_site_url}</span>
                )
              )}
              <DialogDescription
                id={descriptionId}
                className="text-xs font-normal text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1"
              >
                {details.description || 'No description available for this tool.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
          {/* At-a-glance outreach numbers */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-800">
            {activityStats.map((stat) => (
              <div key={stat.label} className="bg-white dark:bg-zinc-900 px-4 py-3 min-w-0">
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{stat.label}</dt>
                <dd className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{stat.value}</dd>
              </div>
            ))}
          </dl>

          {/* Website Conversions & Outreach Attribution */}
          <Section title="Website Conversions & Attribution" icon={<TrendingUp size={12} />}>
            {/* Milestone Funnel Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {/* Visits */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-800/40">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium">
                  <Globe size={12} className="text-zinc-400" />
                  Visits
                </div>
                <div className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {convSummary?.visit_count ? `${convSummary.visit_count} ${convSummary.visit_count === 1 ? 'visit' : 'visits'}` : 'No visits'}
                </div>
                {convSummary?.last_visit_at && (
                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate" title={formatMessageTime(convSummary.last_visit_at)}>
                    {formatRelativeTime(convSummary.last_visit_at)}
                  </div>
                )}
              </div>

              {/* Toolbit User / Signup */}
              <div className={`rounded-xl border p-3 ${
                convSummary?.signed_up
                  ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40'
              }`}>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  <UserCheck size={12} className={convSummary?.signed_up ? 'text-emerald-500' : 'text-zinc-400'} />
                  Toolbit User
                </div>
                <div className={`mt-1 text-sm font-bold truncate ${
                  convSummary?.signed_up ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-400'
                }`}>
                  {convSummary?.signed_up ? 'Signed Up' : 'Anonymous'}
                </div>
              </div>

              {/* Tool Submissions */}
              <div className={`rounded-xl border p-3 ${
                convSummary?.submitted
                  ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/20 dark:bg-indigo-500/10'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40'
              }`}>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  <Layers size={12} className={convSummary?.submitted ? 'text-indigo-500' : 'text-zinc-400'} />
                  Submissions
                </div>
                <div className={`mt-1 text-sm font-bold truncate ${
                  convSummary?.submitted ? 'text-indigo-700 dark:text-indigo-400' : 'text-zinc-400'
                }`}>
                  {convSummary?.submitted
                    ? `${convSummary.submission_count || 1} submitted`
                    : 'None'}
                </div>
                {convSummary?.submitted_at && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate" title={formatMessageTime(convSummary.submitted_at)}>
                    {formatDate(convSummary.submitted_at)}
                  </div>
                )}
              </div>

              {/* Paid Launches / Orders */}
              <div className={`rounded-xl border p-3 ${
                convSummary?.purchased
                  ? 'border-amber-200 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-500/10'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40'
              }`}>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  <ShoppingCart size={12} className={convSummary?.purchased ? 'text-amber-500' : 'text-zinc-400'} />
                  Orders
                </div>
                <div className={`mt-1 text-sm font-bold truncate ${
                  convSummary?.purchased ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-400'
                }`}>
                  {convSummary?.purchased
                    ? `$${convSummary.total_spent_usd || 0}`
                    : 'No purchase'}
                </div>
                {convSummary?.purchased_at && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate" title={formatMessageTime(convSummary.purchased_at)}>
                    {formatDate(convSummary.purchased_at)}
                  </div>
                )}
              </div>
            </div>

            {/* Linked Toolbit User Banner */}
            {(convSummary?.toolbit_user_email || convSummary?.toolbit_user_id) && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                      Linked Toolbit User: <span className="font-mono">{convSummary.toolbit_user_email || 'Email not recorded'}</span>
                    </div>
                    {convSummary.toolbit_user_id && (
                      <div className="text-[10px] font-mono text-emerald-700/80 dark:text-emerald-400/80 truncate">
                        UUID: {convSummary.toolbit_user_id}
                      </div>
                    )}
                  </div>
                </div>
                {convSummary.toolbit_user_email && (
                  <CopyButton value={convSummary.toolbit_user_email} label="User email" />
                )}
              </div>
            )}

            {/* Event Journey Details */}
            {conversionEvents.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Chronological Event Journey ({conversionEvents.length})
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  {conversionEvents.map((evt, idx) => (
                    <li key={evt.id || idx} className="p-2.5 bg-white dark:bg-zinc-900 flex items-start gap-2.5 text-xs">
                      <span className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0 mt-0.5">
                        {getEventIcon(evt.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatEventType(evt.type)}
                          </span>
                          <time className="text-[10px] text-zinc-400 shrink-0" title={formatMessageTime(evt.at)}>
                            {formatRelativeTime(evt.at)}
                          </time>
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {evt.page && <span>Page: <span className="font-mono text-zinc-700 dark:text-zinc-300">{evt.page}</span></span>}
                          {(evt.utm_campaign || evt.data?.utm_campaign) && (
                            <span>Campaign: <span className="font-medium text-zinc-700 dark:text-zinc-300">{evt.utm_campaign || evt.data?.utm_campaign}</span></span>
                          )}
                          {evt.user_email && <span>User: <span className="text-zinc-700 dark:text-zinc-300">{evt.user_email}</span></span>}
                          {evt.type === 'purchase' && (evt.data?.amount_usd || evt.data?.amount) && (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Amount: ${evt.data?.amount_usd || evt.data?.amount}
                            </span>
                          )}
                          {evt.type === 'submission' && evt.data?.tool_name && (
                            <span>Tool: <strong className="text-zinc-700 dark:text-zinc-300">{evt.data.tool_name}</strong></span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState>
                {loadingConversions ? 'Loading conversion events...' : 'No website activity recorded yet for this outreach lead.'}
              </EmptyState>
            )}
          </Section>

          {/* Overview */}
          <Section title="Overview" icon={<Info size={12} />}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Categories">
                {details.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {details.categories.map((cat) => (
                      <Badge key={cat} variant="secondary" className={CHIP_CLASS}>
                        {cat}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </Field>

              <Field label="Pricing">
                {details.pricing.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {details.pricing.map((price) => (
                      <Badge key={price} variant="outline" className={CHIP_CLASS}>
                        {price}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </Field>

              {details.recipientName && <Field label="Recipient">{details.recipientName}</Field>}

              {details.mediums.length > 0 && (
                <Field label="Outreach medium">
                  <span className="capitalize">{details.mediums.join(', ')}</span>
                </Field>
              )}

              {details.siteAlive !== null && (
                <Field label="Website status">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${details.siteAlive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    />
                    {details.siteAlive ? 'Online' : 'Unreachable'}
                    {details.livenessCheckedAt && (
                      <span
                        className="font-normal text-zinc-400"
                        title={formatMessageTime(details.livenessCheckedAt)}
                      >
                        · checked {formatRelativeTime(details.livenessCheckedAt)}
                      </span>
                    )}
                  </span>
                </Field>
              )}

              {details.latestLaunch && (
                <Field label="Latest launch">
                  {formatDate(details.latestLaunch)}
                  {details.launchCount > 1 && (
                    <span className="font-normal text-zinc-400"> · {details.launchCount} launches</span>
                  )}
                </Field>
              )}

              <Field label="Date added">
                {lead.created_at ? (
                  <time dateTime={lead.created_at}>{formatMessageTime(lead.created_at)}</time>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </Field>

              <Field label="Last updated">
                {lead.updated_at ? (
                  <time dateTime={lead.updated_at} title={formatMessageTime(lead.updated_at)}>
                    {formatRelativeTime(lead.updated_at)}
                  </time>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </Field>
            </dl>
          </Section>

          {/* Traction (only when the scraper found any numbers) */}
          {details.tractionStats.length > 0 && (
            <Section title="Traction" icon={<Star size={12} />}>
              <ul className="flex flex-wrap gap-2">
                {details.tractionStats.map((stat) => (
                  <li
                    key={stat.label}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                  >
                    <span aria-hidden="true" className="text-zinc-400">
                      {stat.icon}
                    </span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{stat.value}</span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{stat.label}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Business emails */}
          <Section
            title="Business emails"
            icon={<Mail size={12} />}
            count={emailEntries.length}
            action={
              token && !isAddingEmail ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingEmail(true);
                    setEmailError(null);
                    setEditingEmail(null);
                    setDeletingEmail(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Add email</span>
                </button>
              ) : null
            }
          >
            {/* Inline Notifications */}
            {emailError && (
              <div className="mb-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="truncate">{emailError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailError(null)}
                  className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {emailSuccess && (
              <div className="mb-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{emailSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailSuccess(null)}
                  className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Inline Add Email Form */}
            {isAddingEmail && (
              <div className="mb-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={newEmailVal}
                    onChange={(e) => {
                      setNewEmailVal(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="e.g. contact@example.com"
                    className="h-8 text-xs font-mono flex-1"
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
                    className="h-8 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
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
                    {emailSubmitting && emailActionTarget === 'add' ? (
                      <Spinner size={12} />
                    ) : (
                      <Check size={13} />
                    )}
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
                    <X size={13} />
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-400 pl-1">
                  Press Enter to add or Escape to cancel.
                </p>
              </div>
            )}

            {hasEmail ? (
              <ul className={LIST_CLASS}>
                {emailEntries.map(([email, rawRecord], index) => {
                  const record: EmailRecord =
                    typeof rawRecord === 'object' && rawRecord !== null
                      ? (rawRecord as EmailRecord)
                      : { status: (rawRecord as any) || 'unverified' };
                  const isEditingThis = editingEmail === email;
                  const isDeletingThis = deletingEmail === email;
                  const isBusyThis = emailSubmitting && emailActionTarget === email;

                  if (isEditingThis) {
                    return (
                      <li key={email} className="p-2.5 bg-zinc-50/50 dark:bg-zinc-800/30">
                        <div className="flex items-center gap-2">
                          <Input
                            type="email"
                            value={editEmailVal}
                            onChange={(e) => setEditEmailVal(e.target.value)}
                            placeholder="email@example.com"
                            className="h-7 text-xs font-mono flex-1"
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
                            className="h-7 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
                            title="Deliverability status"
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
                            {isBusyThis ? <Spinner size={11} /> : <Check size={12} />}
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
                            <X size={12} />
                          </Button>
                        </div>
                      </li>
                    );
                  }

                  if (isDeletingThis) {
                    return (
                      <li
                        key={email}
                        className="flex items-center justify-between gap-3 p-2 bg-rose-50/60 dark:bg-rose-950/20"
                      >
                        <span className="text-xs text-rose-700 dark:text-rose-300 font-medium pl-1 truncate">
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
                            Confirm
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
                      </li>
                    );
                  }

                  return (
                    <li key={email} className="flex flex-col group/email border-b border-zinc-100 dark:border-zinc-800/60 last:border-b-0 transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <div className="flex items-center gap-3 px-3.5 py-2.5 justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className={ICON_TILE_CLASS} aria-hidden="true">
                            <Mail size={13} />
                          </span>
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
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
                                aria-label={`Edit ${email}`}
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
                                aria-label={`Delete ${email}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {record.resend_status === 'bounced' && record.bounce_reason && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 px-3.5 pb-2.5 font-medium">
                          <AlertCircle size={12} className="shrink-0" />
                          <span>Bounced in Resend: {record.bounce_reason}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              !isAddingEmail && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
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
          </Section>

          {/* Sources + links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Sources" icon={<Layers size={12} />} count={details.sources.length}>
              {details.sources.length > 0 ? (
                <ul className={LIST_CLASS}>
                  {details.sources.map((src, i) => (
                    <LinkRow
                      key={`${src.name}-${src.href || i}`}
                      href={src.href}
                      icon={<Layers size={13} />}
                      title={src.name}
                      subtitle={src.label}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState>No source platforms recorded.</EmptyState>
              )}
            </Section>

            <Section title="Socials & links" icon={<LinkIcon size={12} />} count={details.links.length}>
              {details.links.length > 0 ? (
                <ul className={LIST_CLASS}>
                  {details.links.map((link) => (
                    <LinkRow
                      key={link.href || link.label}
                      href={link.href}
                      icon={<LinkKindIcon kind={link.kind} />}
                      title={link.title}
                      subtitle={link.label}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState>No social or contact links found.</EmptyState>
              )}
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Close
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {onViewConversation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewConversation(lead)}
                className="h-8 text-xs gap-1.5"
              >
                <MessageSquare size={12} aria-hidden="true" />
                View conversation
              </Button>
            )}
            {onSendEmail && (
              <Button
                size="sm"
                onClick={() => onSendEmail(lead)}
                disabled={!hasEmail}
                className="h-8 text-xs gap-1.5"
                title={hasEmail ? `Send email to ${lead.tool_name}` : 'No email available for this tool'}
              >
                <Send size={12} aria-hidden="true" />
                Send email
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
