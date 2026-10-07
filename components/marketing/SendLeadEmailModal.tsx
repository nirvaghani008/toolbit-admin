'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Send,
  Eye,
  Mail,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Users,
  Check,
  RotateCcw,
  Megaphone,
  Handshake,
  RefreshCw,
  Clock,
  Info,
  ArrowUpRight,
  ShieldCheck,
  X,
  History,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  MarketingTemplate,
  MarketingOutreachLead,
  OutreachSendItem,
  SendResult,
} from '@/app/admin/marketing/actions';
import {
  getOutreachSendPrecheckAction,
  sendOutreachLeadEmailAction,
} from '@/app/admin/marketing/actions';
import {
  type BusinessEmailsMap,
  type EmailDeliverabilityStatus,
  type EmailRecord,
  getAllEmails,
  getPrimaryEmail,
  getDeliverableEmails,
  getUnverifiedEmails,
} from '@/lib/marketing/business-emails';
import {
  type ExistingToolMatch,
  formatExistingToolMatch,
} from '@/lib/marketing/existing-tools';
import {
  evaluateOutreachHistory,
  parseOutreachSendHistory,
  formatGuardDate,
  type OutreachHistoryFlags,
  type OutreachLeadGuard,
} from '@/lib/marketing/send-guards';
import { textToEmailHtml, htmlBodyToFullEmailHtml, escapeHtml, safeHttpUrl } from '@/lib/email-formatter';
import RichTextEditor from '@/components/common/RichTextEditor';

interface SendLeadEmailModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  selectedLeads: MarketingOutreachLead[];
  templates: Record<string, MarketingTemplate>;
  onSuccess: (sentCount: number) => void;
}

// Helper: Safely resolve candidate outreach emails for a lead based on deliverability
function getRecommendedEmailsForLead(
  lead: MarketingOutreachLead | null | undefined,
  strategy: 'primary' | 'all'
): string[] {
  if (!lead || !lead.business_emails) return [];
  const deliverable = getDeliverableEmails(lead);
  const unverified = getUnverifiedEmails(lead);
  const sendable = [...deliverable, ...unverified];

  if (sendable.length === 0) return [];

  if (strategy === 'primary') {
    const primary = getPrimaryEmail(lead);
    const primaryRecord = primary ? lead.business_emails[primary] : null;
    const isUndeliverable =
      primaryRecord?.status === 'undeliverable' || primaryRecord?.resend_status === 'bounced';
    if (primary && !isUndeliverable) {
      return [primary];
    }
    return deliverable.length > 0 ? [deliverable[0]] : [unverified[0]];
  }

  // Strategy 'all': return all non-undeliverable emails in key priority order
  return getAllEmails(lead).filter((email) => {
    const rec = lead.business_emails[email];
    return rec?.status !== 'undeliverable' && rec?.resend_status !== 'bounced';
  });
}

// Helper: Format editor text lines into clean HTML
function formatEditorLine(line: string): string {
  let result = line;
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
    '<a href="$2" target="_blank" style="color: #0d9488; text-decoration: underline; font-weight: 600;">$1</a>'
  );
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/(?<!href=["'])(?<!>)(https?:\/\/[^\s<"'\)]+)/g, '<a href="$1" target="_blank">$1</a>');
  return result;
}

function convertTextToEditorHtml(text: string): string {
  if (!text) return '';
  const paras = text.trim().split(/\n\s*\n/);
  return paras
    .map((p) => {
      const lines = p.trim().split('\n');
      if (lines.length > 0 && lines.every((l) => /^\d+[\.\)]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li style="list-style-type: decimal !important; margin-bottom: 8px;">${formatEditorLine(l.replace(/^\d+[\.\)]\s+/, ''))}</li>`)
          .join('');
        return `<ol style="list-style-type: decimal !important; padding-left: 24px; margin-bottom: 18px;">${items}</ol>`;
      }
      if (lines.length > 0 && lines.every((l) => /^[\-\*•]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li style="list-style-type: disc !important; margin-bottom: 8px;">${formatEditorLine(l.replace(/^[\-\*•]\s+/, ''))}</li>`)
          .join('');
        return `<ul style="list-style-type: disc !important; padding-left: 24px; margin-bottom: 18px;">${items}</ul>`;
      }
      const formatted = lines.map((l) => formatEditorLine(l)).join('<br />');
      return `<p>${formatted}</p>`;
    })
    .join('');
}

function substituteVars(content: string, vars: Record<string, string>): string {
  if (!content) return '';
  let result = content;
  const domainVal = (vars.tool_domain || vars.domain_name || '').trim();
  if (!domainVal) {
    result = result.replace(/\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '');
  }
  for (const [rawKey, val] of Object.entries(vars)) {
    const key = rawKey.replace(/^\{\{|\}\}$/g, '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!key) continue;
    const value = val !== undefined && val !== null ? val : '';
    const literal = () => value;
    const standardRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(standardRegex, literal);
    const encodedRegex = new RegExp(`%7B%7B\\s*${key}\\s*%7D%7D`, 'gi');
    result = result.replace(encodedRegex, literal);
    const entityRegex = new RegExp(`(&#123;|&#x7b;|&lbrace;){2}\\s*${key}\\s*(&#125;|&#x7d;|&rbrace;){2}`, 'gi');
    result = result.replace(entityRegex, literal);
  }
  return result;
}

function replaceIfYouWantToolName(content: string, plainName: string, plainDomain?: string): string {
  let res = content.replace(
    /(If you want\s+(?:<strong[^>]*>|\*\*|))\s*\{\{\s*tool_name\s*\}\}/gi,
    (_match, prefix: string) => `${prefix}${plainName}`
  );
  if (plainDomain) {
    res = res.replace(
      /(If you want\s+(?:<strong[^>]*>|\*\*|))\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}/gi,
      (_match, prefix: string) => `${prefix}${plainDomain}`
    );
  }
  return res;
}

function getLeadVars(lead: MarketingOutreachLead | null) {
  const toolName = lead?.tool_name || 'AI Tool';
  const siteUrl = safeHttpUrl(lead?.tool_site_url);
  const toolDomain = getToolDomain(siteUrl);
  return {
    toolName,
    siteUrl,
    toolDomain,
    html: { toolName: escapeHtml(toolName), siteUrl: escapeHtml(siteUrl), toolDomain: escapeHtml(toolDomain) },
  };
}

const GUARD_CHECK_ERROR = 'Could not check the selected leads.';

