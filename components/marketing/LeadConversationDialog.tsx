'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  Inbox,
  Mail,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  getOutreachLeadConversationAction,
  type MarketingOutreachLead,
  type OutreachLeadConversation,
} from '@/app/admin/marketing/actions';
import {
  EMAIL_IFRAME_SANDBOX,
  buildSandboxedEmailDoc,
  formatMessageTime,
  formatRelativeTime,
  splitQuotedReply,
  type ConversationMessage,
  type ConversationStatus,
  type ConversationThread,
} from '@/lib/marketing/conversation';

// ────────────────────────────────────────────────────────────────────────────
// Status styling
// ────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ConversationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  delivered: {
    label: 'Delivered',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    icon: <CheckCircle2 size={11} />,
  },
  sent: {
    label: 'Sent',
    className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
    icon: <Send size={10} />,
  },
  pending: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    icon: <Clock size={11} />,
  },
  bounced: {
    label: 'Bounced',
    className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    icon: <AlertCircle size={11} />,
  },
  failed: {
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    icon: <XCircle size={11} />,
  },
};

function StatusChip({ status }: { status?: ConversationStatus }) {
  const style = STATUS_STYLES[status || 'pending'] || STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.className}`}
    >
      {style.icon}
      {style.label}
    </span>
  );
}

const MATCH_LABELS: Record<string, string> = {
  message_id: 'Matched via In-Reply-To',
  thread_email: 'Matched by sender address',
  business_email: 'Matched by business email',
};

const formatBytes = (size: number | null) => {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

// ────────────────────────────────────────────────────────────────────────────
// Message bubble
// ────────────────────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === 'inbound';
  const [showQuoted, setShowQuoted] = useState(false);
  const { visible, quoted } = useMemo(() => splitQuotedReply(message.body_text || ''), [message.body_text]);
  const hasHtml = Boolean(message.body_html && message.body_html.trim());
  const [showHtml, setShowHtml] = useState(!visible && hasHtml);
  const attachments = message.attachments || [];
  const senderLabel = message.from || (isInbound ? 'Prospect' : 'Toolbit AI');
  const initial = (senderLabel.replace(/^["']/, '').trim().charAt(0) || '?').toUpperCase();

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <article
        className={`w-full max-w-[88%] rounded-2xl border p-4 space-y-2.5 text-xs shadow-2xs ${
          isInbound
            ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-500/5 dark:border-emerald-500/20'
            : 'bg-zinc-50 border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700'
        }`}
        aria-label={`${isInbound ? 'Reply from' : 'Email to'} ${isInbound ? senderLabel : message.to || ''}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                isInbound
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              }`}
              aria-hidden="true"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                {isInbound ? (
                  <ArrowDownLeft size={12} className="text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={12} className="text-zinc-500 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{senderLabel}</span>
              </div>
              {message.to && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">to {message.to}</div>
              )}
            </div>
          </div>
          <time
            dateTime={message.timestamp}
            className="text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0"
            title={message.timestamp}
          >
            {formatMessageTime(message.timestamp)}
          </time>
        </div>

        {/* Subject */}
        {message.subject && (
          <div className="font-semibold text-zinc-800 dark:text-zinc-200">{message.subject}</div>
        )}

        {/* Body */}
        {visible && !showHtml && (
          <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
            {visible}
          </div>
        )}

        {quoted && !showHtml && (
          <div>
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
              className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 cursor-pointer"
            >
              {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
            </button>
            {showQuoted && (
              <div className="mt-2 pl-3 border-l-2 border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-words">
                {quoted}
              </div>
            )}
          </div>
        )}

        {showHtml && hasHtml && (
          <iframe
            title={`Email content: ${message.subject || 'message'}`}
            srcDoc={buildSandboxedEmailDoc(message.body_html || '')}
            sandbox={EMAIL_IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            className="w-full h-[360px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white"
          />
        )}

        {!visible && !hasHtml && <div className="italic text-zinc-400">No content</div>}

        {/* Meta chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {!isInbound && <StatusChip status={message.status} />}
          {isInbound && message.is_auto_reply && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
              <Bot size={11} /> Auto-reply
            </span>
          )}
          {message.template_id && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 font-mono">
              {message.template_id}
            </span>
          )}
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-white text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 max-w-[220px]"
              title={a.filename || 'attachment'}
            >
              <Paperclip size={10} className="shrink-0" />
              <span className="truncate">{a.filename || 'attachment'}</span>
              {a.size ? <span className="text-zinc-400 shrink-0">{formatBytes(a.size)}</span> : null}
            </span>
          ))}
          {isInbound && message.match_type && message.match_type !== 'message_id' && (
            <span className="text-[10px] text-zinc-400">{MATCH_LABELS[message.match_type]}</span>
          )}
          {message.truncated && <span className="text-[10px] text-amber-600">Content truncated</span>}
          {message.error && (
            <span className="text-[10px] text-rose-600 dark:text-rose-400 truncate max-w-full" title={message.error}>
              {message.error}
            </span>
          )}
          {hasHtml && (
            <button
              type="button"
              onClick={() => setShowHtml((v) => !v)}
              aria-pressed={showHtml}
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
            >
              <Code2 size={11} />
              {showHtml ? 'Show text' : 'View HTML'}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Dialog
// ────────────────────────────────────────────────────────────────────────────

interface LeadConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lead: MarketingOutreachLead | null;
  onSendFollowUp?: (lead: MarketingOutreachLead) => void;
}

export default function LeadConversationDialog({
  open,
  onOpenChange,
  token,
  lead,
  onSendFollowUp,
}: LeadConversationDialogProps) {
  const [conversation, setConversation] = useState<OutreachLeadConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const loadConversation = useCallback(
    async (leadId: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getOutreachLeadConversationAction(token, leadId);
        if (res.success && res.data) {
          setConversation(res.data);
          setSelectedEmail((prev) =>
            prev && res.data!.threads.some((t) => t.email === prev) ? prev : res.data!.threads[0]?.email || null
          );
        } else {
          setError(res.error || 'Failed to load conversation.');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load conversation.');
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Parent remounts this component per lead (key={lead.id}), so state starts fresh.
  useEffect(() => {
    if (open && lead?.id) void loadConversation(lead.id);
  }, [open, lead?.id, loadConversation]);

  const threads = conversation?.threads || [];
  const activeThread: ConversationThread | undefined =
    threads.find((t) => t.email === selectedEmail) || threads[0];
  const totalMessages = threads.reduce((n, t) => n + t.messages.length, 0);
  const totalReplies = threads.reduce(
    (n, t) => n + t.messages.filter((m) => m.direction === 'inbound' && !m.is_auto_reply).length,
    0
  );
  const lastActivity = threads[0]?.last_message_at || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 pr-14 border-b border-zinc-100 dark:border-zinc-800 text-left">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 shrink-0">
                <MessageSquare size={18} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span className="truncate">{lead?.tool_name || 'Conversation'}</span>
                  {lead?.tool_site_url && (
                    <a
                      href={lead.tool_site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                      aria-label={`Open ${lead.tool_name} website`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  {threads.length} {threads.length === 1 ? 'thread' : 'threads'} · {totalMessages}{' '}
                  {totalMessages === 1 ? 'message' : 'messages'} · {totalReplies}{' '}
                  {totalReplies === 1 ? 'reply' : 'replies'}
                  {lastActivity ? ` · last activity ${formatRelativeTime(lastActivity)}` : ''}
                </DialogDescription>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => lead?.id && loadConversation(lead.id)}
                disabled={loading || !lead}
                className="h-8 text-xs gap-1.5 cursor-pointer"
                title="Reload the latest stored conversation"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[290px_1fr]">
          {/* Threads (grouped by parent email) */}
          <aside
            className="border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 overflow-y-auto max-h-48 md:max-h-none"
            aria-label="Threads by parent email"
          >
            <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Threads · by parent email
            </div>
            <div className="px-3 pb-4 space-y-2">
              {threads.map((thread) => {
                const isActive = activeThread?.email === thread.email;
                const replies = thread.messages.filter((m) => m.direction === 'inbound' && !m.is_auto_reply).length;
                const lastIsInbound = thread.messages[thread.messages.length - 1]?.direction === 'inbound';
                return (
                  <button
                    key={thread.email}
                    type="button"
                    onClick={() => setSelectedEmail(thread.email)}
                    aria-pressed={isActive}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-zinc-800 border-zinc-900 dark:border-zinc-100 shadow-xs'
                        : 'bg-white/70 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {thread.email}
                      </span>
                      {lastIsInbound && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-label="Last message is a reply" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <StatusChip status={thread.status} />
                      {replies > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                          {replies} {replies === 1 ? 'reply' : 'replies'}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                      {thread.messages.length} {thread.messages.length === 1 ? 'message' : 'messages'}
                      {thread.last_message_at ? ` · ${formatRelativeTime(thread.last_message_at)}` : ''}
                    </div>
                  </button>
                );
              })}

              {!loading && threads.length === 0 && !error && (
                <p className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400">No threads yet.</p>
              )}
            </div>
          </aside>

          {/* Timeline */}
          <section className="min-h-0 overflow-y-auto p-5 space-y-4" aria-live="polite" aria-busy={loading}>
            {loading && !conversation && (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
                <Spinner size={28} className="text-zinc-900 dark:text-zinc-100" />
                <p className="text-xs font-medium">Loading conversation…</p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!loading && !error && threads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400">
                <Inbox size={36} className="mb-2 opacity-40" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No conversation yet</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Outreach emails sent from this dashboard and replies received in Resend will appear here,
                  grouped by the business email they were sent to.
                </p>
              </div>
            )}

            {activeThread && (
              <>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <Mail size={12} />
                  <span className="font-mono normal-case tracking-normal text-[11px]">{activeThread.email}</span>
                </div>
                {activeThread.messages.map((message, idx) => (
                  <MessageBubble
                    key={message.resend_email_id || message.message_id || `${message.timestamp}-${idx}`}
                    message={message}
                  />
                ))}
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Replies and delivery updates arrive automatically through the Resend webhook.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs cursor-pointer">
              Close
            </Button>
            {lead && onSendFollowUp && (
              <Button
                size="sm"
                onClick={() => onSendFollowUp(lead)}
                disabled={!lead.business_emails?.length}
                className="h-8 text-xs gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-semibold cursor-pointer"
              >
                <Send size={12} />
                Send follow-up
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
