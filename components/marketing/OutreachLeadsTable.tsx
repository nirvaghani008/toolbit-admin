'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import Pagination from '@/components/common/Pagination';
import StatusChangeControl from '@/components/common/StatusChangeControl';
import {
  Search,
  RefreshCw,
  Mail,
  ExternalLink,
  Users,
  CheckCircle2,
  Clock,
  Send,
  X,
  CheckSquare,
  Square,
  Link as LinkIcon,
  MessageSquare,
  MessageSquareText,
  Plus,
  Edit2,
  Sparkles,
} from 'lucide-react';
import {
  getMarketingOutreachLeadsAction,
  updateOutreachLeadStatusAction,
  updateOutreachLeadEmailStatusAction,
  type MarketingOutreachLead,
  type OutreachLeadsStats,
  type MarketingTemplate,
} from '@/app/admin/marketing/actions';
import {
  type BusinessEmailsMap,
  type EmailDeliverabilityStatus,
} from '@/lib/marketing/business-emails';
import { formatRelativeTime } from '@/lib/marketing/conversation';
import {
  LEAD_STATUS_OPTIONS as STATUS_OPTIONS,
  formatLeadStatus as formatStatus,
  getLeadAutomationHint as getAutomationHint,
  getLeadStatusDotColor as getStatusDotColor,
  getLeadStatusVariant as getStatusVariant,
} from '@/lib/marketing/lead-status';
import { LinkedinIcon, TwitterIcon } from './SocialIcons';
import SendLeadEmailModal from './SendLeadEmailModal';
import LeadConversationDialog from './LeadConversationDialog';
import LeadDetailsDialog from './LeadDetailsDialog';
import ManageLeadEmailsModal from './ManageLeadEmailsModal';
import EmailDeliverabilityBadge from './EmailDeliverabilityBadge';

/** Clicks on these (or inside them) keep their own behavior and never open the details dialog. */
const ROW_CLICK_IGNORE_SELECTOR = 'a, button, input, select, textarea, label, [data-no-row-click]';

interface OutreachLeadsTableProps {
  token: string;
  templates: Record<string, MarketingTemplate>;
  onEmailSentSuccess?: () => void;
}

