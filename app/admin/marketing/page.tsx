'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/contexts/AdminContext';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Send,
  FileEdit,
  Eye,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Mail,
  Plus,
  X,
  Sparkles,
  Megaphone,
  Handshake,
  Copy,
  History,
  SlidersHorizontal,
  Search,
  Check,
  Smartphone,
  Monitor,
  RotateCcw,
  Info,
  Clock,
} from 'lucide-react';
import {
  getMarketingTemplatesAction,
  updateMarketingTemplateAction,
  sendMarketingEmailAction,
  checkResendConfigAction,
  getResendEmailHistoryAction,
  getResendEmailDetailsAction,
  type MarketingTemplate,
  type SendResult,
} from './actions';
import type { ResendEmailListItem, ResendEmailDetails } from '@/lib/resend';
import { textToEmailHtml, htmlBodyToFullEmailHtml } from '@/lib/email-formatter';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarketingToolSearchSelect from '@/components/marketing/MarketingToolSearchSelect';

// ────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────────

type TabId = 'templates' | 'send' | 'history';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'templates', label: 'Templates', icon: <FileEdit size={15} /> },
  { id: 'send', label: 'Send Email', icon: <Send size={15} /> },
  { id: 'history', label: 'Resend Sent History', icon: <History size={15} /> },
];

// ────────────────────────────────────────────────────────────────────────────
// Template icon mapping
// ────────────────────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  sponsored_feature: <Megaphone size={18} />,
  new_tool_launch: <Sparkles size={18} />,
  affiliate_partnership: <Handshake size={18} />,
};

