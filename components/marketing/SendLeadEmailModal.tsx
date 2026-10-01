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
import { Select, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Send,
  Eye,
  SlidersHorizontal,
  Mail,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
  Check,
  RotateCcw,
  Megaphone,
  Handshake,
  RefreshCw,
} from 'lucide-react';
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
  formatExistingToolBadge,
  formatExistingToolTitle,
  type ExistingToolMatch,
} from '@/lib/marketing/existing-tools';
import {
  evaluateOutreachHistory,
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
    const literal = () => value; // insert as-is ("$&" / "$1" in a tool name stay literal)
    const standardRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(standardRegex, literal);
    const encodedRegex = new RegExp(`%7B%7B\\s*${key}\\s*%7D%7D`, 'gi');
    result = result.replace(encodedRegex, literal);
    const entityRegex = new RegExp(`(&#123;|&#x7b;|&lbrace;){2}\\s*${key}\\s*(&#125;|&#x7d;|&rbrace;){2}`, 'gi');
    result = result.replace(entityRegex, literal);
  }
  return result;
}

/** "If you want {{tool_name}}" keeps the plain (not linked) tool name. `plainName` must be safe for the target format. */
function replaceIfYouWantToolName(content: string, plainName: string): string {
  return content.replace(
    /(If you want\s+(?:<strong[^>]*>|\*\*|))\s*\{\{\s*tool_name\s*\}\}/gi,
    (_match, prefix: string) => `${prefix}${plainName}`
  );
}

/**
 * Lead values for the editor / preview. Lead data is scraped (untrusted), so for HTML output every
 * value is escaped and only http(s) URLs are used (prevents XSS in the admin panel).
 */
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