export default function OutreachLeadsTable({
  token,
  templates,
  onEmailSentSuccess,
}: OutreachLeadsTableProps) {
  // Leads data state
  const [leads, setLeads] = useState<MarketingOutreachLead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<OutreachLeadsStats>({
    total: 0,
    withEmails: 0,
    pending: 0,
    emailed: 0,
    replied: 0,
  });

  // Query & Filter states
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [hasRepliesOnly, setHasRepliesOnly] = useState(false);
  const [isToolSubmissionOnly, setIsToolSubmissionOnly] = useState(false);

  // Conversation dialog (history is written by the Resend webhook)
  const [conversationLead, setConversationLead] = useState<MarketingOutreachLead | null>(null);

  // Details dialog: store the id and read the row from `leads`, so refreshes keep it current
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // Table card DOM reference for smooth scrolling on page change
  const tableCardRef = useRef<HTMLDivElement>(null);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Selection state (lead IDs)
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Modal State
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [leadsForModal, setLeadsForModal] = useState<MarketingOutreachLead[]>([]);

  // Email management modal
  const [managingEmailsLead, setManagingEmailsLead] = useState<MarketingOutreachLead | null>(null);

  // Toast / notification
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch leads
  const fetchLeads = useCallback(
    async (isManualRefresh = false) => {
      if (!token) return;
      if (isManualRefresh) setIsRefreshing(true);
      else setLoading(true);

      try {
        const res = await getMarketingOutreachLeadsAction(token, {
          page,
          pageSize,
          search: debouncedSearch,
          status: statusFilter,
          source: sourceFilter,
          hasEmailOnly,
          hasRepliesOnly,
          isToolSubmissionOnly,
        });

        if (res.success && res.data) {
          setLeads(res.data.leads);
          setTotalCount(res.data.totalCount);
          setStats(res.data.stats);
        }
      } catch (err) {
        console.error('Failed to load leads:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [token, page, pageSize, debouncedSearch, statusFilter, sourceFilter, hasEmailOnly, hasRepliesOnly, isToolSubmissionOnly]
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Manual status override (always allowed in any direction; webhook automation only moves forward)
  const handleStatusChange = async (itemId: number | string, newStatus: string) => {
    try {
      const res = await updateOutreachLeadStatusAction(token, String(itemId), newStatus);
      if (res.success) {
        setLeads((prev) =>
          prev.map((l) => (l.id === itemId ? { ...l, status: newStatus } : l))
        );
        setActionSuccess(`Updated lead status to "${newStatus}".`);
        fetchLeads(true);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Selection helpers
  const allPageIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const isAllPageSelected =
    leads.length > 0 && allPageIds.every((id) => selectedLeadIds.has(id));
  const isSomePageSelected =
    leads.length > 0 &&
    allPageIds.some((id) => selectedLeadIds.has(id)) &&
    !isAllPageSelected;

  const toggleSelectAllPage = () => {
    const updated = new Set(selectedLeadIds);
    if (isAllPageSelected) {
      for (const id of allPageIds) updated.delete(id);
    } else {
      for (const id of allPageIds) updated.add(id);
    }
    setSelectedLeadIds(updated);
  };

  const toggleSelectLead = (id: string) => {
    const updated = new Set(selectedLeadIds);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setSelectedLeadIds(updated);
  };

  const clearSelection = () => {
    setSelectedLeadIds(new Set());
  };

  // Open modal for single tool
  const handleOpenSingleSend = (lead: MarketingOutreachLead) => {
    setLeadsForModal([lead]);
    setSendModalOpen(true);
  };

  // Open modal for multiple selected tools
  const handleOpenBulkSend = () => {
    const selected = leads.filter((l) => selectedLeadIds.has(l.id));
    if (selected.length === 0) return;
    setLeadsForModal(selected);
    setSendModalOpen(true);
  };

  // Success handler from modal
  const handleSendSuccess = (sentCount: number) => {
    setActionSuccess(`Successfully dispatched ${sentCount} ${sentCount === 1 ? 'outreach email' : 'outreach emails'}!`);
    clearSelection();
    if (onEmailSentSuccess) onEmailSentSuccess();
    fetchLeads(true);
  };

  // Follow-up from the conversation dialog reuses the existing send modal
  const handleSendFollowUp = (lead: MarketingOutreachLead) => {
    setConversationLead(null);
    handleOpenSingleSend(lead);
  };

  // Handler when emails are updated (added, edited, deleted) for a lead
  const handleEmailsUpdated = (leadId: string, updatedEmails: BusinessEmailsMap) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          const wasEmpty = Object.keys(l.business_emails || {}).length === 0;
          const isNowEmpty = Object.keys(updatedEmails || {}).length === 0;

          if (wasEmpty && !isNowEmpty) {
            setStats((s) => ({ ...s, withEmails: s.withEmails + 1 }));
          } else if (!wasEmpty && isNowEmpty) {
            setStats((s) => ({ ...s, withEmails: Math.max(0, s.withEmails - 1) }));
          }

          return { ...l, business_emails: updatedEmails };
        }
        return l;
      })
    );

    setManagingEmailsLead((prev) =>
      prev && prev.id === leadId ? { ...prev, business_emails: updatedEmails } : prev
    );
  };

  // Quick deliverability status toggle/change from the table badge
  const handleEmailStatusChange = async (
    leadId: string,
    email: string,
    newStatus: EmailDeliverabilityStatus
  ) => {
    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          const curRec = l.business_emails?.[email];
          return {
            ...l,
            business_emails: {
              ...l.business_emails,
              [email]: {
                ...curRec,
                status: newStatus,
              },
            },
          };
        }
        return l;
      })
    );

    try {
      const res = await updateOutreachLeadEmailStatusAction(token, leadId, email, newStatus);
      if (res.success && res.data) {
        handleEmailsUpdated(leadId, res.data.business_emails);
      } else {
        console.error('Failed to update email deliverability status:', res.error);
        fetchLeads(); // Revert from server
      }
    } catch (err) {
      console.error('Error updating email deliverability status:', err);
      fetchLeads();
    }
  };

  // ── Lead details dialog ──
  const detailLead = useMemo(
    () => (detailLeadId ? leads.find((l) => l.id === detailLeadId) ?? null : null),
    [leads, detailLeadId]
  );

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, leadId: string) => {
    // Links, buttons and control cells keep their own behavior
    if ((e.target as HTMLElement).closest(ROW_CLICK_IGNORE_SELECTOR)) return;
    // Don't hijack text selection (e.g. copying an email address from the row)
    if (window.getSelection()?.toString()) return;
    setDetailLeadId(leadId);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, leadId: string) => {
    // Only when the row itself is focused, not a button/link inside it
    if (e.target !== e.currentTarget || e.key !== 'Enter') return;
    e.preventDefault();
    setDetailLeadId(leadId);
  };

  const handleViewConversationFromDetails = (lead: MarketingOutreachLead) => {
    setDetailLeadId(null);
    setConversationLead(lead);
  };

  const handleSendFromDetails = (lead: MarketingOutreachLead) => {
    setDetailLeadId(null);
    handleOpenSingleSend(lead);
  };

  return (
    <div className="space-y-6">
      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Total Outreach Leads</p>
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {stats.total.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
            <Users size={18} />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Verified Business Emails</p>
            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.withEmails.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Mail size={18} />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Pending Outreach</p>
            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.pending.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Clock size={18} />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Emailed Leads</p>
            <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {stats.emailed.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
            <CheckCircle2 size={18} />
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Replied Leads</p>
            <h3 className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">
              {stats.replied.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/10 text-teal-600 border border-teal-500/20">
            <MessageSquareText size={18} />
          </div>
        </Card>
      </div>

      {/* ── Notification Banner ── */}
      {actionSuccess && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300 text-xs animate-in fade-in-50 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Search & Filter Controls ── */}
      <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search by tool name, URL, or business email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status Dropdown */}
            <div className="w-[150px]">
              <Select
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
                className="h-9 text-xs"
              >
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="emailed">Emailed</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="launched">Launched</SelectItem>
              </Select>
            </div>

            {/* Sources Dropdown */}
            <div className="w-[160px]">
              <Select
                value={sourceFilter}
                onChange={(val) => {
                  setSourceFilter(val);
                  setPage(1);
                }}
                className="h-9 text-xs"
              >
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="producthunt">ProductHunt</SelectItem>
                <SelectItem value="toolify">Toolify</SelectItem>
                <SelectItem value="theresanaiforthat">There&apos;s An AI</SelectItem>
                <SelectItem value="codehype">CodeHype</SelectItem>
                <SelectItem value="tool_submission">Tool Submissions</SelectItem>
              </Select>
            </div>

            {/* Only With Email Toggle */}
            <button
              type="button"
              onClick={() => {
                setHasEmailOnly(!hasEmailOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                hasEmailOnly
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Mail size={13} />
              <span>With Business Email</span>
            </button>

            {/* Only With Replies Toggle */}
            <button
              type="button"
              aria-pressed={hasRepliesOnly}
              onClick={() => {
                setHasRepliesOnly(!hasRepliesOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                hasRepliesOnly
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
              }`}
            >
              <MessageSquareText size={13} />
              <span>Has Replies</span>
            </button>

            {/* Only Tool Submissions Toggle */}
            <button
              type="button"
              aria-pressed={isToolSubmissionOnly}
              onClick={() => {
                setIsToolSubmissionOnly(!isToolSubmissionOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                isToolSubmissionOnly
                  ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-zinc-900 border-amber-600 dark:border-amber-500 shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Sparkles size={13} className={isToolSubmissionOnly ? 'text-amber-100 dark:text-zinc-900' : 'text-amber-500'} />
              <span>Tool Submissions</span>
            </button>
          </div>

          {/* Refresh Action */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLeads(true)}
              disabled={isRefreshing}
              className="h-9 text-xs gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Floating Sticky Bulk Action Bar (When Rows Are Selected) ── */}
      {selectedLeadIds.size > 0 && (
        <div className="sticky top-20 z-20 flex items-center justify-between p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md text-zinc-900 dark:text-zinc-100 shadow-md border border-zinc-200/80 dark:border-zinc-700/60 ring-1 ring-zinc-900/5 dark:ring-white/5 animate-in fade-in-50 slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-900 dark:text-zinc-100">
              {selectedLeadIds.size}
            </div>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {selectedLeadIds.size} {selectedLeadIds.size === 1 ? 'tool selected' : 'tools selected'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleOpenBulkSend}
              className="h-8 text-xs gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-semibold shadow-xs cursor-pointer"
            >
              <Send size={12} />
              Send Outreach Campaign ({selectedLeadIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* ── Leads Data Table ── */}
      <Card
        ref={tableCardRef}
        className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs relative"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
            <Spinner size={32} className="text-zinc-900 dark:text-zinc-100" />
            <p className="text-xs font-medium">Loading outreach leads...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400">
            <Users size={36} className="mb-2 opacity-40 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No marketing leads found
            </p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Try adjusting your search terms or clearing the status filter.
            </p>
          </div>
        ) : (
          <Table containerClassName="max-h-[600px] 2xl:max-h-[680px] rounded-t-2xl table-scrollbar" className="min-w-[1520px] border-collapse">
            <TableHeader className="sticky top-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <TableRow>
                {/* Select All Checkbox - Sticky Left */}
                <TableHead className="w-12 px-4 py-3.5 text-center sticky left-0 top-0 z-30 bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200/80 dark:border-zinc-800/80">
                  <button
                    type="button"
                    onClick={toggleSelectAllPage}
                    className="inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                    title={isAllPageSelected ? 'Deselect page' : 'Select page'}
                  >
                    {isAllPageSelected ? (
                      <CheckSquare size={16} className="text-zinc-900 dark:text-zinc-100" />
                    ) : isSomePageSelected ? (
                      <div className="w-4 h-4 rounded border border-zinc-900 dark:border-zinc-100 bg-zinc-900/20 flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-zinc-900 dark:bg-zinc-100" />
                      </div>
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[240px]">
                  Tool / Product
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[260px]">
                  Business Emails
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[160px]">
                  Source Platforms
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[120px]">
                  Socials / Links
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[130px]">
                  Status
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[190px]">
                  Conversation
                </TableHead>
                <TableHead className="px-6 py-3.5 text-left align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[120px]">
                  Date Added
                </TableHead>
                <TableHead className="px-6 py-3.5 text-right align-middle text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 sticky right-0 top-0 z-30 bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-[-4px_0_8px_rgba(0,0,0,0.02)] min-w-[170px] pr-6">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {leads.map((lead) => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  const emailEntries = Object.entries(lead.business_emails || {});
                  const sources = Array.isArray(lead.sources) ? lead.sources : [];
                  const socials = lead.social_links || [];
                  const contactUrls = lead.contact_page_url || [];
                  const hasEmail = emailEntries.length > 0;

                  return (
                    <TableRow
                      key={lead.id}
                      tabIndex={0}
                      aria-label={`${lead.tool_name}: press Enter to view details`}
                      onClick={(e) => handleRowClick(e, lead.id)}
                      onKeyDown={(e) => handleRowKeyDown(e, lead.id)}
                      className={`group border-b border-zinc-100 dark:border-zinc-800/80 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400 dark:focus-visible:outline-zinc-500 ${
                        isSelected
                          ? 'bg-zinc-50/90 dark:bg-zinc-800/60'
                          : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30'
                      }`}
                    >
                      {/* Selection Checkbox - Sticky Left */}
                      <TableCell data-no-row-click className={`w-12 px-4 py-3.5 text-center sticky left-0 z-10 border-r border-zinc-100 dark:border-zinc-800/80 transition-colors ${
                        isSelected
                          ? 'bg-zinc-50 dark:bg-zinc-800/90'
                          : 'bg-white dark:bg-zinc-900 group-hover:bg-zinc-50/90 dark:group-hover:bg-zinc-800/50'
                      }`}>
                        <button
                          type="button"
                          onClick={() => toggleSelectLead(lead.id)}
                          className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-zinc-900 dark:text-zinc-100" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </TableCell>

                      {/* Tool Name & Site URL */}
                      <TableCell className="px-6 py-3.5 min-w-[240px]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                              {lead.tool_name}
                            </span>
                            {(lead.metadata?.is_tool_submission === true || lead.metadata?.is_tool_submission === 'true') && (
                              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] px-1.5 py-0 font-medium shrink-0">
                                Submitted Tool
                              </Badge>
                            )}
                            {lead.tool_site_url && (
                              <a
                                href={lead.tool_site_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                title={lead.tool_site_url}
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[200px]">
                              {lead.tool_site_url?.replace(/^https?:\/\//, '')}
                            </span>

                            {/* Categories tags if present */}
                            {Array.isArray(lead.metadata?.categories) &&
                              lead.metadata.categories.slice(0, 2).map((cat: string) => (
                                <span
                                  key={cat}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60"
                                >
                                  {cat}
                                </span>
                              ))}
                          </div>
                        </div>
                      </TableCell>

                      {/* Business Emails (Clean & Modern Layout) */}
                      <TableCell className="px-6 py-3.5 min-w-[300px]">
                        {hasEmail ? (
                          <div className="flex items-start justify-between gap-2 max-w-[320px]">
                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                              {emailEntries.slice(0, 2).map(([email, rawRecord], idx) => {
                                const record =
                                  typeof rawRecord === 'object' && rawRecord !== null
                                    ? rawRecord
                                    : { status: (rawRecord as any) || 'unverified' };

                                return (
                                  <div
                                    key={email}
                                    className="flex items-center gap-2 min-w-0"
                                  >
                                    <span
                                      className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate select-all"
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
                                      onStatusChange={(newStatus) =>
                                        handleEmailStatusChange(lead.id, email, newStatus)
                                      }
                                    />
                                  </div>
                                );
                              })}

                              {emailEntries.length > 2 && (
                                <button
                                  type="button"
                                  data-no-row-click
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManagingEmailsLead(lead);
                                  }}
                                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-medium text-left cursor-pointer transition-colors w-fit"
                                >
                                  +{emailEntries.length - 2} more emails
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              data-no-row-click
                              onClick={(e) => {
                                e.stopPropagation();
                                setManagingEmailsLead(lead);
                              }}
                              className="size-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors cursor-pointer mt-0.5"
                              title={`Manage emails for ${lead.tool_name}`}
                              aria-label={`Manage emails for ${lead.tool_name}`}
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 italic">No email</span>
                            <button
                              type="button"
                              data-no-row-click
                              onClick={(e) => {
                                e.stopPropagation();
                                setManagingEmailsLead(lead);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                              title={`Add email for ${lead.tool_name}`}
                            >
                              <Plus size={11} />
                              <span>Add</span>
                            </button>
                          </div>
                        )}
                      </TableCell>

                      {/* Source Platforms */}
                      <TableCell className="px-6 py-3.5 min-w-[160px]">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {sources.length > 0 ? (
                            sources.map((src, i) => {
                              const name = src.source || 'Scraped';
                              return (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                                >
                                  {name.replace('.com', '').replace('.ai', '')}
                                </Badge>
                              );
                            })
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Socials / Links */}
                      <TableCell className="px-6 py-3.5 min-w-[120px]">
                        <div className="flex items-center gap-2 text-zinc-400">
                          {socials.some((s) => s.includes('twitter') || s.includes('x.com')) && (
                            <a
                              href={socials.find((s) => s.includes('twitter') || s.includes('x.com'))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-sky-500 transition-colors"
                              title="X / Twitter profile"
                            >
                              <TwitterIcon size={14} />
                            </a>
                          )}
                          {socials.some((s) => s.includes('linkedin')) && (
                            <a
                              href={socials.find((s) => s.includes('linkedin'))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-blue-600 transition-colors"
                              title="LinkedIn profile"
                            >
                              <LinkedinIcon size={14} />
                            </a>
                          )}
                          {contactUrls.length > 0 && (
                            <a
                              href={contactUrls[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                              title="Contact page"
                            >
                              <LinkIcon size={14} />
                            </a>
                          )}
                          {socials.length === 0 && contactUrls.length === 0 && (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Status Control */}
                      <TableCell className="px-6 py-3.5 min-w-[130px]">
                        <StatusChangeControl
                          itemId={lead.id}
                          currentStatus={lead.status}
                          options={STATUS_OPTIONS}
                          itemLabel={lead.tool_name}
                          onStatusChange={handleStatusChange}
                          getVariant={getStatusVariant}
                          formatStatus={formatStatus}
                          getDotColor={getStatusDotColor}
                        />
                        {(() => {
                          const hint = getAutomationHint(lead);
                          return hint ? (
                            <span className="block mt-1 text-[10px] text-zinc-400" title={hint.title}>
                              {hint.label}
                            </span>
                          ) : null;
                        })()}
                      </TableCell>

                      {/* Conversation summary & Conversion status */}
                      <TableCell className="px-6 py-3.5 min-w-[190px]">
                        <div className="space-y-1">
                          {(() => {
                            const summary = lead.conversation_summary;
                            if (!summary || summary.message_count === 0) {
                              return <span className="text-xs text-zinc-400 block">—</span>;
                            }
                            const replies = summary.reply_count || 0;
                            const awaitingUs = summary.last_direction === 'inbound' && replies > 0;
                            return (
                              <button
                                type="button"
                                onClick={() => setConversationLead(lead)}
                                className="text-left group/conv cursor-pointer block"
                                title={`View conversation with ${lead.tool_name}`}
                              >
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                                    replies > 0
                                      ? 'bg-teal-50 text-teal-800 border-teal-200 group-hover/conv:border-teal-400 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/30'
                                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 group-hover/conv:border-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700'
                                  }`}
                                >
                                  {awaitingUs && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" aria-label="New reply" />
                                  )}
                                  <span>
                                    {summary.outbound_count} sent · {replies} {replies === 1 ? 'reply' : 'replies'}
                                  </span>
                                </span>
                                <span className="block text-[10px] text-zinc-400 mt-0.5 pl-1">
                                  {awaitingUs ? 'Replied ' : 'Last activity '}
                                  {formatRelativeTime(summary.last_message_at)}
                                </span>
                              </button>
                            );
                          })()}

                          {/* Website conversion milestone badge */}
                          {(() => {
                            const conv = lead.conversions?.summary || lead.conversion_summary;
                            if (!conv) return null;
                            if (conv.purchased) {
                              return (
                                <Badge variant="outline" className="text-[10px] font-medium bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800/40">
                                  ✓ Purchased (${conv.total_spent_usd || 0})
                                </Badge>
                              );
                            }
                            if (conv.submitted) {
                              return (
                                <Badge variant="outline" className="text-[10px] font-medium bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-800/40">
                                  ✓ Tool Submitted
                                </Badge>
                              );
                            }
                            if (conv.signed_up) {
                              return (
                                <Badge variant="outline" className="text-[10px] font-medium bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800/40">
                                  ✓ Signed Up
                                </Badge>
                              );
                            }
                            if (conv.visit_count && conv.visit_count > 0) {
                              return (
                                <span className="inline-block text-[10px] text-zinc-400 font-mono">
                                  {conv.visit_count} web {conv.visit_count === 1 ? 'visit' : 'visits'}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </TableCell>

                      {/* Date Added */}
                      <TableCell className="px-6 py-3.5 min-w-[120px] text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {lead.created_at
                          ? new Date(lead.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </TableCell>

                      {/* Quick Send Action - Sticky Right (disabled buttons use pointer-events-none, so the whole cell opts out of row clicks) */}
                      <TableCell data-no-row-click className={`px-6 py-3.5 text-right pr-6 sticky right-0 z-10 border-l border-zinc-100 dark:border-zinc-800/80 shadow-[-4px_0_8px_rgba(0,0,0,0.02)] min-w-[170px] transition-colors ${
                        isSelected
                          ? 'bg-zinc-50 dark:bg-zinc-800/90'
                          : 'bg-white dark:bg-zinc-900 group-hover:bg-zinc-50/90 dark:group-hover:bg-zinc-800/50'
                      }`}>
                        <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConversationLead(lead)}
                          className="h-8 w-8 p-0 cursor-pointer text-zinc-600 dark:text-zinc-300"
                          title={`View conversation with ${lead.tool_name}`}
                          aria-label={`View conversation with ${lead.tool_name}`}
                        >
                          <MessageSquare size={13} />
                        </Button>
                        {/* Solid `default` variant when sendable: its hover keeps text contrast in both themes
                            (the outline variant's hover:text-[--text-primary] made the label vanish on hover). */}
                        <Button
                          variant={hasEmail ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleOpenSingleSend(lead)}
                          disabled={!hasEmail}
                          className={`h-8 text-xs gap-1.5 ${
                            hasEmail ? 'font-semibold' : 'disabled:opacity-40 text-zinc-400 dark:text-zinc-500'
                          }`}
                          title={hasEmail ? `Send email to ${lead.tool_name}` : 'No email available for this tool'}
                        >
                          <Send size={12} />
                          Send Email
                        </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        )}

        {/* ── Table Footer & Pagination (Reusable Component Only) ── */}
        {!loading && totalCount > 0 && (
          <Pagination
            totalCount={totalCount}
            pageSize={pageSize}
            currentPage={page}
            onPageChange={(p) => {
              setPage(p);
              if (tableCardRef.current) {
                const scrollableTable = tableCardRef.current.querySelector('.overflow-auto');
                if (scrollableTable) {
                  scrollableTable.scrollTo({ top: 0, behavior: 'smooth' });
                }
                const rect = tableCardRef.current.getBoundingClientRect();
                if (rect.top < 80) {
                  window.scrollTo({
                    top: window.scrollY + rect.top - 85,
                    behavior: 'smooth',
                  });
                }
              }
            }}
            className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 rounded-b-2xl"
          />
        )}
      </Card>

      {/* ── Outreach Dispatch Modal ── */}
      <SendLeadEmailModal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        token={token}
        selectedLeads={leadsForModal}
        templates={templates}
        onSuccess={handleSendSuccess}
      />

      {/* ── Conversation History (outbound + Resend replies) ── */}
      <LeadConversationDialog
        key={conversationLead?.id || 'no-lead'}
        open={Boolean(conversationLead)}
        onOpenChange={(open) => {
          if (!open) setConversationLead(null);
        }}
        token={token}
        lead={conversationLead}
        onSendFollowUp={handleSendFollowUp}
      />

      {/* ── Lead Details (mounted only while open: DialogContent locks body scroll while mounted) ── */}
      {detailLead && (
        <LeadDetailsDialog
          key={detailLead.id}
          open
          token={token}
          onOpenChange={(open) => {
            if (!open) setDetailLeadId(null);
          }}
          lead={detailLead}
          onViewConversation={handleViewConversationFromDetails}
          onSendEmail={handleSendFromDetails}
          onLeadUpdated={(updatedLead) => handleEmailsUpdated(updatedLead.id, updatedLead.business_emails)}
        />
      )}

      {/* ── Manage Lead Emails Modal ── */}
      {managingEmailsLead && (
        <ManageLeadEmailsModal
          open
          onOpenChange={(open) => {
            if (!open) setManagingEmailsLead(null);
          }}
          lead={managingEmailsLead}
          token={token}
          onEmailsUpdated={handleEmailsUpdated}
        />
      )}
    </div>
  );
}
