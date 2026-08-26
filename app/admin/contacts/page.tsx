'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { scrollToError } from '@/lib/form-utils';
import CountUp from '@/components/common/CountUp';
import {
  Clock,
  CheckCircle2,
  EyeOff,
  Database,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import ContactTable, { Contact } from '@/components/contacts/ContactTable';
import ContactReplyView from '@/components/contacts/ContactReplyView';

const contactReplySchema = z.object({
  selectedStatus: z.string(),
  replyText: z.string(),
}).superRefine((data, ctx) => {
  if (data.selectedStatus === 'replied' && !data.replyText.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please enter a reply message before marking as Replied.',
      path: ['replyText'],
    });
  }
});

export default function ContactsPage() {
  const confirmDelete = useConfirm();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    new: 0,
    replied: 0,
    hide: 0,
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    new: [0, 0, 0, 0, 0, 0, 0],
    replied: [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0],
  });

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'replied' | 'hide'>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'name'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('replied');
  const pageSize = 20;

  const sortOptions = [
    { value: 'updated_at-desc', label: 'Last Updated' },
    { value: 'created_at-desc', label: 'Newest First' },
    { value: 'created_at-asc', label: 'Oldest First' },
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
  ];

  // Synchronize reply view state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.contactOpen) {
        if (e.state.contactData) setSelectedContact(e.state.contactData);
      } else {
        setSelectedContact(null);
        setReplyText('');
        setReplyError(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openReply = (contact: Contact) => {
    setSelectedContact(contact);
    setReplyText(contact.reply_message || '');
    setReplyError(null);
    setSelectedStatus(contact.status === 'hide' || contact.status === 'hidden' ? 'hide' : 'replied');
    window.history.pushState({ contactOpen: true, contactData: contact }, '');
  };

  const closeReply = () => {
    if (selectedContact) {
      setSelectedContact(null);
      setReplyText('');
      setReplyError(null);
      if (window.history.state?.contactOpen) {
        window.history.back();
      }
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      let allCount = 0,
        newCount = 0,
        repliedCount = 0,
        hideCount = 0;

      const { data: statusCounts, error: countError } = await supabase.rpc('get_status_counts', {
        tbl_name: 'contacts',
      });

      if (!countError && statusCounts) {
        allCount = statusCounts.total || 0;
        newCount = statusCounts.new || 0;
        repliedCount = statusCounts.replied || 0;
        hideCount = statusCounts.hide || 0;
      } else {
        const [
          { count: cAll },
          { count: cNew },
          { count: cReplied },
          { count: cHide },
        ] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }),
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'new'),
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'replied'),
          supabase.from('contacts').select('*', { count: 'exact', head: true }).or('status.eq.hide,status.eq.hidden'),
        ]);

        allCount = cAll || 0;
        newCount = cNew || 0;
        repliedCount = cReplied || 0;
        hideCount = cHide || 0;
      }

      setStats({
        all: allCount,
        new: newCount,
        replied: repliedCount,
        hide: hideCount,
      });

      try {
        const trends = await fetchSparklinesForStatuses(
          'contacts',
          [null, 'new', 'replied', 'hide'],
          'created_at',
          7
        );

        setSparklines({
          all: trends['all'] || [],
          new: trends['new'] || [],
          replied: trends['replied'] || [],
          hide: trends['hide'] || [],
        });
      } catch (trendErr) {
        console.warn('Sparklines trend fetch warning:', trendErr);
      }

      setTotalCount(allCount);
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching contact stats:', err?.message || err);
    }
  }, []);

  const fetchContacts = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      setLoading(true);

      try {
        if (manual) fetchStats();

        let query = supabase.from('contacts').select('*', { count: 'exact' });

        if (searchQuery) {
          query = query.or(
            `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%`
          );
        }

        if (statusFilter === 'new') {
          query = query.eq('status', 'new');
        } else if (statusFilter === 'replied') {
          query = query.eq('status', 'replied');
        } else if (statusFilter === 'hide') {
          query = query.or('status.eq.hide,status.eq.hidden');
        }

        const sortCol = sortBy === 'created_at' || sortBy === 'updated_at' ? 'created_at' : sortBy;
        query = query
          .order(sortCol, { ascending: sortOrder === 'asc' })
          .order('contact_id', { ascending: sortOrder === 'asc' });

        const from = (currentPage - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        setContacts(data || []);
        setTotalCount(count || 0);
      } catch (err: any) {
        console.warn('Error fetching contacts:', err?.message || err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentPage, statusFilter, searchQuery, sortBy, sortOrder, fetchStats]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (searchInputValue === '') {
      setSearchQuery('');
    }
  }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleSortChange = (value: string) => {
    const [newSort, newOrder] = value.split('-') as [any, any];
    setSortBy(newSort);
    setSortOrder(newOrder);
  };

  const handleSaveReply = async () => {
    if (!selectedContact) return;
    setReplyError(null);

    const result = contactReplySchema.safeParse({ selectedStatus, replyText });
    if (!result.success) {
      const msg = result.error.issues[0]?.message || 'Please enter a reply message before marking as Replied.';
      setReplyError(msg);
      scrollToError({ replyText: msg });
      return;
    }

    setIsActionLoading(true);
    try {
      // Stamp replied_at whenever a reply is actually made, regardless of the
      // visibility status (Replied or Hide). Set the timestamp for a new or
      // changed reply, preserve an existing timestamp on status-only edits, and
      // only clear it when there is no reply message at all.
      const trimmedReply = replyText.trim();
      const isNewOrChangedReply =
        !!trimmedReply && replyText !== (selectedContact.reply_message ?? '');
      const repliedAt = trimmedReply
        ? isNewOrChangedReply
          ? new Date().toISOString()
          : selectedContact.replied_at ?? new Date().toISOString()
        : null;

      const { error } = await supabase
        .from('contacts')
        .update({
          reply_message: replyText,
          status: selectedStatus,
          replied_at: repliedAt,
        })
        .eq('contact_id', selectedContact.contact_id);

      if (error) throw error;
      await fetchStats();
      await fetchContacts(true);
      closeReply();
    } catch (err: any) {
      console.error('Error saving reply:', err);
      setReplyError(err?.message || 'Failed to save response. Please try again.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Support Inquiry',
      message:
        'Are you sure you want to permanently delete this support inquiry? This action cannot be undone.',
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const { error } = await supabase.from('contacts').delete().eq('contact_id', id);
      if (error) throw error;
      await fetchStats();
      await fetchContacts();
    } catch (err) {
      console.error('Error deleting inquiry:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Support Inquiries</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Bridge the gap with your user base and manage inquiry resolutions.
          </p>
        </div>
        {!selectedContact && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchContacts(true)}
              disabled={isRefreshing}
              className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              suppressHydrationWarning
            >
              {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
              Refresh
            </Button>
          </div>
        )}
      </div>

      {!selectedContact ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Queries',
                value: stats.all || 0,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Database size={17} />,
                points: sparklines.all || [],
                badge: 'All Inquiries',
              },
              {
                id: 'new',
                label: 'New',
                value: stats.new || 0,
                iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
                badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                sparklineColor: 'text-[#8a652a] dark:text-amber-400',
                icon: <Clock size={17} />,
                points: sparklines.new || [],
                badge: 'Pending',
              },
              {
                id: 'replied',
                label: 'Replied',
                value: stats.replied || 0,
                iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
                badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
                icon: <CheckCircle2 size={17} />,
                points: sparklines.replied || [],
                badge: 'Resolved',
              },
              {
                id: 'hide',
                label: 'Hide',
                value: stats.hide || 0,
                iconStyle: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#474c50] dark:text-zinc-400',
                icon: <EyeOff size={17} />,
                points: sparklines.hide || [],
                badge: 'Hidden',
              },
            ].map((stat) => {
              const isSelected = statusFilter === stat.id;
              return (
                <button
                  key={stat.id}
                  onClick={() => {
                    setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
                    setCurrentPage(1);
                  }}
                  className={`group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col text-left rounded-2xl border shadow-2xs cursor-pointer ${
                    isSelected
                      ? 'bg-[#ebe8e2] dark:bg-zinc-800/90 border-zinc-700 dark:border-zinc-500 shadow-xs'
                      : 'bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30'
                  }`}
                  suppressHydrationWarning
                >
                  <Sparkline
                    color={stat.sparklineColor}
                    points={stat.points}
                    id={stat.id}
                    isSelected={isSelected}
                  />

                  <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 ${stat.iconStyle}`}>
                      {stat.icon}
                    </div>
                    {isSelected ? (
                      <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border bg-zinc-800 text-zinc-100 border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600 shadow-2xs">
                        Selected
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs transition-colors ${stat.badgeStyle}`}>
                        {stat.badge}
                      </span>
                    )}
                  </div>

                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 relative z-10 w-full space-y-1 pointer-events-none">
                    <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
                      {stat.label}
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight leading-none">
                      <CountUp key={refreshKey} end={stat.value} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search & Sort Controls */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search by name, email or subject across all records..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="flex-1 h-11 px-4 text-sm"
                suppressHydrationWarning
              />
              <Button
                type="submit"
                className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95"
                suppressHydrationWarning
              >
                Search
              </Button>
            </div>

            <div className="flex gap-2 min-w-[190px]">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={handleSortChange}
                options={sortOptions}
                className="h-11 min-w-[190px]"
                suppressHydrationWarning
              />
            </div>
          </form>

          {/* Contact Inquiries Table Container */}
          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
                  <Spinner size={20} />
                </div>
              </div>
            )}
            <ContactTable
              contacts={contacts}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onSelectContact={openReply}
              onDelete={handleDelete}
              isLoading={loading}
            />
          </div>
        </>
      ) : (
        /* Standardized Contact Reply & Details View */
        <ContactReplyView
          contact={selectedContact}
          replyText={replyText}
          setReplyText={(text) => {
            setReplyText(text);
            if (replyError) setReplyError(null);
          }}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          onSaveReply={handleSaveReply}
          onClose={closeReply}
          isActionLoading={isActionLoading}
          replyError={replyError}
        />
      )}
    </div>
  );
}