// "https://www.Foo.ai/en" -> "Foo.ai"
function getToolDomain(siteUrl: string): string {
  if (!siteUrl) return '';
  try {
    const parsed = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return siteUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

/**
 * Subject + editor HTML used when a template is selected / reset.
 * - With a lead (single-lead send): the lead's values are filled in, so the admin edits the final text.
 * - Without a lead (bulk send): the {{placeholders}} are kept, so the server fills them in for
 *   every recipient. Filling in one sample lead here would send that tool's name to everyone.
 */
function buildEditorDefaults(
  template: MarketingTemplate,
  lead: MarketingOutreachLead | null
): { subject: string; html: string } {
  if (!lead) {
    return { subject: template.subject, html: convertTextToEditorHtml(template.text) };
  }

  const v = getLeadVars(lead);

  // Body becomes editor HTML -> escaped values. Subject is plain text (an <input>) -> raw values.
  const htmlVars: Record<string, string> = {
    tool_name: v.siteUrl ? `[${v.html.toolName}](${v.html.siteUrl})` : v.html.toolName,
    company_name: v.html.toolName,
    tool_site_url: v.html.siteUrl,
    tool_url: v.html.siteUrl,
    tool_domain: v.html.toolDomain,
    domain_name: v.html.toolDomain,
    recipient_name: v.html.toolName,
    first_name: 'there',
  };
  const subjectVars: Record<string, string> = {
    tool_name: v.toolName,
    company_name: v.toolName,
    tool_site_url: v.siteUrl,
    tool_url: v.siteUrl,
    tool_domain: v.toolDomain,
    domain_name: v.toolDomain,
    recipient_name: v.toolName,
    first_name: 'there',
  };

  // In "If you want {{tool_name}}", do not use link tag, keep as normal plain tool name
  let rawText = replaceIfYouWantToolName(template.text, v.html.toolName);
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
  tool_relist: {
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

/** Leads that need an explicit confirmation (already replied / already received the template). */
function ContactedLeadsGroup({
  title,
  leads,
  reasonOf,
  confirmLabel,
  checked,
  onCheckedChange,
}: {
  title: string;
  leads: MarketingOutreachLead[];
  reasonOf: (lead: MarketingOutreachLead) => string;
  confirmLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2" role="status">
      <div className="flex items-start gap-2 font-semibold">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-violet-600 dark:text-violet-400" />
        <span>{title}</span>
      </div>
      <ul className="max-h-28 overflow-y-auto space-y-1 pl-6">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium truncate" title={lead.tool_site_url}>
              {lead.tool_name}
            </span>
            <span className="text-right text-violet-800/80 dark:text-violet-300/80">{reasonOf(lead)}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 pl-6 text-[11px] font-medium cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="cursor-pointer accent-violet-600"
        />
        {confirmLabel}
      </label>
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

  // Template selection: Order all 4 templates logically
  const templateList = useMemo(() => {
    const preferredOrder = ['tool_relist', 'new_tool_launch', 'sponsored_feature', 'affiliate_partnership'];
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

  // Initially unselected so user chooses one of the 4 templates
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Single-lead selected emails (Set of strings)
  const [singleSelectedEmails, setSingleSelectedEmails] = useState<string[]>([]);

  // Bulk strategy: 'primary' (1 email per tool), 'all' (all emails per tool), or 'custom' (manually selected per tool)
  const [bulkStrategy, setBulkStrategy] = useState<'primary' | 'all' | 'custom'>('primary');

  // Bulk-mode selected emails mapped by leadId -> array of selected email addresses
  const [bulkSelectedEmails, setBulkSelectedEmails] = useState<Record<string, string[]>>({});

  // One-off customization
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isUserCustomizingBody, setIsUserCustomizingBody] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customHtml, setCustomHtml] = useState('');
  const isProgrammaticUpdate = useRef(false);

  // Expanded recipients list toggle
  const [showRecipientsList, setShowRecipientsList] = useState(false);

  // Live preview toggle
  const [showPreview, setShowPreview] = useState(false);

  // Sending state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);

  // Send guards (lib/marketing/send-guards.ts): one pre-check per open drives the UI;
  // the server re-checks everything when sending.
  const [guardCheckNonce, setGuardCheckNonce] = useState(0); // bumped on close / retry
  const [guardCheck, setGuardCheck] = useState<{
    key: string;
    guards: Record<string, OutreachLeadGuard>;
    error: string | null;
  } | null>(null);
  // Explicit confirmations (default off) for leads that already replied / already got this template
  const [allowReplied, setAllowReplied] = useState(false);
  const [allowRepeat, setAllowRepeat] = useState(false);

  const guardLeadIds = useMemo(
    () => Array.from(new Set(selectedLeads.map((lead) => lead.id))),
    [selectedLeads]
  );
  const guardCheckKey = `${guardCheckNonce}|${guardLeadIds.join(',')}`;

  useEffect(() => {
    if (!open || guardLeadIds.length === 0) return;
    let cancelled = false;
    const key = guardCheckKey;
    getOutreachSendPrecheckAction(token, guardLeadIds)
      .then((res) => {
        if (cancelled) return;
        setGuardCheck({
          key,
          guards: res.success ? res.data || {} : {},
          error: res.success ? null : res.error || GUARD_CHECK_ERROR,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setGuardCheck({ key, guards: {}, error: err?.message || GUARD_CHECK_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, guardLeadIds, guardCheckKey]);

  const currentGuardCheck = guardCheck?.key === guardCheckKey ? guardCheck : null;
  const checkingGuards = open && guardLeadIds.length > 0 && !currentGuardCheck;
  const guardCheckError = currentGuardCheck?.error ?? null;
  const guards = currentGuardCheck && !currentGuardCheck.error ? currentGuardCheck.guards : null;

  // Never sent: tool already on Toolbit (lead id -> matches, listed tools first)
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
    () => selectedLeads.filter((lead) => existingByLeadId.has(lead.id)),
    [selectedLeads, existingByLeadId]
  );

  // Never sent: lead no longer exists
  const missingLeads = useMemo(
    () => (guards ? selectedLeads.filter((lead) => !guards[lead.id]) : []),
    [guards, selectedLeads]
  );

  // Needs confirmation: already replied / already received the selected template
  const historyByLeadId = useMemo(() => {
    const map = new Map<string, OutreachHistoryFlags>();
    if (!guards) return map;
    for (const lead of selectedLeads) {
      const guard = guards[lead.id];
      if (!guard || guard.existing.length > 0) continue;
      const flags = evaluateOutreachHistory(guard.status, guard.history, selectedTemplateId);
      if (flags.replied || flags.templateSent) map.set(lead.id, flags);
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

  // Leads left out of this send (same rules as the server)
  const excludedLeadIds = useMemo(() => {
    const excluded = new Set<string>();
    if (!guards) return excluded;
    for (const lead of selectedLeads) {
      const flags = historyByLeadId.get(lead.id);
      if (
        !guards[lead.id] ||
        existingByLeadId.has(lead.id) ||
        (flags?.replied && !allowReplied) ||
        (flags?.templateSent && !allowRepeat)
      ) {
        excluded.add(lead.id);
      }
    }
    return excluded;
  }, [guards, selectedLeads, historyByLeadId, existingByLeadId, allowReplied, allowRepeat]);

  // Initialize or reset when modal opens or selected leads change
  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      setSendResults(null);
      setSendError(null);
      setIsCustomizing(false);
      setIsUserCustomizingBody(false);
      setShowPreview(false);
      setAllowReplied(false);
      setAllowRepeat(false);
      setBulkSelectedEmails({});
      setBulkStrategy('primary');
      setShowRecipientsList(false);
      setGuardCheckNonce((n) => n + 1); // re-check on next open
      return;
    }

    // When modal opens, start unselected so user explicitly chooses one of the 4 templates
    setSelectedTemplateId('');

    if (isSingleLead && singleLead) {
      // Default select all emails for this single tool
      setSingleSelectedEmails([...singleLead.business_emails]);
    } else if (!isSingleLead && selectedLeads.length > 0) {
      // Default: select the primary (first) email for each tool as currently working
      const initial: Record<string, string[]> = {};
      for (const lead of selectedLeads) {
        const emails = lead.business_emails || [];
        initial[lead.id] = emails.length > 0 ? [emails[0]] : [];
      }
      setBulkSelectedEmails(initial);
      setBulkStrategy('primary');
      setShowRecipientsList(true); // Open recipient inboxes so the user can easily see and customize email selections
    }
  }, [open, isSingleLead, singleLead, selectedLeads]);

  // Bulk Strategy Handlers: batch select primary vs all
  const handleSetBulkStrategy = (strat: 'primary' | 'all') => {
    setBulkStrategy(strat);
    const updated: Record<string, string[]> = {};
    for (const lead of selectedLeads) {
      const emails = lead.business_emails || [];
      if (strat === 'primary') {
        updated[lead.id] = emails.length > 0 ? [emails[0]] : [];
      } else {
        updated[lead.id] = [...emails];
      }
    }
    setBulkSelectedEmails(updated);
  };

  // Toggle single email for a specific lead in bulk mode
  const handleToggleBulkEmail = (leadId: string, email: string) => {
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

      // Recalculate if it still matches pure primary or all strategy across all leads
      let matchesPrimary = true;
      let matchesAll = true;
      for (const lead of selectedLeads) {
        const leadEmails = lead.business_emails || [];
        const sel = updated[lead.id] || [];
        if (leadEmails.length > 0) {
          if (sel.length !== 1 || sel[0] !== leadEmails[0]) matchesPrimary = false;
          if (sel.length !== leadEmails.length) matchesAll = false;
        }
      }
      if (matchesPrimary) setBulkStrategy('primary');
      else if (matchesAll) setBulkStrategy('all');
      else setBulkStrategy('custom');

      return updated;
    });
  };

  // Helper for single tool: select only primary email
  const handleSelectLeadPrimaryEmail = (leadId: string, primaryEmail: string) => {
    setBulkSelectedEmails((prev) => {
      const updated = { ...prev, [leadId]: [primaryEmail] };
      let matchesPrimary = true;
      let matchesAll = true;
      for (const lead of selectedLeads) {
        const leadEmails = lead.business_emails || [];
        const sel = updated[lead.id] || [];
        if (leadEmails.length > 0) {
          if (sel.length !== 1 || sel[0] !== leadEmails[0]) matchesPrimary = false;
          if (sel.length !== leadEmails.length) matchesAll = false;
        }
      }
      if (matchesPrimary) setBulkStrategy('primary');
      else if (matchesAll) setBulkStrategy('all');
      else setBulkStrategy('custom');
      return updated;
    });
  };

  // Helper for single tool: select all emails
  const handleSelectLeadAllEmails = (leadId: string, allEmails: string[]) => {
    setBulkSelectedEmails((prev) => {
      const updated = { ...prev, [leadId]: [...allEmails] };
      let matchesPrimary = true;
      let matchesAll = true;
      for (const lead of selectedLeads) {
        const leadEmails = lead.business_emails || [];
        const sel = updated[lead.id] || [];
        if (leadEmails.length > 0) {
          if (sel.length !== 1 || sel[0] !== leadEmails[0]) matchesPrimary = false;
          if (sel.length !== leadEmails.length) matchesAll = false;
        }
      }
      if (matchesPrimary) setBulkStrategy('primary');
      else if (matchesAll) setBulkStrategy('all');
      else setBulkStrategy('custom');
      return updated;
    });
  };

  const activeTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return templates[selectedTemplateId] || null;
  }, [templates, selectedTemplateId]);

  // Compute final list of target dispatch items
  const targetItems: OutreachSendItem[] = useMemo(() => {
    const items: OutreachSendItem[] = [];
    const seen = new Set<string>(); // lead + address, case-insensitive (never the same inbox twice)
    const add = (lead: MarketingOutreachLead, rawEmail: string | undefined) => {
      const email = (rawEmail || '').trim();
      const key = `${lead.id}|${email.toLowerCase()}`;
      if (!email || seen.has(key)) return;
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
      if (excludedLeadIds.has(singleLead.id)) return items;
      for (const email of singleSelectedEmails) add(singleLead, email);
      return items;
    }

    // Bulk mode
    for (const lead of selectedLeads) {
      if (excludedLeadIds.has(lead.id)) continue;
      const emails = bulkSelectedEmails[lead.id] !== undefined
        ? bulkSelectedEmails[lead.id]
        : (bulkStrategy === 'primary' ? (lead.business_emails?.[0] ? [lead.business_emails[0]] : []) : (lead.business_emails || []));
      for (const email of emails) add(lead, email);
    }

    return items;
  }, [isSingleLead, singleLead, singleSelectedEmails, selectedLeads, bulkStrategy, bulkSelectedEmails, excludedLeadIds]);

  // Lead without any business email count (leads skipped for other reasons are reported separately)
  const leadsMissingEmailCount = useMemo(() => {
    return selectedLeads.filter(
      (l) => !excludedLeadIds.has(l.id) && (l.business_emails || []).length === 0
    ).length;
  }, [selectedLeads, excludedLeadIds]);

  // Sample data for live preview (prefer a tool that will actually be emailed)
  const sampleLead = isSingleLead
    ? singleLead
    : selectedLeads.find((l) => !excludedLeadIds.has(l.id)) || selectedLeads[0] || null;

  // Single lead: the editor shows the final, personalised text.
  // Bulk: the editor keeps the {{placeholders}} so every recipient gets their own tool's values.
  const personalizeEditor = isSingleLead;

  // Sync template text into editor when template changes
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

  // Reset custom content back to active template default
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

  // Preview generated HTML
  const previewHtml = useMemo(() => {
    if (!activeTemplate) return '';
    // Rendered with dangerouslySetInnerHTML: lead values are escaped, only http(s) links
    const { html: v, siteUrl } = getLeadVars(sampleLead);

    const vars: Record<string, string> = {
      tool_name: siteUrl ? `<a href="${v.siteUrl}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${v.toolName}</a>` : v.toolName,
      company_name: v.toolName,
      tool_site_url: v.siteUrl,
      tool_url: v.siteUrl,
      tool_domain: v.toolDomain,
      domain_name: v.toolDomain,
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

    // In "If you want {{tool_name}}", do not use link tag, keep as normal plain tool name
    base = replaceIfYouWantToolName(base, v.toolName);
    if (!v.toolDomain) {
      base = base.replace(/\s*\(\s*\{\{\s*(?:tool_domain|domain_name)\s*\}\}\s*\)/gi, '');
    }

    return substituteVars(base, vars);
  }, [activeTemplate, sampleLead, isCustomizing, customHtml]);

  // Preview Subject
  const previewSubject = useMemo(() => {
    if (!activeTemplate) return '';
    const toolName = sampleLead?.tool_name || 'AI Tool';
    const base = isCustomizing && customSubject.trim() ? customSubject.trim() : activeTemplate.subject;
    return substituteVars(base, { tool_name: toolName, first_name: 'there' });
  }, [activeTemplate, sampleLead, isCustomizing, customSubject]);

  // Execute Send
  const handleSend = async () => {
    if (!activeTemplate || targetItems.length === 0 || checkingGuards || guardCheckError) return;
    setSending(true);
    setSendError(null);
    setSendResults(null);

    try {
      const res = await sendOutreachLeadEmailAction(token, {
        templateId: activeTemplate.id,
        items: targetItems,
        customSubject: isCustomizing && customSubject.trim() ? customSubject.trim() : undefined,
        customHtml: isCustomizing && customHtml.trim() ? customHtml.trim() : undefined,
        // Only the leads the admin saw and explicitly confirmed; the server re-checks the rest.
        allowRepliedLeadIds: allowReplied ? repliedLeads.map((lead) => lead.id) : [],
        allowRepeatLeadIds: allowRepeat ? repeatLeads.map((lead) => lead.id) : [],
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

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !sending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl">
        <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3 pr-8">
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {isSingleLead ? `Outreach · ${singleLead?.tool_name}` : `Bulk Outreach (${selectedLeads.length} Tools)`}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Dispatch marketing campaigns via Resend.
                </DialogDescription>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-medium px-2 py-0 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shrink-0"
                >
                  {targetItems.length} {targetItems.length === 1 ? 'recipient' : 'recipients'}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Results Report Banner ── */}
        {sendResults && (
          <div className="p-3.5 rounded-xl border space-y-2.5 bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-xs animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-500" />
                Dispatch Summary
              </span>
              <span className="text-[11px] text-zinc-500">
                {sendResults.filter((r) => r.success).length} / {sendResults.filter((r) => !r.skipped).length} Sent
                {sendResults.some((r) => r.skipped) &&
                  ` · ${sendResults.filter((r) => r.skipped).length} Skipped`}
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {sendResults.map((r, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg flex items-center justify-between gap-3 text-[11px] border ${
                    r.success
                      ? 'bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300'
                      : r.skipped
                      ? 'bg-amber-50/70 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300'
                      : 'bg-rose-50/70 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300'
                  }`}
                >
                  <span className="font-medium truncate max-w-[280px]">
                    {r.skipped && r.toolName ? `${r.toolName} · ${r.email}` : r.email}
                  </span>
                  <span className="text-right">
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
                className="h-7 text-xs cursor-pointer"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Error notification */}
        {sendError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="font-medium">{sendError}</span>
          </div>
        )}

        {!sendResults && (
          <div className="space-y-4 pt-1">
            {/* Send guards: tools already on Toolbit, missing leads */}
            {checkingGuards && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5" role="status">
                <Spinner size={12} className="text-zinc-500" />
                Checking Toolbit listings and email history…
              </p>
            )}

            {guardCheckError && (
              <div
                className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span className="flex-1">
                  {guardCheckError} Sending is disabled until this check succeeds.
                </span>
                <button
                  type="button"
                  onClick={() => setGuardCheckNonce((n) => n + 1)}
                  className="shrink-0 font-semibold underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {existingLeads.length > 0 && (
              <div
                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs space-y-1.5"
                role="status"
              >
                <div className="flex items-start gap-2 font-medium">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    {isSingleLead
                      ? `${singleLead?.tool_name || 'This tool'} is already listed on Toolbit (skipped).`
                      : `${existingLeads.length} of ${selectedLeads.length} tools are already on Toolbit and will be skipped.`}
                  </span>
                </div>
                <ul className="max-h-24 overflow-y-auto space-y-0.5 pl-6 text-[11px]">
                  {existingLeads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{lead.tool_name}</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400">Already on Toolbit</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {missingLeads.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1" role="status">
                <AlertCircle size={12} />
                {missingLeads.length === 1
                  ? `${missingLeads[0].tool_name} no longer exists and will be skipped.`
                  : `${missingLeads.length} selected leads no longer exist and will be skipped.`}
              </p>
            )}

            {/* ── Section 1: Recipients & Inboxes ── */}
            <div className="space-y-2">
              {isSingleLead && singleLead ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Mail size={13} className="text-zinc-500" />
                      Target Email{singleLead.business_emails.length > 1 ? 's' : ''}
                    </span>
                    {singleLead.business_emails.length > 1 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSingleSelectedEmails([...singleLead.business_emails])}
                          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-zinc-300 dark:text-zinc-700">•</span>
                        <button
                          type="button"
                          onClick={() => setSingleSelectedEmails([singleLead.business_emails[0]])}
                          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium underline cursor-pointer"
                        >
                          Primary only
                        </button>
                      </div>
                    )}
                  </div>

                  {singleLead.business_emails.length === 0 ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs flex items-center gap-2">
                      <AlertCircle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>No business emails found for <strong>{singleLead.tool_name}</strong>.</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {singleLead.business_emails.map((email) => {
                        const isChecked = singleSelectedEmails.includes(email);
                        return (
                          <button
                            key={email}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                if (singleSelectedEmails.length > 1) {
                                  setSingleSelectedEmails(singleSelectedEmails.filter((e) => e !== email));
                                }
                              } else {
                                setSingleSelectedEmails([...singleSelectedEmails, email]);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                              isChecked
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-medium'
                                : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                          >
                            <div
                              className={`w-3 h-3 rounded-xs flex items-center justify-center border ${
                                isChecked
                                  ? 'border-white bg-white/20 dark:border-zinc-900 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                                  : 'border-zinc-400'
                              }`}
                            >
                              {isChecked && <Check size={9} strokeWidth={3} />}
                            </div>
                            <span>{email}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <span>Website:</span>
                    <a
                      href={singleLead.tool_site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 dark:text-zinc-300 font-medium hover:underline inline-flex items-center gap-0.5"
                    >
                      {singleLead.tool_site_url}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Users size={13} className="text-zinc-500" />
                        Target Inboxes ({targetItems.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRecipientsList(!showRecipientsList)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline cursor-pointer"
                      >
                        {showRecipientsList ? 'Hide' : 'Show'}
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
                        Primary only
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
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {leadsMissingEmailCount} of {selectedLeads.length} tools have no email on file (skipped).
                    </p>
                  )}

                  {showRecipientsList && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 p-2.5 max-h-44 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {selectedLeads.map((lead) => {
                        const emails = lead.business_emails || [];
                        const isExcluded = excludedLeadIds.has(lead.id);
                        const selectedForLead = bulkSelectedEmails[lead.id] || [];

                        if (isExcluded) {
                          return (
                            <div key={lead.id} className="py-1.5 flex items-center justify-between text-xs opacity-60">
                              <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[220px]">
                                {lead.tool_name}
                              </span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                Already on Toolbit (Skipped)
                              </span>
                            </div>
                          );
                        }

                        if (emails.length === 0) {
                          return (
                            <div key={lead.id} className="py-1.5 flex items-center justify-between text-xs opacity-70">
                              <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[220px]">
                                {lead.tool_name}
                              </span>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                No email (Skipped)
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={lead.id} className="py-2 first:pt-0.5 last:pb-0.5 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[240px]">
                                {lead.tool_name}
                              </span>
                              {emails.length > 1 && (
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectLeadPrimaryEmail(lead.id, emails[0])}
                                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                                  >
                                    Primary
                                  </button>
                                  <span className="text-zinc-300 dark:text-zinc-700">/</span>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectLeadAllEmails(lead.id, emails)}
                                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                                  >
                                    All
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Email Selection Pills with Checkbox */}
                            <div className="flex flex-wrap gap-1.5">
                              {emails.map((email) => {
                                const isChecked = selectedForLead.includes(email);
                                return (
                                  <button
                                    key={email}
                                    type="button"
                                    onClick={() => handleToggleBulkEmail(lead.id, email)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors cursor-pointer ${
                                      isChecked
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-medium'
                                        : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300'
                                    }`}
                                  >
                                    <div
                                      className={`w-3 h-3 rounded-xs flex items-center justify-center border ${
                                        isChecked
                                          ? 'border-white bg-white/20 dark:border-zinc-900 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                                          : 'border-zinc-400 dark:border-zinc-600'
                                      }`}
                                    >
                                      {isChecked && <Check size={9} strokeWidth={3} />}
                                    </div>
                                    <span className="truncate max-w-[240px]">{email}</span>
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

            {/* ── Section 2: Marketing Template ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Marketing Template
                </span>
                {selectedTemplateId && activeTemplate && (
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Selected: <strong className="text-zinc-900 dark:text-zinc-100">{activeTemplate.name}</strong>
                  </span>
                )}
              </div>

              {/* 4 Template Cards Grid */}
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
                      className={`p-2.5 rounded-xl border text-left transition-all relative flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/60 ring-1 ring-zinc-900/10 dark:ring-zinc-100/10'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0 mt-0.5">
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {tmpl.name}
                          </span>
                          {isSelected && <Check size={13} strokeWidth={2.5} className="text-zinc-900 dark:text-zinc-100 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Already contacted: skipped unless explicitly confirmed */}
            {(repliedLeads.length > 0 || repeatLeads.length > 0) && (
              <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-violet-950 dark:text-violet-200 text-xs space-y-2.5">
                {repliedLeads.length > 0 && (
                  <ContactedLeadsGroup
                    title={
                      isSingleLead
                        ? `${repliedLeads[0].tool_name} already replied, so no email will be sent unless you confirm.`
                        : `${repliedLeads.length} of ${selectedLeads.length} selected tools already replied and will be skipped unless you confirm.`
                    }
                    leads={repliedLeads}
                    reasonOf={(lead) => historyByLeadId.get(lead.id)?.replied || ''}
                    confirmLabel={`Send anyway to ${repliedLeads.length === 1 ? 'this tool' : `these ${repliedLeads.length} tools`}`}
                    checked={allowReplied}
                    onCheckedChange={setAllowReplied}
                  />
                )}
                {repeatLeads.length > 0 && activeTemplate && (
                  <ContactedLeadsGroup
                    title={
                      isSingleLead
                        ? `${repeatLeads[0].tool_name} already received "${activeTemplate.name}", so it will not be sent again unless you confirm.`
                        : `${repeatLeads.length} of ${selectedLeads.length} selected tools already received "${activeTemplate.name}" and will be skipped unless you confirm.`
                    }
                    leads={repeatLeads}
                    reasonOf={(lead) => historyByLeadId.get(lead.id)?.templateSent || ''}
                    confirmLabel={`Send "${activeTemplate.name}" again to ${repeatLeads.length === 1 ? 'this tool' : `these ${repeatLeads.length} tools`}`}
                    checked={allowRepeat}
                    onCheckedChange={setAllowRepeat}
                  />
                )}
              </div>
            )}

            {!selectedTemplateId ? (
              <div className="py-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
                Select a template above to preview and edit.
              </div>
            ) : (
              <>
                {/* ── Section 3: Subject & Customization ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Subject Line
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomizing(!isCustomizing)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 font-medium underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles size={11} />
                      {isCustomizing ? 'Close body editor' : 'Customize email body'}
                    </button>
                  </div>
                  <Input
                    value={customSubject}
                    onChange={(e) => {
                      setIsUserCustomizingBody(true);
                      setCustomSubject(e.target.value);
                    }}
                    className="h-9 text-xs"
                    placeholder="Subject line with {{tool_name}}..."
                  />

                  {/* One-Off TipTap Rich Text Customization */}
                  {isCustomizing && (
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in-50 duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-500">Custom Body (Rich Text)</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleResetCustomContent}
                          className="h-6 text-[10px] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 gap-1 px-1 cursor-pointer"
                        >
                          <RotateCcw size={10} />
                          Reset
                        </Button>
                      </div>

                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden">
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

                {/* ── Section 4: Live Preview Toggle ── */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye size={13} className="text-zinc-400" />
                      <span>Preview Email ({sampleLead?.tool_name || 'Sample'})</span>
                    </span>
                    {showPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {showPreview && (
                    <div className="p-3 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 space-y-2 animate-in fade-in-50 duration-150">
                      <div className="text-xs text-zinc-500 space-y-0.5 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                          <span className="text-zinc-400">Subject:</span>{' '}
                          <strong className="text-zinc-800 dark:text-zinc-200">{previewSubject}</strong>
                        </div>
                        <div className="text-[11px]">
                          <span className="text-zinc-400">From:</span>{' '}
                          {activeTemplate?.from_name === 'Toolbit Team' || !activeTemplate?.from_name ? 'Toolbit AI' : activeTemplate.from_name}{' '}
                          &lt;{activeTemplate?.from_email}&gt;
                        </div>
                      </div>

                      <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-3 bg-white max-h-64 overflow-y-auto text-zinc-900">
                        <div
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                          className="text-xs leading-relaxed email-preview-container [&_ul]:!list-disc [&_ul]:!pl-6 [&_ol]:!list-decimal [&_ol]:!pl-6 [&_li]:!list-item"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Dialog Footer with Action Button ── */}
        <DialogFooter className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex-col sm:flex-row gap-2 sm:justify-between items-center">
          <div className="text-xs text-zinc-400">
            {activeTemplate ? (
              <span>From <strong>{activeTemplate?.from_email}</strong> via Resend</span>
            ) : (
              <span>Select a template to send</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={sending}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              Cancel
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
                  !!guardCheckError
                }
                className="h-9 px-4 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  !selectedTemplateId
                    ? 'Please select a template first'
                    : checkingGuards
                    ? 'Checking Toolbit listings and email history…'
                    : guardCheckError
                    ? 'Could not check the selected leads'
                    : targetItems.length === 0 && excludedLeadIds.size > 0
                    ? 'All selected tools are skipped (see the notes above)'
                    : targetItems.length === 0
                    ? 'No valid recipients selected'
                    : undefined
                }
              >
                {sending ? (
                  <>
                    <Spinner size={13} className="text-white dark:text-zinc-900" />
                    Sending ({targetItems.length})...
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    Send ({targetItems.length})
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
