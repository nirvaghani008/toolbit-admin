'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Inbox,
  Link2,
  Link2Off,
  Paperclip,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getResendReceivedEmailsAction,
  getResendReceivedEmailDetailsAction,
  type ReceivedEmailDetails,
  type ReceivedEmailListEntry,
} from '@/app/admin/marketing/actions';
import {
  EMAIL_IFRAME_SANDBOX,
  buildSandboxedEmailDoc,
  formatMessageTime,
  splitQuotedReply,
} from '@/lib/marketing/conversation';

interface ResendReceivedHistoryProps {
  token: string;
}

type LinkFilter = 'all' | 'linked' | 'unlinked';

export default function ResendReceivedHistory({ token }: ResendReceivedHistoryProps) {
  const [items, setItems] = useState<ReceivedEmailListEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<ReceivedEmailDetails | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [showHtml, setShowHtml] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);

  const loadFirstPage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getResendReceivedEmailsAction(token);
      if (res.success && res.data) {
        setItems(res.data.items);
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error || 'Failed to load received emails.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load received emails.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getResendReceivedEmailsAction(token, { after: nextCursor });
      if (res.success && res.data) {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...res.data!.items.filter((i) => !seen.has(i.id))];
        });
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error || 'Failed to load more received emails.');
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const handleView = async (id: string) => {
    setLoadingDetailsId(id);
    try {
      const res = await getResendReceivedEmailDetailsAction(token, id);
      if (res.success && res.data) {
        setDetails(res.data);
        setShowHtml(!res.data.text && Boolean(res.data.html));
        setShowQuoted(false);
        setDetailsOpen(true);
      } else {
        setError(res.error || 'Failed to load email.');
      }
    } finally {
      setLoadingDetailsId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (linkFilter === 'linked' && !item.link) return false;
      if (linkFilter === 'unlinked' && item.link) return false;
      if (!q) return true;
      return (
        (item.from || '').toLowerCase().includes(q) ||
        (item.subject || '').toLowerCase().includes(q) ||
        (item.to || []).join(' ').toLowerCase().includes(q) ||
        (item.link?.tool_name || '').toLowerCase().includes(q)
      );
    });
  }, [items, search, linkFilter]);

  const stats = useMemo(() => {
    const linked = items.filter((i) => i.link).length;
    return { total: items.length, linked, unlinked: items.length - linked };
  }, [items]);

  const detailsBody = useMemo(() => splitQuotedReply(details?.text || ''), [details?.text]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Received (loaded)</p>
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.total}</h3>
          </div>
          <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
            <Inbox size={20} />
          </div>
        </Card>
        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Linked to a Lead</p>
            <h3 className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">{stats.linked}</h3>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/10 text-teal-600 border border-teal-500/20">
            <Link2 size={20} />
          </div>
        </Card>
        <Card className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Not Linked</p>
            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.unlinked}</h3>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Link2Off size={20} />
          </div>
        </Card>
      </div>

      {/* Filters & actions */}
      <Card className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search by sender, subject or linked tool..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              aria-label="Search received emails"
            />
          </div>
          <div className="w-[170px]">
            <Select value={linkFilter} onChange={(val) => setLinkFilter(val as LinkFilter)} className="h-9 text-xs">
              <SelectItem value="all">All Received</SelectItem>
              <SelectItem value="linked">Linked to Lead</SelectItem>
              <SelectItem value="unlinked">Not Linked</SelectItem>
            </Select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadFirstPage()}
            disabled={loading}
            className="h-9 text-xs gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer"
            title="Reload the live list from Resend"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
            <Spinner size={28} className="text-zinc-900 dark:text-zinc-100" />
            <p className="text-xs font-medium">Loading received emails from Resend…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400">
            <Inbox size={36} className="mb-2 opacity-40" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No received emails found</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-md">
              Replies to your outreach arrive in Resend Receiving and show up here live. Linked replies are
              also stored in the lead&apos;s conversation history.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th scope="col" className="py-3 px-4">From</th>
                  <th scope="col" className="py-3 px-4">Subject</th>
                  <th scope="col" className="py-3 px-4">To</th>
                  <th scope="col" className="py-3 px-4">Linked Lead</th>
                  <th scope="col" className="py-3 px-4">Received At</th>
                  <th scope="col" className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3 px-4 max-w-[220px]">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={item.from}>
                        {item.from}
                      </div>
                      {(item.attachments?.length || 0) > 0 && (
                        <div className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Paperclip size={10} /> {item.attachments!.length} attachment
                          {item.attachments!.length === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="truncate font-medium text-zinc-900 dark:text-zinc-100" title={item.subject}>
                        {item.subject || '(no subject)'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 truncate max-w-[180px]" title={(item.to || []).join(', ')}>
                      {(item.to || []).join(', ')}
                    </td>
                    <td className="py-3 px-4">
                      {item.link ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300 border border-teal-200 dark:border-teal-500/20 max-w-[220px]"
                          title={`Thread: ${item.link.thread_email}`}
                        >
                          <CheckCircle2 size={11} className="shrink-0" />
                          <span className="truncate">{item.link.tool_name}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          <Link2Off size={11} /> Not linked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">{formatMessageTime(item.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loadingDetailsId === item.id}
                        onClick={() => handleView(item.id)}
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

        {!loading && nextCursor && (
          <div className="flex justify-center p-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              {loadingMore ? <Spinner size={12} className="text-current" /> : null}
              Load older emails
            </Button>
          </div>
        )}
      </Card>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="p-5 pb-3 pr-14 border-b border-zinc-100 dark:border-zinc-800 text-left">
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Inbox size={16} />
              <span className="truncate">{details?.subject || '(no subject)'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Received email · live from the Resend Receiving API
            </DialogDescription>
          </DialogHeader>

          {details && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider mb-1">From</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100 break-all">{details.from}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider mb-1">To</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200 break-all">{details.to.join(', ')}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider mb-1">Received</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{formatMessageTime(details.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider mb-1">Linked Lead</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">
                    {details.link ? (
                      <>
                        <span className="font-semibold">{details.link.tool_name}</span>
                        <span className="text-zinc-500"> · thread {details.link.thread_email}</span>
                      </>
                    ) : (
                      <span className="text-zinc-500">Not linked to any outreach lead</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                  Message
                </span>
                {details.html && (
                  <button
                    type="button"
                    onClick={() => setShowHtml((v) => !v)}
                    aria-pressed={showHtml}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <Code2 size={12} />
                    {showHtml ? 'Show plain text' : 'View HTML'}
                  </button>
                )}
              </div>

              {showHtml && details.html ? (
                <iframe
                  title={`Received email: ${details.subject || 'message'}`}
                  srcDoc={buildSandboxedEmailDoc(details.html)}
                  sandbox={EMAIL_IFRAME_SANDBOX}
                  referrerPolicy="no-referrer"
                  className="w-full h-[420px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white"
                />
              ) : (
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="whitespace-pre-wrap break-words leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {detailsBody.visible || <span className="italic text-zinc-400">No plain-text content</span>}
                  </div>
                  {detailsBody.quoted && (
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
                        <div className="mt-2 pl-3 border-l-2 border-zinc-300 dark:border-zinc-600 text-zinc-500 whitespace-pre-wrap break-words">
                          {detailsBody.quoted}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {details.attachments.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                    Attachments
                  </span>
                  <ul className="flex flex-wrap gap-1.5">
                    {details.attachments.map((a) => (
                      <li
                        key={a.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                      >
                        <Paperclip size={11} /> {a.filename || 'attachment'}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-zinc-400">Download attachments from the Resend dashboard.</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="p-4 px-6 mt-0 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)} className="text-xs ml-auto cursor-pointer">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