function getToolDomain(siteUrl: string): string {
  if (!siteUrl) return '';
  try {
    const parsed = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return siteUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

function buildEditorDefaults(
  template: MarketingTemplate,
  lead: MarketingOutreachLead | null
): { subject: string; html: string } {
  if (!lead) {
    return { subject: template.subject, html: convertTextToEditorHtml(template.text) };
  }

  const v = getLeadVars(lead);
  const displayDomain = v.html.toolDomain || v.html.toolName;
  const rawDomain = v.toolDomain || v.toolName;

  const htmlVars: Record<string, string> = {
    tool_name: v.siteUrl ? `[${v.html.toolName}](${v.html.siteUrl})` : v.html.toolName,
    company_name: v.html.toolName,
    tool_site_url: v.html.siteUrl,
    tool_url: v.html.siteUrl,
    tool_domain: v.siteUrl ? `[${displayDomain}](${v.html.siteUrl})` : displayDomain,
    domain_name: v.siteUrl ? `[${displayDomain}](${v.html.siteUrl})` : displayDomain,
    recipient_name: v.html.toolName,
    first_name: 'there',
  };
  const subjectVars: Record<string, string> = {
    tool_name: v.toolName,
    company_name: v.toolName,
    tool_site_url: v.siteUrl,
    tool_url: v.siteUrl,
    tool_domain: rawDomain,
    domain_name: rawDomain,
    recipient_name: v.toolName,
    first_name: 'there',
  };

  let rawText = replaceIfYouWantToolName(template.text, v.html.toolName, displayDomain);
  if (!v.toolDomain) {
    rawText = rawText.replace(/\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '');
  }

  return {
    subject: substituteVars(template.subject, subjectVars),
    html: convertTextToEditorHtml(substituteVars(rawText, htmlVars)),
  };
}

const TEMPLATE_META: Record<
  string,
  {
    icon: React.ReactNode;
    badge: string;
    description: string;
  }
> = {
  tool_outreach: {
    icon: <RefreshCw size={15} className="text-teal-600 dark:text-teal-400" />,
    badge: 'Listing',
    description: 'Invite founders to list on Toolbit (Free & Paid launch)',
  },
  new_tool_launch: {
    icon: <Sparkles size={15} className="text-amber-600 dark:text-amber-400" />,
    badge: 'Launch',
    description: 'Launch announcement pitch for newly listed AI tools',
  },
  sponsored_feature: {
    icon: <Megaphone size={15} className="text-purple-600 dark:text-purple-400" />,
    badge: 'Sponsor',
    description: 'Pitch homepage spotlight and promotional placement',
  },
  affiliate_partnership: {
    icon: <Handshake size={15} className="text-blue-600 dark:text-blue-400" />,
    badge: 'Partner',
    description: 'Inquire about affiliate and partner commission programs',
  },
};

function cleanHistoryReason(reason: string): string {
  if (!reason) return '';
  return reason
    .replace(/^Already received this template\s*/i, 'Previously sent ')
    .replace(/\s+to\s+[^)]+\)/, ')')
    .replace(/\s*\(last on\s+([^)]+)\)/, ' (last $1)');
}

async function getFreshToken(fallbackToken?: string): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {}
  return fallbackToken || '';
}

function getFallbackHistoryFlags(
  lead: MarketingOutreachLead,
  templateId: string
): OutreachHistoryFlags {
  let replied: string | null = null;
  let templateSent: string | null = null;

  // 1. Reply check from conversation_summary or status
  if (lead.conversation_summary?.reply_count && lead.conversation_summary.reply_count > 0) {
    const replies = lead.conversation_summary.reply_count;
    const date = formatGuardDate(lead.conversation_summary.last_inbound_at);
    replied = `Already replied (${replies} ${replies === 1 ? 'reply' : 'replies'}${date ? `, last on ${date}` : ''})`;
  } else {
    const s = (lead.status || '').trim().toLowerCase();
    if (s === 'replied' || s === 'launched') {
      replied = `Lead status is "${s}"`;
    }
  }

  // 2. Structured outreach history if present on lead
  const rawHistory =
    (lead as any).outreach_send_history ||
    (lead.metadata as any)?.outreach_send_history;
  if (rawHistory) {
    const parsed = parseOutreachSendHistory(rawHistory);
    if (parsed) {
      const evaluated = evaluateOutreachHistory(lead.status, parsed, templateId);
      if (evaluated.replied) replied = evaluated.replied;
      if (evaluated.templateSent) templateSent = evaluated.templateSent;
    }
  }

  // 3. Fallback check from conversation outbound, status, or business email timestamps
  if (!templateSent) {
    const s = (lead.status || '').trim().toLowerCase();
    if (lead.conversation_summary?.outbound_count && lead.conversation_summary.outbound_count > 0) {
      const count = lead.conversation_summary.outbound_count;
      const date = formatGuardDate(lead.conversation_summary.last_message_at);
      templateSent = `Already received outreach (${count} prior email${count === 1 ? '' : 's'}${date ? `, last on ${date}` : ''})`;
    } else if (s === 'emailed') {
      templateSent = 'Lead status is "emailed" (outreach previously sent)';
    } else if (lead.business_emails) {
      for (const [email, rawRec] of Object.entries(lead.business_emails)) {
        const rec = typeof rawRec === 'object' && rawRec !== null ? (rawRec as EmailRecord) : null;
        if (rec?.last_sent_at || rec?.resend_status === 'sent' || rec?.resend_status === 'delivered') {
          const date = formatGuardDate(rec.last_sent_at);
          templateSent = `Already sent to ${email}${date ? ` on ${date}` : ''}`;
          break;
        }
      }
    }
  }

  return { replied, templateSent };
}

