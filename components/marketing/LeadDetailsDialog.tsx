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
  Send,
  ShoppingCart,
  Star,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getOutreachLeadConversionsAction,
  type MarketingOutreachLead,
  type OutreachConversionEvent,
  type OutreachConversionSummary,
} from '@/app/admin/marketing/actions';
import { formatMessageTime, formatRelativeTime } from '@/lib/marketing/conversation';
import { formatLeadStatus, getLeadAutomationHint, getLeadStatusVariant } from '@/lib/marketing/lead-status';
import { LinkedinIcon, TwitterIcon } from './SocialIcons';

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
    emails: uniqueCaseInsensitive(asStringList(lead.business_emails)),
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
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3
        id={headingId}
        className="flex items-center gap-1.5 mb-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
      >
        <span aria-hidden="true" className="text-zinc-400">
          {icon}
        </span>
        {title}
        {typeof count === 'number' && (
          <span className="font-semibold text-zinc-400 dark:text-zinc-500">({count})</span>
        )}
      </h3>
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
  'rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden';
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
}: LeadDetailsDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const details = useMemo(() => buildLeadDetails(lead), [lead]);
  const automationHint = getLeadAutomationHint(lead);
  const summary = lead.conversation_summary;
  const hasEmail = details.emails.length > 0;
  const initial = (lead.tool_name || '?').trim().charAt(0).toUpperCase() || '?';

  const initialConvEvents = lead.conversions?.events || lead.conversion_events || [];
  const initialConvSummary = lead.conversions?.summary || lead.conversion_summary || null;

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
    { label: 'Business emails', value: details.emails.length.toLocaleString('en-US') },
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
                {convSummary?.signed_up_at && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate" title={formatMessageTime(convSummary.signed_up_at)}>
                    {formatDate(convSummary.signed_up_at)}
                  </div>
                )}
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
                          {evt.utm_campaign && <span>Campaign: <span className="font-medium text-zinc-700 dark:text-zinc-300">{evt.utm_campaign}</span></span>}
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
          <Section title="Business emails" icon={<Mail size={12} />} count={details.emails.length}>
            {hasEmail ? (
              <ul className={LIST_CLASS}>
                {details.emails.map((email) => (
                  <li key={email} className="flex items-center gap-3 pl-3.5 pr-2 py-1.5">
                    <span className={ICON_TILE_CLASS} aria-hidden="true">
                      <Mail size={13} />
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate" title={email}>
                      {email}
                    </span>
                    <CopyButton value={email} label={email} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No business email found for this tool.</EmptyState>
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