// Helper: Format a single editor line (bold and links)
function formatEditorLine(line: string): string {
  let result = line;
  // Handle Markdown links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
    '<a href="$2" target="_blank" style="color: #0d9488; text-decoration: underline; font-weight: 600;">$1</a>'
  );
  // Handle bold: **text**
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Handle raw URLs (not already inside href attribute or anchor tag)
  result = result.replace(/(?<!href=["'])(?<!>)(https?:\/\/[^\s<"'\)]+)/g, '<a href="$1" target="_blank">$1</a>');
  return result;
}

// Helper: Convert template markdown/text to clean structured HTML for TipTap editor
function convertTextToEditorHtml(text: string): string {
  if (!text) return '';
  const paras = text.trim().split(/\n\s*\n/);
  return paras
    .map((p) => {
      const lines = p.trim().split('\n');

      // Check ordered list (1. / 2.)
      if (lines.length > 0 && lines.every((l) => /^\d+[\.\)]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li>${formatEditorLine(l.replace(/^\d+[\.\)]\s+/, ''))}</li>`)
          .join('');
        return `<ol>${items}</ol>`;
      }

      // Check unordered list (- / * / •)
      if (lines.length > 0 && lines.every((l) => /^[\-\*•]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li>${formatEditorLine(l.replace(/^[\-\*•]\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      // Normal paragraph
      const formatted = lines
        .map((l) => formatEditorLine(l))
        .join('<br />');
      return `<p>${formatted}</p>`;
    })
    .join('');
}

// Helper: Robust Variable Substitution in Text & HTML
function substituteVariablesInContent(content: string, vars: Record<string, string>): string {
  if (!content) return '';
  let result = content;

  for (const [rawKey, val] of Object.entries(vars)) {
    const key = rawKey.replace(/^\{\{|\}\}$/g, '').trim();
    const value = val !== undefined && val !== null ? val : '';

    // 1. Standard {{key}} or {{ key }}
    const standardRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(standardRegex, value);

    // 2. URL-encoded %7B%7Bkey%7D%7D
    const encodedRegex = new RegExp(`%7B%7B\\s*${key}\\s*%7D%7D`, 'gi');
    result = result.replace(encodedRegex, value);

    // 3. HTML entities
    const entityRegex = new RegExp(`(&#123;|&#x7b;|&lbrace;){2}\\s*${key}\\s*(&#125;|&#x7d;|&rbrace;){2}`, 'gi');
    result = result.replace(entityRegex, value);
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────────────────────────────────────────

export default function MarketingMailPage() {
  const { hasPermission, isSuperAdmin } = useAdmin();
  const canView = isSuperAdmin || hasPermission('marketing', 'view');
  const canUpdate = isSuperAdmin || hasPermission('marketing', 'update');

  const [activeTab, setActiveTab] = useState<TabId>('templates');
  const [templates, setTemplates] = useState<Record<string, MarketingTemplate>>({});
  const [resendHistory, setResendHistory] = useState<ResendEmailListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);

  // Section Loading State for template switching inside "Send Email"
  const [sectionLoading, setSectionLoading] = useState(false);

  // Edit master template dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MarketingTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    subject: '',
    from_name: '',
    from_email: '',
    text: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Preview dialog state
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewFrom, setPreviewFrom] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Resend History details dialog
  const [historyDetailsEmail, setHistoryDetailsEmail] = useState<ResendEmailDetails | null>(null);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState(false);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [copiedResendId, setCopiedResendId] = useState<string | null>(null);

  // History filtering
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

  // Send state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [recipients, setRecipients] = useState<{ email: string; name: string }[]>([
    { email: '', name: '' },
  ]);
  const [sendVariables, setSendVariables] = useState<Record<string, string>>({});

  // TipTap Custom One-Off Email Customization State
  const [isCustomizingSend, setIsCustomizingSend] = useState(false);
  const [isUserCustomizingBody, setIsUserCustomizingBody] = useState(false);
  const [customSendSubject, setCustomSendSubject] = useState('');
  const [customSendHtml, setCustomSendHtml] = useState('');

  // Ref to prevent TipTap onUpdate feedback loops from overriding variable typing
  const isProgrammaticUpdate = useRef(false);

  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Safety: Unlock document body scroll when no dialogs are active
  useEffect(() => {
    if (!editDialogOpen && !previewDialogOpen && !historyDetailsOpen) {
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.overflow = '';
      }
    }
  }, [editDialogOpen, previewDialogOpen, historyDetailsOpen]);

  // Toast auto-dismiss
  useEffect(() => {
    if (sendSuccess) {
      const timer = setTimeout(() => setSendSuccess(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [sendSuccess]);

  // ── Auth token ──
  const [authToken, setAuthToken] = useState<string>('');

  const getAuthToken = async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    if (token && !authToken) setAuthToken(token);
    return token;
  };

  useEffect(() => {
    void (async () => {
      const token = await getAuthToken();
      if (token) setAuthToken(token);
    })();
  }, []);

  // Helper: Generate populated template HTML & Subject
  const getSubstitutedTemplateData = useCallback(
    (tmpl: MarketingTemplate, vars: Record<string, string>, recipientName?: string) => {
      const allVars: Record<string, string> = {
        ...vars,
        recipient_name: recipientName || 'there',
      };

      const toolName = (allVars.tool_name || '').trim();
      const toolSiteUrl = (allVars.tool_site_url || allVars.tool_url || '').trim();

      // For email body: If we have both tool_name and a site URL, make it a clickable anchor tag
      const bodyVars = { ...allVars };
      if (toolName && toolSiteUrl) {
        bodyVars.tool_name = `[${toolName}](${toolSiteUrl})`;
      }

      const rawText = tmpl.text;
      const substitutedText = substituteVariablesInContent(rawText, bodyVars);
      const substitutedHtml = convertTextToEditorHtml(substitutedText);

      // Subject MUST remain clean plain text (never an anchor tag or markdown link)
      const rawSubj = tmpl.subject;
      const subjectVars = { ...allVars, tool_name: toolName };
      const substitutedSubj = substituteVariablesInContent(rawSubj, subjectVars);

      return {
        html: substitutedHtml,
        subject: substitutedSubj,
      };
    },
    []
  );

  // ── Handlers for Tool Selection & Clearing from Search Dropdown ──
  const handleToolSelect = (tool: {
    name: string;
    slug: string;
    site_url: string;
    favicon_url?: string | null;
  }) => {
    const updatedVars: Record<string, string> = {
      ...sendVariables,
      tool_name: tool.name,
      tool_site_url: tool.site_url || (tool.slug ? `https://www.toolbit.ai/ai-tool/${tool.slug}` : ''),
    };

    if (selectedTemplate?.variables.some((v) => v.includes('listing_url'))) {
      updatedVars.listing_url = `https://www.toolbit.ai/ai-tool/${tool.slug}`;
    }
    if (selectedTemplate?.variables.some((v) => v.includes('tool_url'))) {
      updatedVars.tool_url = tool.site_url || `https://www.toolbit.ai/ai-tool/${tool.slug}`;
    }

    setSendVariables(updatedVars);

    // Live sync to TipTap editor & subject if user hasn't manually edited body
    if (selectedTemplate && !isUserCustomizingBody) {
      isProgrammaticUpdate.current = true;
      const firstRecipientName = recipients[0]?.name?.trim() || 'there';
      const populated = getSubstitutedTemplateData(selectedTemplate, updatedVars, firstRecipientName);
      setCustomSendSubject(populated.subject);
      setCustomSendHtml(populated.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 80);
    }
  };

  const handleClearTool = () => {
    const updatedVars: Record<string, string> = {
      ...sendVariables,
      tool_name: '',
      tool_site_url: '',
    };
    if (updatedVars.listing_url) delete updatedVars.listing_url;
    setSendVariables(updatedVars);

    if (selectedTemplate && !isUserCustomizingBody) {
      isProgrammaticUpdate.current = true;
      const firstRecipientName = recipients[0]?.name?.trim() || 'there';
      const populated = getSubstitutedTemplateData(selectedTemplate, updatedVars, firstRecipientName);
      setCustomSendSubject(populated.subject);
      setCustomSendHtml(populated.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 80);
    }
  };

  // ── Fetch templates & status (Only runs on initial load or manual refresh) ──
  const fetchData = useCallback(
    async (manual = false) => {
      if (!canView) return;
      if (manual) setIsRefreshing(true);

      try {
        const token = await getAuthToken();
        if (!token) return;
        setAuthToken(token);

        const [templatesRes, configRes, historyRes] = await Promise.all([
          getMarketingTemplatesAction(token),
          checkResendConfigAction(token),
          getResendEmailHistoryAction(token),
        ]);

        if (templatesRes.success && templatesRes.data) {
          setTemplates(templatesRes.data);
          setSelectedTemplateId((prev) => {
            if (prev && templatesRes.data![prev]) return prev;
            const firstId = Object.keys(templatesRes.data!)[0];
            if (firstId) {
              const tmpl = templatesRes.data![firstId];
              isProgrammaticUpdate.current = true;
              const initialData = getSubstitutedTemplateData(tmpl, {}, 'there');
              setCustomSendSubject(initialData.subject);
              setCustomSendHtml(initialData.html);
              setTimeout(() => {
                isProgrammaticUpdate.current = false;
              }, 100);
              return firstId;
            }
            return '';
          });
        }

        if (configRes.success && configRes.data) {
          setResendConfigured(configRes.data.configured);
        }

        if (historyRes.success && historyRes.data) {
          setResendHistory(historyRes.data);
        }
      } catch (err) {
        console.error('fetchData error:', err);
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [canView, getSubstitutedTemplateData]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Selected template helper
  const selectedTemplate = useMemo(() => {
    return templates[selectedTemplateId] || null;
  }, [templates, selectedTemplateId]);

  // When switching templates (Inline section loading ONLY, never full page reload)
  const handleSelectTemplate = (id: string) => {
    if (id === selectedTemplateId) return;
    setSectionLoading(true);
    setSelectedTemplateId(id);
    setIsUserCustomizingBody(false);
    setSendVariables({});

    const tmpl = templates[id];
    if (tmpl) {
      isProgrammaticUpdate.current = true;
      const firstRecipientName = recipients.find((r) => r.name.trim())?.name?.trim() || 'there';
      const initialData = getSubstitutedTemplateData(tmpl, {}, firstRecipientName);
      setCustomSendSubject(initialData.subject);
      setCustomSendHtml(initialData.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 100);
    }
    setTimeout(() => {
      setSectionLoading(false);
    }, 180);
  };

  // Handle Campaign Variable change with immediate real-time sync into editor
  const handleVariableChange = (cleanKey: string, value: string) => {
    const updatedVars = {
      ...sendVariables,
      [cleanKey]: value,
    };
    setSendVariables(updatedVars);

    // If user hasn't explicitly overwritten text with custom edits, sync into editor
    if (selectedTemplate && !isUserCustomizingBody) {
      isProgrammaticUpdate.current = true;
      const firstRecipientName = recipients.find((r) => r.name.trim())?.name?.trim() || 'there';
      const populated = getSubstitutedTemplateData(selectedTemplate, updatedVars, firstRecipientName);
      setCustomSendSubject(populated.subject);
      setCustomSendHtml(populated.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 80);
    }
  };

  // Toggle TipTap one-off customization
  const toggleCustomizingSend = () => {
    if (!isCustomizingSend && selectedTemplate) {
      if (!isUserCustomizingBody) {
        isProgrammaticUpdate.current = true;
        const firstRecipientName = recipients.find((r) => r.name.trim())?.name?.trim() || 'there';
        const populated = getSubstitutedTemplateData(selectedTemplate, sendVariables, firstRecipientName);
        setCustomSendSubject(populated.subject);
        setCustomSendHtml(populated.html);
        setTimeout(() => {
          isProgrammaticUpdate.current = false;
        }, 80);
      }
      setIsCustomizingSend(true);
    } else {
      setIsCustomizingSend(false);
    }
  };

  // Reset custom text to template default with current variables substituted
  const handleResetCustomSend = () => {
    if (selectedTemplate) {
      setIsUserCustomizingBody(false);
      isProgrammaticUpdate.current = true;
      const firstRecipientName = recipients.find((r) => r.name.trim())?.name?.trim() || 'there';
      const populated = getSubstitutedTemplateData(selectedTemplate, sendVariables, firstRecipientName);
      setCustomSendSubject(populated.subject);
      setCustomSendHtml(populated.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 80);
    }
  };

  // ── Open Edit Master Template Dialog ──
  const openEditDialog = (template: MarketingTemplate) => {
    setEditingTemplate(template);
    setEditForm({
      subject: template.subject,
      from_name: template.from_name,
      from_email: template.from_email,
      text: template.text,
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  // ── Save Master Template ──
  const handleSaveTemplate = async () => {
    if (!editingTemplate || !canUpdate) return;
    setEditSaving(true);
    setEditError(null);

    try {
      const token = await getAuthToken();
      const generatedHtml = textToEmailHtml(editForm.text);

      const res = await updateMarketingTemplateAction(token, editingTemplate.id, {
        subject: editForm.subject.trim(),
        from_name: editForm.from_name.trim(),
        from_email: editForm.from_email.trim(),
        text: editForm.text,
        html: generatedHtml,
      });

      if (!res.success) {
        setEditError(res.error || 'Failed to update template.');
        return;
      }

      setEditDialogOpen(false);
      await fetchData(true);
    } catch (err: any) {
      setEditError(err?.message || 'An unexpected error occurred.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Open Preview Master Template Dialog ──
  const openPreviewDialog = (template: MarketingTemplate) => {
    const html =
      template.html && template.html.trim().length > 0
        ? template.html
        : textToEmailHtml(template.text);
    setPreviewHtml(html);
    setPreviewSubject(template.subject);
    setPreviewFrom(`${template.from_name} <${template.from_email}>`);
    setPreviewDialogOpen(true);
  };

  // ── Live Send Preview (reflecting variable inputs & TipTap editor changes) ──
  const openLiveSendPreview = () => {
    if (!selectedTemplate) return;
    const firstRecipient = recipients.find((r) => r.email.trim() || r.name.trim());
    const firstRecipientName = firstRecipient?.name?.trim() || 'there';

    const allVars: Record<string, string> = {
      ...sendVariables,
      recipient_name: firstRecipientName,
    };

    let baseHtml = '';
    if (isCustomizingSend && customSendHtml.trim()) {
      baseHtml = htmlBodyToFullEmailHtml(customSendHtml.trim());
    } else {
      baseHtml =
        selectedTemplate.html && selectedTemplate.html.trim().length > 0
          ? selectedTemplate.html
          : textToEmailHtml(selectedTemplate.text);
    }

    let baseSubj =
      isCustomizingSend && customSendSubject.trim()
        ? customSendSubject.trim()
        : selectedTemplate.subject;

    const toolName = (allVars.tool_name || '').trim();
    const toolSiteUrl = (allVars.tool_site_url || allVars.tool_url || '').trim();

    const bodyVars = { ...allVars };
    if (toolName && toolSiteUrl && !bodyVars.tool_name.includes('<a ')) {
      bodyVars.tool_name = `<a href="${toolSiteUrl}" target="_blank" style="color: #0d9488; text-decoration: underline; font-weight: 600;">${toolName}</a>`;
    }

    // Apply robust substitution for all variable types
    const finalHtml = substituteVariablesInContent(baseHtml, bodyVars);
    const finalSubj = substituteVariablesInContent(baseSubj, { ...allVars, tool_name: toolName });

    setPreviewHtml(finalHtml);
    setPreviewSubject(finalSubj);
    setPreviewFrom(`${selectedTemplate.from_name} <${selectedTemplate.from_email}>`);
    setPreviewDialogOpen(true);
  };

  // ── Fetch Resend Email Details ──
  const handleViewResendDetails = async (emailId: string) => {
    setLoadingDetailsId(emailId);
    try {
      const token = await getAuthToken();
      const res = await getResendEmailDetailsAction(token, emailId);
      if (res.success && res.data) {
        setHistoryDetailsEmail(res.data);
        setHistoryDetailsOpen(true);
      }
    } catch (err) {
      console.error('handleViewResendDetails error:', err);
    } finally {
      setLoadingDetailsId(null);
    }
  };

  // ── Recipients Manager ──
  const handleAddRecipient = () => {
    if (recipients.length >= 50) return;
    setRecipients([...recipients, { email: '', name: '' }]);
  };

  const handleRemoveRecipient = (index: number) => {
    if (recipients.length <= 1) {
      setRecipients([{ email: '', name: '' }]);
      return;
    }
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const handleRecipientChange = (index: number, field: 'email' | 'name', value: string) => {
    const updated = [...recipients];
    updated[index][field] = value;
    setRecipients(updated);

    // If first recipient name changes and body is not manually modified, sync
    if (index === 0 && field === 'name' && selectedTemplate && !isUserCustomizingBody) {
      isProgrammaticUpdate.current = true;
      const populated = getSubstitutedTemplateData(selectedTemplate, sendVariables, value.trim() || 'there');
      setCustomSendSubject(populated.subject);
      setCustomSendHtml(populated.html);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 80);
    }
  };

  const handlePasteRecipients = (text: string) => {
    const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const parsed: { email: string; name: string }[] = [];

    for (const line of lines) {
      const angleMatch = line.match(/^([^<]*)<([^>]+)>$/);
      if (angleMatch) {
        parsed.push({ name: angleMatch[1].trim(), email: angleMatch[2].trim() });
      } else if (line.includes('@')) {
        parsed.push({ name: '', email: line.trim() });
      }
    }

    if (parsed.length > 0) {
      setRecipients((prev) => {
        const combined = [...prev.filter((r) => r.email.trim()), ...parsed];
        return combined.slice(0, 50);
      });
    }
  };

  // ── Send Marketing Mail ──
  const handleSendEmail = async () => {
    if (!selectedTemplate || !canUpdate) return;
    setSendError(null);
    setSendSuccess(null);
    setSendResults(null);

    const validRecipients = recipients.filter((r) => r.email.trim().length > 0);
    if (validRecipients.length === 0) {
      setSendError('Please provide at least one valid recipient email address.');
      return;
    }

    setSending(true);

    try {
      const token = await getAuthToken();
      const res = await sendMarketingEmailAction(token, {
        templateId: selectedTemplate.id,
        recipients: validRecipients.map((r) => ({
          email: r.email.trim(),
          name: r.name.trim() || undefined,
        })),
        variables: sendVariables,
        customSubject:
          isCustomizingSend && customSendSubject.trim() ? customSendSubject.trim() : undefined,
        customHtml:
          isCustomizingSend && customSendHtml.trim() ? customSendHtml.trim() : undefined,
      });

      if (!res.success) {
        setSendError(res.error || 'Failed to send marketing emails.');
        if (res.results) setSendResults(res.results);
        return;
      }

      setSendResults(res.results || null);
      const count = validRecipients.length;
      setSendSuccess(
        `Successfully sent ${count} ${count === 1 ? 'email' : 'emails'} via Resend!`
      );

      // Reset form
      setRecipients([{ email: '', name: '' }]);
      setSendVariables({});
      setIsCustomizingSend(false);
      setIsUserCustomizingBody(false);

      // Refresh Resend history in background
      fetchData(true);
    } catch (err: any) {
      setSendError(err?.message || 'An unexpected error occurred during send.');
    } finally {
      setSending(false);
    }
  };

  // ── Filtered Resend History ──
  const filteredResendHistory = useMemo(() => {
    return resendHistory.filter((item) => {
      const toStr = item.to.join(' ').toLowerCase();
      const matchesSearch =
        !historySearch ||
        toStr.includes(historySearch.toLowerCase()) ||
        item.subject.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.from.toLowerCase().includes(historySearch.toLowerCase());

      const matchesStatus =
        historyStatusFilter === 'all' || item.last_event === historyStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [resendHistory, historySearch, historyStatusFilter]);

  // History stats
  const historyStats = useMemo(() => {
    const total = resendHistory.length;
    const delivered = resendHistory.filter(
      (h) => h.last_event === 'delivered' || h.last_event === 'opened' || h.last_event === 'clicked'
    ).length;
    const bounced = resendHistory.filter(
      (h) => h.last_event === 'bounced' || h.last_event === 'complained'
    ).length;
    return { total, delivered, bounced };
  }, [resendHistory]);

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedResendId(id);
    setTimeout(() => setCopiedResendId(null), 2000);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Permission Guard
  // ──────────────────────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Access Denied</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
          You do not have permission to view or manage marketing emails. Contact a Super Admin to request access.
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Initial Page Loading (Only on first mount)
  // ──────────────────────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner size={36} className="text-zinc-900 dark:text-zinc-100" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading marketing workspace...</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main Render (Fluid, naturally scrollable page)
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-32">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-xs">
              <Mail size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Marketing Mail
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Outreach campaigns, featured sponsorships, and partnership outreach powered by Resend
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {resendConfigured !== null && (
            <Badge
              variant={resendConfigured ? 'default' : 'secondary'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                resendConfigured
                  ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 border-zinc-800 dark:border-zinc-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  resendConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {resendConfigured ? 'Resend Connected' : 'Resend Key Missing'}
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="h-9 gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Global Alert if Resend is missing ── */}
      {resendConfigured === false && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-300">
          <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-semibold">Resend API Key Not Configured</p>
            <p className="text-amber-700 dark:text-amber-400">
              Emails cannot be sent until <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 font-mono">RESEND_API_KEY</code> is added to your environment variables (<code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 font-mono">.env.local</code>).
            </p>
          </div>
        </div>
      )}

      {/* ── Notification Banners ── */}
      {sendSuccess && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold">{sendSuccess}</span>
          </div>
          <button
            onClick={() => setSendSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {sendError && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="text-xs font-semibold">{sendError}</span>
          </div>
          <button
            onClick={() => setSendError(null)}
            className="text-rose-600 hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Top Tabs Navigation ── */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-fit">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'history' && resendHistory.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 px-1.5 py-0 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  {resendHistory.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: TEMPLATES */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Active Marketing Templates ({Object.keys(templates).length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(templates).map((template) => {
              const icon = TEMPLATE_ICONS[template.id] || <Mail size={18} />;

              return (
                <Card
                  key={template.id}
                  className="flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 shadow-xs">
                        {icon}
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                        {template.id.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                        {template.name}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200 font-medium truncate">
                        <span className="text-zinc-400 text-[11px]">Subject:</span>
                        <span className="truncate">{template.subject}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-[11px]">
                        <span>From:</span>
                        <span className="truncate">
                          {template.from_name} &lt;{template.from_email}&gt;
                        </span>
                      </div>
                    </div>

                    {template.variables && template.variables.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] text-zinc-400 uppercase font-semibold">Variables:</span>
                        {template.variables.map((v) => (
                          <Badge
                            key={v}
                            variant="secondary"
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                          >
                            {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreviewDialog(template)}
                      className="flex-1 h-8 text-xs gap-1.5"
                    >
                      <Eye size={13} />
                      Preview
                    </Button>
                    {canUpdate && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openEditDialog(template)}
                        className="flex-1 h-8 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold"
                      >
                        <FileEdit size={13} />
                        Edit Master
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SEND MARKETING EMAIL (Original 2-Column Design, Live Variables Sync) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'send' && (
        <div className="space-y-6">
          {/* Step 1: Select Template */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[10px] flex items-center justify-center font-bold">
                  1
                </span>
                Select Template
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.values(templates).map((template) => {
                const isSelected = selectedTemplateId === template.id;
                const icon = TEMPLATE_ICONS[template.id] || <Mail size={18} />;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/60 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {icon}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {template.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 line-clamp-1">
                            {template.subject}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center shrink-0">
                          <Check size={12} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Loading Skeleton when switching templates */}
          {sectionLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
              <div className="lg:col-span-7 space-y-6">
                <Card className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Spinner size={14} className="text-zinc-900 dark:text-zinc-100" />
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        Loading template configuration...
                      </span>
                    </div>
                    <Skeleton className="h-4 w-28 rounded" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24 rounded" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24 rounded" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                  </div>
                </Card>
                <Card className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <Skeleton className="h-5 w-52 rounded" />
                  <Skeleton className="h-36 w-full rounded-xl" />
                </Card>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <Card className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </Card>
              </div>
            </div>
          )}

          {/* Step 2 & 3: Original 2-Column Grid (Loaded Section) */}
          {!sectionLoading && selectedTemplate && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in-50 duration-200">
              {/* Left Column: Form Details & TipTap Editor */}
              <div className="lg:col-span-7 space-y-6">
                {/* 2. Campaign Variables Card */}
                <Card className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[10px] flex items-center justify-center font-bold">
                        2
                      </span>
                      Campaign Variables
                    </label>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Live sync with customize & preview
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedTemplate.variables
                      .filter((v) => v !== '{{recipient_name}}' && v !== '{{recipient_email}}')
                      .map((rawVar) => {
                        const cleanKey = rawVar.replace(/[{}]/g, '');
                        const label = cleanKey
                          .split('_')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ');

                        if (cleanKey === 'tool_name' && selectedTemplate.id !== 'new_tool_launch') {
                          return (
                            <div key={cleanKey} className="sm:col-span-2">
                              <MarketingToolSearchSelect
                                token={authToken}
                                value={sendVariables['tool_name'] || ''}
                                siteUrl={sendVariables['tool_site_url'] || ''}
                                onSelectTool={(tool) => {
                                  handleToolSelect(tool);
                                }}
                                onChangeToolName={(name) => {
                                  handleVariableChange('tool_name', name);
                                }}
                                onChangeSiteUrl={(url) => {
                                  handleVariableChange('tool_site_url', url);
                                }}
                                onClear={() => {
                                  handleClearTool();
                                }}
                              />
                            </div>
                          );
                        }

                        return (
                          <div key={cleanKey} className="space-y-1.5">
                            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                              <span>{label}</span>
                              <code className="text-[10px] text-zinc-500 font-mono">
                                {rawVar}
                              </code>
                            </label>
                            <Input
                              placeholder={`Enter ${label.toLowerCase()}...`}
                              value={sendVariables[cleanKey] || ''}
                              onChange={(e) => handleVariableChange(cleanKey, e.target.value)}
                              className="h-9 text-xs"
                            />
                          </div>
                        );
                      })}
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    <span>
                      <strong>Recipient Name Fallback:</strong> If a recipient's name is left blank, it automatically addresses them as <em>"Hi there,"</em>.
                    </span>
                  </div>
                </Card>

                {/* TipTap Customization Card for One-Off Sends */}
                <Card className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <SlidersHorizontal size={14} className="text-zinc-900 dark:text-zinc-100" />
                        Customize Email for This Send (One-Off)
                      </h3>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Tweak the subject or message via rich text editor without altering the master template in Supabase.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={isCustomizingSend ? 'default' : 'outline'}
                      size="sm"
                      onClick={toggleCustomizingSend}
                      className={`h-8 text-xs gap-1.5 cursor-pointer ${
                        isCustomizingSend
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {isCustomizingSend ? 'Customizing Active' : 'Customize Email'}
                    </Button>
                  </div>

                  {isCustomizingSend && (
                    <div className="space-y-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in-50 duration-200">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <Sparkles size={12} />
                          Customized Content (Affects this send only)
                        </span>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={openLiveSendPreview}
                            className="h-7 text-[11px] text-zinc-800 dark:text-zinc-200 gap-1.5 cursor-pointer font-medium"
                          >
                            <Eye size={12} />
                            Preview Custom Email
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleResetCustomSend}
                            className="h-7 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 gap-1 cursor-pointer"
                          >
                            <RotateCcw size={11} />
                            Reset to Default
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Custom Subject
                        </label>
                        <Input
                          value={customSendSubject}
                          onChange={(e) => {
                            setIsUserCustomizingBody(true);
                            setCustomSendSubject(e.target.value);
                          }}
                          className="h-9 text-xs"
                          placeholder="Custom subject line..."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Custom Email Body (TipTap Rich Text Editor)
                          </label>
                        </div>
                        
                        {/* TipTap RichTextEditor Component with Raw HTML Mode */}
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                          <RichTextEditor
                            content={customSendHtml}
                            outputFormat="html"
                            onChange={(html) => {
                              if (isProgrammaticUpdate.current) return;
                              setIsUserCustomizingBody(true);
                              setCustomSendHtml(html);
                            }}
                            placeholder="Type or format your custom email message..."
                          />
                        </div>

                        {/* Quick Variable Insert helper */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-2">
                          <span className="text-[11px] text-zinc-400 font-semibold">Insert Variable:</span>
                          {selectedTemplate.variables.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                setIsUserCustomizingBody(true);
                                setCustomSendHtml((prev) => `${prev} <strong>${v}</strong> `);
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                            >
                              + {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Right Column: 3. Recipients & Send Email Action Button (Original Layout) */}
              <div className="lg:col-span-5 lg:sticky lg:top-24 self-start space-y-6">
                <Card className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[10px] flex items-center justify-center font-bold">
                        3
                      </span>
                      Recipients ({recipients.filter((r) => r.email.trim()).length}/50)
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAddRecipient}
                      disabled={recipients.length >= 50}
                      className="h-7 text-xs text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1 px-2 cursor-pointer"
                    >
                      <Plus size={13} />
                      Add Row
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {recipients.map((recipient, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="name@company.com"
                          type="email"
                          value={recipient.email}
                          onChange={(e) => handleRecipientChange(idx, 'email', e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                        <Input
                          placeholder="Name (optional)"
                          value={recipient.name}
                          onChange={(e) => handleRecipientChange(idx, 'name', e.target.value)}
                          className="h-8 text-xs w-28 shrink-0"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRecipient(idx)}
                          className="h-8 w-8 text-zinc-400 hover:text-rose-500 shrink-0 cursor-pointer"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Bulk Paste Helper */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <details className="text-xs text-zinc-500 group">
                      <summary className="cursor-pointer font-medium hover:text-zinc-700 dark:hover:text-zinc-300 select-none flex items-center gap-1">
                        <span>Bulk Paste Emails / Names</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        <Textarea
                          placeholder="Paste comma/newline separated emails or 'Name <email@domain.com>'..."
                          rows={3}
                          className="text-xs font-mono"
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              handlePasteRecipients(e.target.value);
                              e.target.value = '';
                            }
                          }}
                        />
                        <p className="text-[10px] text-zinc-400">
                          Paste list and click outside to automatically parse up to 50 recipients.
                        </p>
                      </div>
                    </details>
                  </div>

                  {/* Send Action Buttons within the Recipients Card */}
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2">
                      {/* Only show Preview in Recipients section when NOT in custom mode */}
                      {!isCustomizingSend && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openLiveSendPreview}
                          className="flex-1 h-10 text-xs gap-1.5 cursor-pointer"
                        >
                          <Eye size={14} />
                          Preview Email
                        </Button>
                      )}

                      <Button
                        type="button"
                        onClick={handleSendEmail}
                        disabled={
                          sending ||
                          !resendConfigured ||
                          recipients.filter((r) => r.email.trim()).length === 0
                        }
                        className={`${
                          isCustomizingSend ? 'w-full' : 'flex-1'
                        } h-10 text-xs gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold shadow-xs cursor-pointer`}
                      >
                        {sending ? (
                          <>
                            <Spinner size={14} className="text-white dark:text-zinc-900" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            Send Now ({recipients.filter((r) => r.email.trim()).length})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Send Results Report */}
                {sendResults && (
                  <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs shadow-xs">
                    <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                      <span>Batch Results</span>
                      <span className="text-[11px] text-zinc-400">
                        {sendResults.filter((r) => r.success).length} / {sendResults.length} Success
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {sendResults.map((res, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg flex items-center justify-between border ${
                            res.success
                              ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300'
                              : 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300'
                          }`}
                        >
                          <span className="font-medium truncate max-w-[200px]">{res.email}</span>
                          <span className="text-[11px]">
                            {res.success ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={13} /> Sent
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title={res.error}>
                                <AlertCircle size={13} /> {res.error || 'Failed'}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: RESEND SENT HISTORY (Live via Resend REST API) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Total Resend Dispatches</p>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {historyStats.total}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
                <Mail size={20} />
              </div>
            </Card>

            <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Delivered / Opened</p>
                <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {historyStats.delivered}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <CheckCircle2 size={20} />
              </div>
            </Card>

            <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Bounces / Issues</p>
                <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                  {historyStats.bounced}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20">
                <AlertCircle size={20} />
              </div>
            </Card>
          </div>

          {/* Filters & Actions Bar with Shadcn Select */}
          <Card className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder="Search by recipient email or subject..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Shadcn Select Dropdown */}
              <div className="w-[180px]">
                <Select
                  value={historyStatusFilter}
                  onChange={(val) => setHistoryStatusFilter(val)}
                  className="h-9 text-xs"
                >
                  <SelectItem value="all">All Delivery Events</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="clicked">Clicked</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="h-9 text-xs gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              Sync Resend Logs
            </Button>
          </Card>

          {/* History Table */}
          <Card className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
            {filteredResendHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400">
                <Mail size={36} className="mb-2 opacity-40 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No sent emails found in Resend</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Emails sent via the Marketing Mail tool will show up here live from the Resend API.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Sender</th>
                      <th className="py-3 px-4">Live Status</th>
                      <th className="py-3 px-4">Sent At</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {filteredResendHistory.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.to.join(', ')}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            ID: {item.id.slice(0, 13)}...
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                            {item.subject}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-zinc-500 truncate max-w-[180px]">
                          {item.from}
                        </td>

                        <td className="py-3 px-4">
                          {item.last_event === 'delivered' || item.last_event === 'opened' || item.last_event === 'clicked' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 capitalize">
                              <CheckCircle2 size={11} /> {item.last_event}
                            </span>
                          ) : item.last_event === 'bounced' || item.last_event === 'complained' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 capitalize">
                              <AlertCircle size={11} /> {item.last_event}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 capitalize">
                              <Clock size={11} /> {item.last_event || 'sent'}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                          {new Date(item.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={loadingDetailsId === item.id}
                            onClick={() => handleViewResendDetails(item.id)}
                            className="h-7 text-xs text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium gap-1 cursor-pointer"
                          >
                            {loadingDetailsId === item.id ? (
                              <Spinner size={12} className="text-zinc-900 dark:text-zinc-100" />
                            ) : (
                              'View Email'
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: EDIT MASTER TEMPLATE */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
                <FileEdit size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Edit Template: {editingTemplate?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Update the master template in Supabase. Plain text is automatically styled into responsive HTML.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{editError}</span>
              </div>
            )}

            {/* From Name & From Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  From Name
                </label>
                <Input
                  value={editForm.from_name}
                  onChange={(e) => setEditForm({ ...editForm, from_name: e.target.value })}
                  placeholder="e.g. Toolbit Team"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  From Email (Must match verified Resend domain)
                </label>
                <Input
                  value={editForm.from_email}
                  onChange={(e) => setEditForm({ ...editForm, from_email: e.target.value })}
                  placeholder="e.g. team@mail.toolbit.ai"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Subject Line
              </label>
              <Input
                value={editForm.subject}
                onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                placeholder="Subject line with {{tool_name}} variables..."
                className="h-9 text-xs"
              />
            </div>

            {/* Template Body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Template Content (Markdown & Plain Text)
                </label>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span>{editForm.text.length} characters</span>
                  <span>&middot;</span>
                  <span>{editForm.text.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </div>

              <Textarea
                value={editForm.text}
                onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                rows={12}
                className="font-mono text-xs leading-relaxed"
                placeholder="Type template body..."
              />

              <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">Insert Variable (Bold):</span>
                {editingTemplate?.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const boldTag = v === '{{recipient_name}}' ? v : `**${v}**`;
                      setEditForm({ ...editForm, text: editForm.text + ` ${boldTag} ` });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    + {v === '{{recipient_name}}' ? v : `**${v}**`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 px-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialogOpen(false)}
              disabled={editSaving}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              onClick={handleSaveTemplate}
              disabled={editSaving}
              className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold gap-2 cursor-pointer"
            >
              {editSaving ? (
                <>
                  <Spinner size={14} className="text-white dark:text-zinc-900" />
                  Saving Template...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: PREVIEW EMAIL (Sleek Desktop & Mobile View) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="p-5 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Eye size={16} className="text-zinc-900 dark:text-zinc-100" />
                Email Preview
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 truncate max-w-md">
                {previewSubject}
              </DialogDescription>
            </div>

            {/* Device Switcher */}
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  previewDevice === 'desktop'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Monitor size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  previewDevice === 'mobile'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Smartphone size={14} />
              </button>
            </div>
          </DialogHeader>

          {/* Email Metadata Envelope Bar */}
          <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <span className="text-zinc-400 w-12 shrink-0">From:</span>
              <span className="font-medium truncate">{previewFrom || 'Toolbit Team <team@mail.toolbit.ai>'}</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <span className="text-zinc-400 w-12 shrink-0">Subject:</span>
              <span className="font-semibold truncate">{previewSubject}</span>
            </div>
          </div>

          {/* Rendered HTML Container (Always crisp white card canvas in light & dark mode) */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#f4f4f5] dark:bg-zinc-950 flex items-center justify-center">
            <div
              className={`transition-all duration-200 w-full ${
                previewDevice === 'mobile' ? 'max-w-[380px]' : 'max-w-[620px]'
              }`}
            >
              <div
                className="bg-white text-zinc-900 rounded-xl shadow-md border border-zinc-200 overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          <DialogFooter className="p-4 px-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewDialogOpen(false)}
              className="text-xs ml-auto cursor-pointer"
            >
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: RESEND LIVE EMAIL DETAILS (Clean Typography & Dark Mode Fix) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={historyDetailsOpen} onOpenChange={setHistoryDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="p-5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
                <Mail size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Resend Email Details
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  Live data fetched directly from Resend REST API
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {historyDetailsEmail && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Top info 4-col grid with slight space below field title */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                    Recipient (To)
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 break-all text-xs">
                    {historyDetailsEmail.to.join(', ')}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                    Sender (From)
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 break-all text-xs">
                    {historyDetailsEmail.from}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                    Dispatched At
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 text-xs">
                    {new Date(historyDetailsEmail.created_at).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                    Live Event Status
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 capitalize">
                    {historyDetailsEmail.last_event}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                  Subject
                </span>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 font-medium text-zinc-900 dark:text-zinc-100">
                  {historyDetailsEmail.subject}
                </div>
              </div>

              {/* Resend Email ID */}
              <div className="space-y-1.5">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                  Resend Email ID
                </span>
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 font-mono text-[11px]">
                  <span className="truncate">{historyDetailsEmail.id}</span>
                  <button
                    onClick={() => copyToClipboard(historyDetailsEmail.id, 'resend-id')}
                    className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ml-2 shrink-0 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    {copiedResendId === 'resend-id' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* HTML Body Preview (Clean Light Canvas in Dark Mode) */}
              {historyDetailsEmail.html && (
                <div className="space-y-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold tracking-wider mb-2">
                    HTML Body Preview
                  </span>
                  <div className="p-4 rounded-xl bg-white text-zinc-900 border border-zinc-200 shadow-xs max-h-80 overflow-y-auto">
                    <div
                      className="bg-white text-zinc-900 selection:bg-zinc-200"
                      dangerouslySetInnerHTML={{ __html: historyDetailsEmail.html }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="p-4 px-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryDetailsOpen(false)}
              className="text-xs ml-auto cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