function ContactedLeadsGroup({
  type,
  title,
  leads,
  reasonOf,
  confirmLabel,
  checked,
  onCheckedChange,
}: {
  type: 'repeat' | 'replied' | 'existing';
  title: string;
  leads: MarketingOutreachLead[];
  reasonOf: (lead: MarketingOutreachLead) => string;
  confirmLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const isSingle = leads.length === 1;
  const singleLead = isSingle ? leads[0] : null;
  const rawReason = singleLead ? reasonOf(singleLead) : '';
  const singleReason = cleanHistoryReason(rawReason);
  const isRepeat = type === 'repeat';
  const isReplied = type === 'replied';

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        isRepeat
          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/90 dark:border-amber-800/60'
          : isReplied
          ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200/90 dark:border-indigo-800/60'
          : 'bg-zinc-100/70 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/80'
      }`}
      role="status"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
              isRepeat
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : isReplied
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {isRepeat ? (
              <History size={15} />
            ) : isReplied ? (
              <MessageSquare size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                {title}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                  isRepeat
                    ? 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                    : isReplied
                    ? 'bg-indigo-200/70 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200'
                    : 'bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
                }`}
              >
                {isRepeat
                  ? 'Duplicate Protection'
                  : isReplied
                  ? 'Response Detected'
                  : 'Already Listed'}
              </span>
            </div>
            {isSingle && singleReason && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal font-normal">
                {singleReason}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
              checked
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-200/80 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {checked ? 'Will send' : 'Skipped (default)'}
          </span>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-600 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onCheckedChange(e.target.checked)}
              className="size-3.5 cursor-pointer accent-zinc-900 dark:accent-zinc-100 rounded"
            />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {confirmLabel}
            </span>
          </label>
        </div>
      </div>

      {!isSingle && leads.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">{l.tool_name}</span>
              <span className="text-[10px] text-zinc-500 truncate max-w-[240px]">{cleanHistoryReason(reasonOf(l))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SendLeadEmailModal({
  open,
  onClose,
  token,
  selectedLeads,
  templates,
  onSuccess,
}: SendLeadEmailModalProps) {
  const isSingleLead = selectedLeads.length === 1;
  const singleLead = isSingleLead ? selectedLeads[0] : null;

  const templateList = useMemo(() => {
    const preferredOrder = ['tool_outreach', 'new_tool_launch', 'sponsored_feature', 'affiliate_partnership'];
    const list = Object.values(templates);
    return list.sort((a, b) => {
      const ai = preferredOrder.indexOf(a.id);
      const bi = preferredOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [singleSelectedEmails, setSingleSelectedEmails] = useState<string[]>([]);
  const [bulkStrategy, setBulkStrategy] = useState<'primary' | 'all' | 'custom'>('primary');
  const [bulkSelectedEmails, setBulkSelectedEmails] = useState<Record<string, string[]>>({});

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isUserCustomizingBody, setIsUserCustomizingBody] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customHtml, setCustomHtml] = useState('');
  const isProgrammaticUpdate = useRef(false);

  const [showRecipientsList, setShowRecipientsList] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);

  const [guardCheckNonce, setGuardCheckNonce] = useState(0);
  const [guardCheck, setGuardCheck] = useState<{
    key: string;
    guards: Record<string, OutreachLeadGuard>;
    error: string | null;
  } | null>(null);

  const [allowReplied, setAllowReplied] = useState(false);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [allowExisting, setAllowExisting] = useState(false);

  const guardLeadIds = useMemo(
    () => Array.from(new Set(selectedLeads.map((lead) => lead.id))),
    [selectedLeads]
  );
  const guardCheckKey = `${guardCheckNonce}|${guardLeadIds.join(',')}`;

  useEffect(() => {
    if (!open || guardLeadIds.length === 0) return;
    let cancelled = false;
    const key = guardCheckKey;

    const runCheck = async () => {
      try {
        const activeToken = await getFreshToken(token);
        const res = await getOutreachSendPrecheckAction(activeToken, guardLeadIds);
        if (cancelled) return;
        setGuardCheck({
          key,
          guards: res.success ? res.data || {} : {},
          error: res.success ? null : res.error || GUARD_CHECK_ERROR,
        });
      } catch (err: any) {
        if (cancelled) return;
        setGuardCheck({ key, guards: {}, error: err?.message || GUARD_CHECK_ERROR });
      }
    };

    void runCheck();
    return () => {
      cancelled = true;
    };
  }, [open, token, guardLeadIds, guardCheckKey]);

  const currentGuardCheck = guardCheck?.key === guardCheckKey ? guardCheck : null;
  const checkingGuards = open && guardLeadIds.length > 0 && !currentGuardCheck;
  const guardCheckError = currentGuardCheck?.error ?? null;
  const guards = currentGuardCheck && !currentGuardCheck.error ? currentGuardCheck.guards : null;

  const existingByLeadId = useMemo(() => {
    const map = new Map<string, ExistingToolMatch[]>();
    if (!guards) return map;
    for (const lead of selectedLeads) {
      const existing = guards[lead.id]?.existing;
      if (existing?.length) map.set(lead.id, existing);
    }
    return map;
  }, [guards, selectedLeads]);

  const existingLeads = useMemo(
    () =>
      selectedTemplateId === 'tool_outreach' || !selectedTemplateId
        ? selectedLeads.filter((lead) => existingByLeadId.has(lead.id))
        : [],
    [selectedLeads, existingByLeadId, selectedTemplateId]
  );

  const missingLeads = useMemo(
    () => (guards ? selectedLeads.filter((lead) => !guards[lead.id]) : []),
    [guards, selectedLeads]
  );

  const historyByLeadId = useMemo(() => {
    const map = new Map<string, OutreachHistoryFlags>();
    for (const lead of selectedLeads) {
      const guard = guards ? guards[lead.id] : null;
      let flags: OutreachHistoryFlags;
      if (guard) {
        flags = evaluateOutreachHistory(guard.status, guard.history, selectedTemplateId);
      } else {
        flags = getFallbackHistoryFlags(lead, selectedTemplateId);
      }
      if (flags.replied || flags.templateSent) {
        map.set(lead.id, flags);
      }
    }
    return map;
  }, [guards, selectedLeads, selectedTemplateId]);

  const repliedLeads = useMemo(
    () => selectedLeads.filter((lead) => historyByLeadId.get(lead.id)?.replied),
    [selectedLeads, historyByLeadId]
  );
  const repeatLeads = useMemo(
    () => selectedLeads.filter((lead) => historyByLeadId.get(lead.id)?.templateSent),
    [selectedLeads, historyByLeadId]
  );

  const excludedLeadIds = useMemo(() => {
    const excluded = new Set<string>();
    for (const lead of selectedLeads) {
      const flags = historyByLeadId.get(lead.id);
      const isExistingBlocked =
        (selectedTemplateId === 'tool_outreach' || !selectedTemplateId) &&
        existingByLeadId.has(lead.id) &&
        !allowExisting;

      if (
        (guards && !guards[lead.id]) ||
        isExistingBlocked ||
        (flags?.replied && !allowReplied) ||
        (flags?.templateSent && !allowRepeat)
      ) {
        excluded.add(lead.id);
      }
    }
    return excluded;
  }, [guards, selectedLeads, historyByLeadId, existingByLeadId, selectedTemplateId, allowExisting, allowReplied, allowRepeat]);

  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      setSendResults(null);
      setSendError(null);
      setIsCustomizing(false);
      setIsUserCustomizingBody(false);
      setAllowReplied(false);
      setAllowRepeat(false);
      setAllowExisting(false);
      setBulkSelectedEmails({});
      setBulkStrategy('primary');
      setShowRecipientsList(false);
      setGuardCheckNonce((n) => n + 1);
      return;
    }

    setSelectedTemplateId('');

    if (isSingleLead && singleLead) {
      setSingleSelectedEmails(getRecommendedEmailsForLead(singleLead, 'all'));
    } else if (!isSingleLead && selectedLeads.length > 0) {
      const initial: Record<string, string[]> = {};
      for (const lead of selectedLeads) {
        initial[lead.id] = getRecommendedEmailsForLead(lead, 'primary');
      }
      setBulkSelectedEmails(initial);
      setBulkStrategy('primary');
      setShowRecipientsList(true);
    }
  }, [open, isSingleLead, singleLead, selectedLeads]);

  const handleSetBulkStrategy = (strat: 'primary' | 'all') => {
    setBulkStrategy(strat);
    const updated: Record<string, string[]> = {};
    for (const lead of selectedLeads) {
      updated[lead.id] = getRecommendedEmailsForLead(lead, strat);
    }
    setBulkSelectedEmails(updated);
  };

  const recalcBulkStrategy = (updated: Record<string, string[]>) => {
    let matchesPrimary = true;
    let matchesAll = true;
    for (const lead of selectedLeads) {
      const primaryRec = getRecommendedEmailsForLead(lead, 'primary');
      const allRec = getRecommendedEmailsForLead(lead, 'all');
      const sel = updated[lead.id] || [];
      if (allRec.length > 0) {
        if (sel.length !== primaryRec.length || !primaryRec.every((e) => sel.includes(e))) {
          matchesPrimary = false;
        }
        if (sel.length !== allRec.length || !allRec.every((e) => sel.includes(e))) {
          matchesAll = false;
        }
      }
    }
    if (matchesPrimary) setBulkStrategy('primary');
    else if (matchesAll) setBulkStrategy('all');
    else setBulkStrategy('custom');
  };

  const handleToggleBulkEmail = (leadId: string, email: string) => {
    const lead = selectedLeads.find((l) => l.id === leadId);
    const rec = lead?.business_emails?.[email];
    if (rec?.status === 'undeliverable' || rec?.resend_status === 'bounced') return;

    setBulkSelectedEmails((prev) => {
      const current = prev[leadId] ?? [];
      const isChecked = current.includes(email);
      const nextEmails = isChecked
        ? current.filter((e) => e !== email)
        : [...current, email];
      const updated = {
        ...prev,
        [leadId]: nextEmails,
      };

      recalcBulkStrategy(updated);
      return updated;
    });
  };

  const handleSelectLeadPrimaryEmail = (leadId: string) => {
    const lead = selectedLeads.find((l) => l.id === leadId);
    if (!lead) return;
    const primaryRec = getRecommendedEmailsForLead(lead, 'primary');
    setBulkSelectedEmails((prev) => {
      const updated = { ...prev, [leadId]: primaryRec };
      recalcBulkStrategy(updated);
      return updated;
    });
  };

  const handleSelectLeadAllEmails = (leadId: string) => {
    const lead = selectedLeads.find((l) => l.id === leadId);
    if (!lead) return;
    const allRec = getRecommendedEmailsForLead(lead, 'all');
    setBulkSelectedEmails((prev) => {
      const updated = { ...prev, [leadId]: allRec };
      recalcBulkStrategy(updated);
      return updated;
    });
  };

  const activeTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return templates[selectedTemplateId] || null;
  }, [templates, selectedTemplateId]);

  const targetItems: OutreachSendItem[] = useMemo(() => {
    const items: OutreachSendItem[] = [];
    const seen = new Set<string>();
    const add = (lead: MarketingOutreachLead, rawEmail: string | undefined) => {
      const email = (rawEmail || '').trim();
      const key = `${lead.id}|${email.toLowerCase()}`;
      if (!email || seen.has(key)) return;
      const rec = lead.business_emails?.[email];
      if (rec?.status === 'undeliverable' || rec?.resend_status === 'bounced') return;
      seen.add(key);
      items.push({
        leadId: lead.id,
        toolName: lead.tool_name,
        toolSiteUrl: lead.tool_site_url,
        recipientEmail: email,
        recipientName: lead.tool_name,
      });
    };

    if (isSingleLead && singleLead) {
      for (const email of singleSelectedEmails) add(singleLead, email);
      return items;
    }

    for (const lead of selectedLeads) {
      const emails = bulkSelectedEmails[lead.id] !== undefined
        ? bulkSelectedEmails[lead.id]
        : getRecommendedEmailsForLead(lead, bulkStrategy === 'all' ? 'all' : 'primary');
      for (const email of emails) add(lead, email);
    }

    return items;
  }, [isSingleLead, singleLead, singleSelectedEmails, selectedLeads, bulkStrategy, bulkSelectedEmails]);

  const sendableItemsCount = useMemo(() => {
    return targetItems.filter((item) => !excludedLeadIds.has(item.leadId)).length;
  }, [targetItems, excludedLeadIds]);

  const skippedItemsCount = targetItems.length - sendableItemsCount;

  const leadsMissingEmailCount = useMemo(() => {
    return selectedLeads.filter(
      (l) => getAllEmails(l).length === 0
    ).length;
  }, [selectedLeads]);

  const leadsAllUndeliverableCount = useMemo(() => {
    return selectedLeads.filter(
      (l) =>
        getAllEmails(l).length > 0 &&
        getRecommendedEmailsForLead(l, 'all').length === 0
    ).length;
  }, [selectedLeads]);

  const hasUnverifiedSelected = useMemo(() => {
    if (isSingleLead && singleLead) {
      return singleSelectedEmails.some(
        (email) => singleLead.business_emails?.[email]?.status === 'unverified'
      );
    }
    return Object.entries(bulkSelectedEmails).some(([leadId, emails]) => {
      const lead = selectedLeads.find((l) => l.id === leadId);
      if (!lead) return false;
      return emails.some((email) => lead.business_emails?.[email]?.status === 'unverified');
    });
  }, [isSingleLead, singleLead, singleSelectedEmails, bulkSelectedEmails, selectedLeads]);

  const sampleLead = isSingleLead
    ? singleLead
    : selectedLeads.find((l) => !excludedLeadIds.has(l.id)) || selectedLeads[0] || null;

  const personalizeEditor = isSingleLead;

  useEffect(() => {
    if (!activeTemplate || !open) return;

    if (!isUserCustomizingBody) {
      isProgrammaticUpdate.current = true;
      const defaults = buildEditorDefaults(activeTemplate, personalizeEditor ? sampleLead : null);
      setCustomSubject(defaults.subject);
      setCustomHtml(defaults.html);

      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 50);
    }
  }, [activeTemplate, sampleLead, personalizeEditor, isUserCustomizingBody, open]);

  const handleResetCustomContent = () => {
    if (!activeTemplate) return;
    setIsUserCustomizingBody(false);
    isProgrammaticUpdate.current = true;

    const defaults = buildEditorDefaults(activeTemplate, personalizeEditor ? sampleLead : null);
    setCustomSubject(defaults.subject);
    setCustomHtml(defaults.html);

    setTimeout(() => {
      isProgrammaticUpdate.current = false;
    }, 50);
  };

  const previewHtml = useMemo(() => {
    if (!activeTemplate) return '';
    const { html: v, siteUrl } = getLeadVars(sampleLead);
    const displayDomain = v.toolDomain || v.toolName;

    const vars: Record<string, string> = {
      tool_name: siteUrl ? `<a href="${v.siteUrl}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${v.toolName}</a>` : v.toolName,
      company_name: v.toolName,
      tool_site_url: v.siteUrl,
      tool_url: v.siteUrl,
      tool_domain: siteUrl ? `<a href="${v.siteUrl}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${displayDomain}</a>` : displayDomain,
      domain_name: siteUrl ? `<a href="${v.siteUrl}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${displayDomain}</a>` : displayDomain,
      recipient_name: v.toolName,
      first_name: 'there',
    };

    let base = '';
    if (isCustomizing && customHtml.trim()) {
      base = htmlBodyToFullEmailHtml(customHtml.trim());
    } else if (activeTemplate.html && activeTemplate.html.trim().length > 0) {
      base = activeTemplate.html;
    } else {
      base = textToEmailHtml(activeTemplate.text);
    }

    base = replaceIfYouWantToolName(base, v.toolName, displayDomain);
    if (!v.toolDomain) {
      base = base.replace(/\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '');
    }

    return substituteVars(base, vars);
  }, [activeTemplate, sampleLead, isCustomizing, customHtml]);

  const previewSubject = useMemo(() => {
    if (!activeTemplate) return '';
    const toolName = sampleLead?.tool_name || 'AI Tool';
    const siteUrl = safeHttpUrl(sampleLead?.tool_site_url);
    const toolDomain = getToolDomain(siteUrl) || toolName;
    const base = isCustomizing && customSubject.trim() ? customSubject.trim() : activeTemplate.subject;
    return substituteVars(base, {
      tool_name: toolName,
      company_name: toolName,
      tool_domain: toolDomain,
      domain_name: toolDomain,
      first_name: 'there',
    });
  }, [activeTemplate, sampleLead, isCustomizing, customSubject]);

  const handleRetryGuardCheck = () => {
    setGuardCheck(null);
    setGuardCheckNonce((n) => n + 1);
  };

  const handleSend = async () => {
    if (!activeTemplate || targetItems.length === 0 || checkingGuards || (Boolean(guardCheckError) && !guards)) return;
    setSending(true);
    setSendError(null);
    setSendResults(null);

    try {
      const activeToken = await getFreshToken(token);
      const res = await sendOutreachLeadEmailAction(activeToken, {
        templateId: activeTemplate.id,
        items: targetItems,
        customSubject: isCustomizing && customSubject.trim() ? customSubject.trim() : undefined,
        customHtml: isCustomizing && customHtml.trim() ? customHtml.trim() : undefined,
        allowRepliedLeadIds: allowReplied ? repliedLeads.map((lead) => lead.id) : [],
        allowRepeatLeadIds: allowRepeat ? repeatLeads.map((lead) => lead.id) : [],
        allowExistingLeadIds: allowExisting ? existingLeads.map((lead) => lead.id) : [],
      });

      if (!res.success) {
        setSendError(res.error || 'Failed to dispatch marketing emails.');
        if (res.results) setSendResults(res.results);
        return;
      }

      setSendResults(res.results || null);
      const successCount = (res.results || []).filter((r) => r.success).length;
      onSuccess(successCount);
    } catch (err: any) {
      console.error('Send error:', err);
      setSendError(err?.message || 'An unexpected error occurred while sending.');
    } finally {
      setSending(false);
    }
  };

  const leadInitial = isSingleLead && singleLead ? (singleLead.tool_name || '?').trim().charAt(0).toUpperCase() : null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !sending && onClose()}>
      <DialogContent
        className={`w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-zinc-800/80 shadow-2xl transition-all duration-300 ease-out ${
          selectedTemplateId
            ? 'max-w-5xl xl:max-w-6xl 2xl:max-w-[1240px]'
            : 'max-w-xl lg:max-w-[658px]'
        }`}
      >
        {/* ── Dialog Header ── */}
        <DialogHeader className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-left space-y-0">
          <div className="flex items-center justify-between gap-4 pr-8">
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Tool Avatar */}
              <div
                aria-hidden="true"
                className="size-11 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200/80 dark:from-zinc-800 dark:to-zinc-800/50 border border-zinc-200/90 dark:border-zinc-700/60 flex items-center justify-center text-base font-bold text-zinc-900 dark:text-zinc-100 shrink-0 shadow-2xs"
              >
                {leadInitial || <Mail size={16} />}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                    {isSingleLead ? `Outreach · ${singleLead?.tool_name}` : `Bulk Outreach (${selectedLeads.length} Tools)`}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 shadow-2xs shrink-0"
                  >
                    {targetItems.length} {targetItems.length === 1 ? 'recipient' : 'recipients'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <DialogDescription className="sr-only">
                    Dispatch marketing campaigns via Resend.
                  </DialogDescription>
                  {isSingleLead && singleLead?.tool_site_url ? (
                    <a
                      href={singleLead.tool_site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group truncate"
                    >
                      <span>{singleLead.tool_site_url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')}</span>
                      <ArrowUpRight size={11} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <span>Direct campaign dispatch via Resend API</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Content Body (Scrollable) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {/* Dispatch Results Report */}
          {sendResults && (
            <div className="p-4 rounded-xl border space-y-3 bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-xs shadow-2xs animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  Dispatch Summary
                </span>
                <span className="text-xs text-zinc-500">
                  {sendResults.filter((r) => r.success).length} / {sendResults.filter((r) => !r.skipped).length} Sent
                  {sendResults.some((r) => r.skipped) &&
                    ` · ${sendResults.filter((r) => r.skipped).length} Skipped`}
                </span>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {sendResults.map((r, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs border ${
                      r.success
                        ? 'bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300'
                        : r.skipped
                        ? 'bg-amber-50/70 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300'
                        : 'bg-rose-50/70 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300'
                    }`}
                  >
                    <span className="font-mono font-medium truncate max-w-[320px]">
                      {r.skipped && r.toolName ? `${r.toolName} · ${r.email}` : r.email}
                    </span>
                    <span className="text-right font-medium">
                      {r.success
                        ? '✓ Delivered'
                        : r.skipped
                        ? `Skipped: ${r.error || 'already listed'}`
                        : `✕ ${r.error || 'Failed'}`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-1 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="h-8 text-xs px-4 cursor-pointer"
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Send Error Notice */}
          {sendError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-center gap-2 shadow-2xs">
              <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="font-medium">{sendError}</span>
            </div>
          )}

          {!sendResults && (
            <div className="space-y-5">
              {/* Guard Notices & Warnings */}
              {checkingGuards && (
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2" role="status">
                  <Spinner size={13} className="text-zinc-500" />
                  <span>Checking Toolbit directory listings and email history…</span>
                </div>
              )}

              {guardCheckError && (
                <div
                  className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/20 text-xs flex items-center justify-between gap-3 shadow-2xs animate-in fade-in-50 duration-150"
                  role="alert"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
                    <span className="text-rose-900 dark:text-rose-300 font-medium leading-snug">
                      {guardCheckError.includes('JWT') || guardCheckError.includes('token')
                        ? 'Authentication session refreshed. Click Retry to continue verification.'
                        : `${guardCheckError} Sending is paused until verification succeeds.`}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryGuardCheck}
                    className="h-7 text-xs px-3 bg-white dark:bg-zinc-900 shrink-0 font-semibold cursor-pointer border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-zinc-800"
                  >
                    <RotateCcw size={11} className="mr-1" />
                    Retry
                  </Button>
                </div>
              )}

              {missingLeads.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5" role="status">
                  <AlertCircle size={13} />
                  <span>
                    {missingLeads.length === 1
                      ? `${missingLeads[0].tool_name} no longer exists and will be skipped.`
                      : `${missingLeads.length} selected leads no longer exist and will be skipped.`}
                  </span>
                </p>
              )}

              {/* ── Responsive Layout: Setup (Compact) & Live Preview (Expanded) ── */}
              <div
                className={`flex flex-col items-start ${
                  selectedTemplateId ? 'lg:flex-row gap-6' : 'w-full'
                }`}
              >
                {/* ── Left Column: Configuration ── */}
                <div className={`${selectedTemplateId ? 'w-full lg:w-[610px] shrink-0' : 'w-full'} space-y-5`}>
                  {/* Recipients & Inboxes Card */}
                  <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 space-y-3 shadow-2xs">
                    {isSingleLead && singleLead ? (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Mail size={13} className="text-zinc-400" />
                            <h3 className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-xs">
                              Target Email{getAllEmails(singleLead).length > 1 ? 's' : ''}
                            </h3>
                          </div>
                          {getAllEmails(singleLead).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (singleSelectedEmails.length === getAllEmails(singleLead).length) {
                                  setSingleSelectedEmails(getRecommendedEmailsForLead(singleLead, 'primary'));
                                } else {
                                  setSingleSelectedEmails(getRecommendedEmailsForLead(singleLead, 'all'));
                                }
                              }}
                              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer transition-colors"
                            >
                              {singleSelectedEmails.length === getAllEmails(singleLead).length ? 'Reset to primary' : 'Select all'}
                            </button>
                          )}
                        </div>

                        {getAllEmails(singleLead).length === 0 ? (
                          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-xs flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0 text-zinc-400" />
                            <span>No business emails configured for <strong>{singleLead.tool_name}</strong>.</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(singleLead.business_emails || {}).map(([email, rawRecord]) => {
                                const record: EmailRecord = typeof rawRecord === 'object' && rawRecord !== null ? (rawRecord as EmailRecord) : { status: (rawRecord as any) || 'unverified' };
                                const isBounced = record.resend_status === 'bounced' || (record.status === 'undeliverable' && Boolean(record.bounce_reason));
                                const isUndeliverable = record.status === 'undeliverable' || isBounced;
                                const isDeliverable = record.status === 'deliverable' && !isBounced;
                                const isChecked = singleSelectedEmails.includes(email) && !isUndeliverable;

                                const chipTitle = isBounced
                                  ? `Bounced in Resend: ${record.bounce_reason || 'Mailbox delivery failed'} — sending is blocked`
                                  : isUndeliverable
                                  ? 'Undeliverable email — blocked from sending'
                                  : isDeliverable
                                  ? 'Verified deliverable email'
                                  : 'Unverified email';

                                return (
                                  <button
                                    key={email}
                                    type="button"
                                    disabled={isUndeliverable}
                                    onClick={() => {
                                      if (isUndeliverable) return;
                                      if (isChecked) {
                                        if (singleSelectedEmails.length > 1) {
                                          setSingleSelectedEmails(singleSelectedEmails.filter((e) => e !== email));
                                        }
                                      } else {
                                        setSingleSelectedEmails([...singleSelectedEmails, email]);
                                      }
                                    }}
                                    title={chipTitle}
                                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                                      isUndeliverable
                                        ? 'bg-rose-50/50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40 line-through opacity-60 cursor-not-allowed'
                                        : isChecked
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-medium cursor-pointer shadow-2xs'
                                        : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer'
                                    }`}
                                  >
                                    <div
                                      className={`size-3.5 rounded-xs flex items-center justify-center border ${
                                        isUndeliverable
                                          ? 'border-rose-400 bg-rose-100/50 dark:bg-rose-900/30 text-rose-500'
                                          : isChecked
                                          ? 'border-white bg-white/20 dark:border-zinc-900 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                                          : 'border-zinc-300 dark:border-zinc-600'
                                      }`}
                                    >
                                      {isChecked && <Check size={10} strokeWidth={3} />}
                                      {isUndeliverable && <span className="text-[8px] font-bold">✕</span>}
                                    </div>
                                    <span className="truncate max-w-[220px]">{email}</span>
                                    <span
                                      className={`size-1.5 rounded-full shrink-0 ${
                                        isDeliverable
                                          ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                                          : isUndeliverable
                                          ? 'bg-rose-500 ring-2 ring-rose-500/20'
                                          : 'bg-zinc-400 dark:bg-zinc-500'
                                      }`}
                                    />
                                    {isBounced && (
                                      <span className="text-[9px] px-1 py-0 rounded font-sans uppercase font-bold tracking-wider bg-rose-200/80 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                                        Bounced
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {hasUnverifiedSelected && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 pt-0.5">
                                <Info size={12} className="shrink-0 text-zinc-400" />
                                <span>Unverified address selected (deliverability hasn&apos;t been tested)</span>
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users size={13} className="text-zinc-400" />
                            <h3 className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-xs">
                              Target Inboxes ({targetItems.length})
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShowRecipientsList(!showRecipientsList)}
                              className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline cursor-pointer ml-1"
                            >
                              {showRecipientsList ? 'Hide details' : 'Show details'}
                            </button>
                          </div>

                          <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs">
                            <button
                              type="button"
                              onClick={() => handleSetBulkStrategy('primary')}
                              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                bulkStrategy === 'primary'
                                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              1 per tool
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetBulkStrategy('all')}
                              className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                bulkStrategy === 'all'
                                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              All found
                            </button>
                          </div>
                        </div>

                        {leadsMissingEmailCount > 0 && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertCircle size={12} />
                            <span>{leadsMissingEmailCount} of {selectedLeads.length} tools have no email on file (skipped).</span>
                          </p>
                        )}

                        {leadsAllUndeliverableCount > 0 && (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                            <AlertCircle size={12} />
                            <span>{leadsAllUndeliverableCount} of {selectedLeads.length} tools have only undeliverable emails (skipped).</span>
                          </p>
                        )}

                        {showRecipientsList && (
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 p-3 max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
                            {selectedLeads.map((lead) => {
                              const emailEntries = Object.entries(lead.business_emails || {});
                              const isExcluded = excludedLeadIds.has(lead.id);
                              const selectedForLead = bulkSelectedEmails[lead.id] || [];
                              const hasSendable = emailEntries.some(([, raw]) => {
                                const rec: EmailRecord = typeof raw === 'object' && raw !== null ? (raw as EmailRecord) : { status: (raw as any) || 'unverified' };
                                return rec.status !== 'undeliverable' && rec.resend_status !== 'bounced';
                              });

                              if (isExcluded) {
                                const flags = historyByLeadId.get(lead.id);
                                const isExisting = (selectedTemplateId === 'tool_outreach' || !selectedTemplateId) && existingByLeadId.has(lead.id);
                                const reasonBadge = flags?.replied
                                  ? 'Replied (Skipped)'
                                  : flags?.templateSent
                                  ? 'Duplicate (Skipped)'
                                  : isExisting
                                  ? 'Already on Toolbit (Skipped)'
                                  : 'Skipped';

                                return (
                                  <div key={lead.id} className="py-2 flex items-center justify-between text-xs opacity-60">
                                    <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[220px]">
                                      {lead.tool_name}
                                    </span>
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                      {reasonBadge}
                                    </span>
                                  </div>
                                );
                              }

                              if (emailEntries.length === 0) {
                                return (
                                  <div key={lead.id} className="py-2 flex items-center justify-between text-xs opacity-70">
                                    <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[220px]">
                                      {lead.tool_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                      No email (Skipped)
                                    </span>
                                  </div>
                                );
                              }

                              if (!hasSendable) {
                                return (
                                  <div key={lead.id} className="py-2 flex items-center justify-between text-xs opacity-70">
                                    <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[220px]">
                                      {lead.tool_name}
                                    </span>
                                    <span className="text-[10px] text-rose-500 dark:text-rose-400 font-medium">
                                      Undeliverable only (Skipped)
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <div key={lead.id} className="py-2.5 first:pt-1 last:pb-1 space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[240px]">
                                      {lead.tool_name}
                                    </span>
                                    {emailEntries.length > 1 && (
                                      <div className="flex items-center gap-1.5 text-[10px]">
                                        <button
                                          type="button"
                                          onClick={() => handleSelectLeadPrimaryEmail(lead.id)}
                                          className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                                        >
                                          Primary
                                        </button>
                                        <span className="text-zinc-300 dark:text-zinc-700">·</span>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectLeadAllEmails(lead.id)}
                                          className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                                        >
                                          All
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-1.5">
                                    {emailEntries.map(([email, rawRecord]) => {
                                      const record: EmailRecord = typeof rawRecord === 'object' && rawRecord !== null ? (rawRecord as EmailRecord) : { status: (rawRecord as any) || 'unverified' };
                                      const isBounced = record.resend_status === 'bounced' || (record.status === 'undeliverable' && Boolean(record.bounce_reason));
                                      const isUndeliverable = record.status === 'undeliverable' || isBounced;
                                      const isDeliverable = record.status === 'deliverable' && !isBounced;
                                      const isChecked = selectedForLead.includes(email) && !isUndeliverable;

                                      return (
                                        <button
                                          key={email}
                                          type="button"
                                          disabled={isUndeliverable}
                                          onClick={() => handleToggleBulkEmail(lead.id, email)}
                                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                                            isUndeliverable
                                              ? 'bg-rose-50/40 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40 line-through opacity-60 cursor-not-allowed'
                                              : isChecked
                                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-medium cursor-pointer shadow-2xs'
                                              : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 cursor-pointer'
                                          }`}
                                        >
                                          <div
                                            className={`size-3 rounded-xs flex items-center justify-center border ${
                                              isUndeliverable
                                                ? 'border-rose-400 bg-rose-100/50 dark:bg-rose-900/30 text-rose-500'
                                                : isChecked
                                                ? 'border-white bg-white/20 dark:border-zinc-900 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                                                : 'border-zinc-400 dark:border-zinc-600'
                                            }`}
                                          >
                                            {isChecked && <Check size={8} strokeWidth={3} />}
                                            {isUndeliverable && <span className="text-[7px] font-bold">✕</span>}
                                          </div>
                                          <span className="truncate max-w-[200px]">{email}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Campaign Template Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          Marketing Template
                        </span>
                        {!selectedTemplateId && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            • Select a template to preview &amp; send
                          </span>
                        )}
                      </div>
                      {selectedTemplateId && activeTemplate && (
                        <span className="text-[10px] text-zinc-500 font-medium">
                          Selected: <strong className="text-zinc-900 dark:text-zinc-100">{activeTemplate.name}</strong>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {templateList.map((tmpl) => {
                        const isSelected = selectedTemplateId === tmpl.id;
                        const meta = TEMPLATE_META[tmpl.id] || {
                          icon: <Mail size={15} className="text-zinc-500" />,
                          badge: 'Template',
                          description: tmpl.description,
                        };

                        return (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => {
                              if (tmpl.id !== selectedTemplateId) setAllowRepeat(false);
                              setSelectedTemplateId(tmpl.id);
                              setIsUserCustomizingBody(false);
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all relative flex items-start gap-2.5 cursor-pointer bg-white dark:bg-zinc-900/60 ${
                              isSelected
                                ? 'border-zinc-400 dark:border-zinc-500 shadow-2xs'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0 mt-0.5">
                              {meta.icon}
                            </div>
                            <div className="min-w-0 flex-1 pr-5">
                              <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate block">
                                {tmpl.name}
                              </span>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                {meta.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2.5 right-2.5 size-4 rounded border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-2xs pointer-events-none">
                                <Check size={11} strokeWidth={2.5} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* History & Existing Warnings / Confirmations */}
                  {(repliedLeads.length > 0 || repeatLeads.length > 0 || existingLeads.length > 0) && (
                    <div className="space-y-3">
                      {existingLeads.length > 0 && (
                        <ContactedLeadsGroup
                          type="existing"
                          title={
                            isSingleLead
                              ? `${existingLeads[0].tool_name} is already listed on Toolbit`
                              : `${existingLeads.length} of ${selectedLeads.length} tools already listed on Toolbit`
                          }
                          leads={existingLeads}
                          reasonOf={(lead) => {
                            const m = existingByLeadId.get(lead.id) || [];
                            return m.map(formatExistingToolMatch).join('; ');
                          }}
                          confirmLabel="Send anyway"
                          checked={allowExisting}
                          onCheckedChange={setAllowExisting}
                        />
                      )}
                      {repeatLeads.length > 0 && (
                        <ContactedLeadsGroup
                          type="repeat"
                          title={
                            isSingleLead
                              ? `${repeatLeads[0].tool_name} previously received outreach`
                              : `${repeatLeads.length} of ${selectedLeads.length} tools previously received outreach`
                          }
                          leads={repeatLeads}
                          reasonOf={(lead) => historyByLeadId.get(lead.id)?.templateSent || ''}
                          confirmLabel="Resend anyway"
                          checked={allowRepeat}
                          onCheckedChange={setAllowRepeat}
                        />
                      )}
                      {repliedLeads.length > 0 && (
                        <ContactedLeadsGroup
                          type="replied"
                          title={
                            isSingleLead
                              ? `${repliedLeads[0].tool_name} already replied`
                              : `${repliedLeads.length} of ${selectedLeads.length} tools already replied`
                          }
                          leads={repliedLeads}
                          reasonOf={(lead) => historyByLeadId.get(lead.id)?.replied || ''}
                          confirmLabel="Send anyway"
                          checked={allowReplied}
                          onCheckedChange={setAllowReplied}
                        />
                      )}
                    </div>
                  )}


                </div>

                {/* ── Right Column: Subject & Live Email Preview ── */}
                {selectedTemplateId && (
                  <div className="w-full lg:flex-1 min-w-0 space-y-4 animate-in fade-in-50 duration-200">
                    {/* Subject Line & Customizer Card */}
                    <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Subject Line
                          </label>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">
                            {`{{tool_name}}, {{tool_domain}}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCustomizing(!isCustomizing)}
                          className="text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 font-semibold inline-flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
                        >
                          <Sparkles size={12} className="text-amber-500" />
                          <span>{isCustomizing ? 'Close body editor' : 'Customize email body'}</span>
                        </button>
                      </div>

                      <Input
                        value={customSubject}
                        onChange={(e) => {
                          setIsUserCustomizingBody(true);
                          setCustomSubject(e.target.value);
                        }}
                        className="h-9 text-xs font-medium bg-zinc-50/50 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 focus-visible:ring-emerald-500/20"
                        placeholder="Subject line with {{tool_name}}..."
                      />

                      {/* Custom Rich Text Body Editor */}
                      {isCustomizing && (
                        <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in-50 duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                              Custom Body Content
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleResetCustomContent}
                              className="h-6 text-[10px] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 gap-1 px-1.5 cursor-pointer"
                            >
                              <RotateCcw size={10} />
                              Reset to template
                            </Button>
                          </div>

                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden shadow-2xs">
                            <RichTextEditor
                              content={customHtml}
                              outputFormat="html"
                              onChange={(html) => {
                                if (isProgrammaticUpdate.current) return;
                                setIsUserCustomizingBody(true);
                                setCustomHtml(html);
                              }}
                              placeholder="Type custom email message..."
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Live Email Preview Card */}
                    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye size={13} className="text-zinc-400" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Live Email Preview
                          </h3>
                        </div>
                        {sampleLead && (
                          <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[200px]" title={sampleLead.tool_name}>
                            Previewing: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{sampleLead.tool_name}</strong>
                          </span>
                        )}
                      </div>

                      {activeTemplate ? (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-2xs">
                          {/* Email Header */}
                          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/80 space-y-1.5 text-xs">
                            <div className="flex items-start gap-2">
                              <span className="text-zinc-400 font-medium shrink-0">Subject:</span>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 break-words leading-snug">
                                {previewSubject || '(No subject line)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span className="text-zinc-400">From:</span>
                              <span className="truncate">
                                {activeTemplate?.from_name === 'Toolbit Team' || !activeTemplate?.from_name ? 'Toolbit AI' : activeTemplate.from_name}{' '}
                                &lt;{activeTemplate?.from_email}&gt;
                              </span>
                            </div>
                            {targetItems.length > 0 && (
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span className="text-zinc-400">To:</span>
                                <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
                                  {targetItems[0].recipientEmail}
                                  {targetItems.length > 1 && ` (+${targetItems.length - 1} more)`}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Email Body */}
                          <div className="p-4 max-h-[420px] overflow-y-auto custom-scrollbar bg-white text-zinc-900">
                            <div
                              dangerouslySetInnerHTML={{ __html: previewHtml }}
                              className="text-xs leading-relaxed email-preview-container [&_ul]:!list-disc [&_ul]:!pl-6 [&_ol]:!list-decimal [&_ol]:!pl-6 [&_li]:!list-item"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Dialog Footer ── */}
        <DialogFooter className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0" />
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">From:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-200/70 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-300/60 dark:border-zinc-700/80 font-mono text-[11px] truncate max-w-[280px]">
              {(activeTemplate?.from_name === 'Toolbit Team' || !activeTemplate?.from_name ? 'Toolbit AI' : activeTemplate.from_name)}{' '}
              &lt;{activeTemplate?.from_email?.trim() || 'team@mail.toolbit.ai'}&gt;
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">via Resend</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={sending}
              className="h-8 text-xs border-zinc-200 dark:border-zinc-800 cursor-pointer"
            >
              {sendResults ? 'Close' : 'Cancel'}
            </Button>

            {!sendResults && (
              <Button
                type="button"
                onClick={handleSend}
                disabled={
                  !selectedTemplateId ||
                  sending ||
                  targetItems.length === 0 ||
                  checkingGuards ||
                  (Boolean(guardCheckError) && !guards)
                }
                className="h-8 px-4 text-xs gap-1.5 font-semibold shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  !selectedTemplateId
                    ? 'Please select a template first'
                    : checkingGuards
                    ? 'Checking Toolbit listings and email history…'
                    : guardCheckError && !guards
                    ? 'Precheck verification failed. Click Retry above.'
                    : targetItems.length === 0
                    ? 'No valid email recipients selected'
                    : skippedItemsCount > 0
                    ? `${sendableItemsCount} will be sent, ${skippedItemsCount} will be skipped by Duplicate Protection`
                    : `Send outreach to ${targetItems.length} recipients`
                }
              >
                {sending ? (
                  <>
                    <Spinner size={12} />
                    <span>Sending ({targetItems.length})...</span>
                  </>
                ) : !selectedTemplateId ? (
                  <>
                    <Mail size={12} />
                    <span>Select a template</span>
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    <span>Send ({targetItems.length})</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
