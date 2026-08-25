'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import {
  Clock,
  CheckCircle2,
  EyeOff,
  Database,
  RefreshCw,
  Search,
} from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import ContactTable, { Contact } from '@/components/contacts/ContactTable';
import ContactReplyView from '@/components/contacts/ContactReplyView';

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
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openReply = (contact: Contact) => {
    setSelectedContact(contact);
    setReplyText(contact.reply_message || '');
    setSelectedStatus(contact.status === 'hide' || contact.status === 'hidden' ? 'hide' : 'replied');
    window.history.pushState({ contactOpen: true, contactData: contact }, '');
  };

  const closeReply = () => {
    if (selectedContact) {
      setSelectedContact(null);
      setReplyText('');
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

    if (selectedStatus === 'replied' && !replyText.trim()) {
      alert('Please enter a reply message before marking as Replied.');
      return;
    }

    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          reply_message: replyText,
          status: selectedStatus,
          replied_at: selectedStatus === 'replied' ? new Date().toISOString() : null,
        })
        .eq('contact_id', selectedContact.contact_id);

      if (error) throw error;
      await fetchStats();
      await fetchContacts(true);
      closeReply();
    } catch (err: any) {
      console.error('Error saving reply:', err);
      alert(err?.message || 'Failed to save response. Please try again.');
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
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('contacts').delete().eq('contact_id', id);
      if (error) throw error;
      await fetchStats();
      await fetchContacts();
    } catch (err) {
      console.error('Error deleting inquiry:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Support Inquiries</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1 uppercase tracking-wider">
            Bridge the gap with your user base.
          </p>
        </div>
        {!selectedContact && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchContacts(true)}
            disabled={isRefreshing}
            className="gap-2 font-semibold shadow-2xs"
            suppressHydrationWarning
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </Button>
        )}
      </div>

      {!selectedContact ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Queries',
                value: stats.all || 0,
                color: 'text-indigo-500',
                bg: 'bg-indigo-500/10',
                hex: '#6366f1',
                icon: <Database size={18} />,
                points: sparklines.all || [],
              },
              {
                id: 'new',
                label: 'New',
                value: stats.new || 0,
                color: 'text-amber-500',
                bg: 'bg-amber-500/10',
                hex: '#f59e0b',
                icon: <Clock size={18} />,
                points: sparklines.new || [],
              },
              {
                id: 'replied',
                label: 'Replied',
                value: stats.replied || 0,
                color: 'text-emerald-500',
                bg: 'bg-emerald-500/10',
                hex: '#10b981',
                icon: <CheckCircle2 size={18} />,
                points: sparklines.replied || [],
              },
              {
                id: 'hide',
                label: 'Hide',
                value: stats.hide || 0,
                color: 'text-rose-500',
                bg: 'bg-rose-500/10',
                hex: '#f43f5e',
                icon: <EyeOff size={18} />,
                points: sparklines.hide || [],
              },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => {
                  setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
                  setCurrentPage(1);
                }}
                className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col ${
                  statusFilter === stat.id
                    ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md'
                    : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                }`}
                style={
                  statusFilter === stat.id
                    ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` }
                    : undefined
                }
                suppressHydrationWarning
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                    statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${
                      statusFilter === stat.id ? '15' : '05'
                    }, transparent)`,
                  }}
                />

                <Sparkline
                  color={stat.color}
                  points={stat.points}
                  id={stat.id}
                  isSelected={statusFilter === stat.id}
                />

                {statusFilter === stat.id && (
                  <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                    <div
                      className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75"
                      style={{ backgroundColor: stat.hex }}
                    />
                    <div
                      className="relative w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }}
                    />
                  </div>
                )}

                <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}
                  >
                    {stat.icon}
                  </div>
                </div>

                <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                      statusFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {stat.label}
                  </div>
                  <div className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                    <CountUp key={refreshKey} end={stat.value} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Search & Sort Controls */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Search by name, email or subject across all records..."
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                  className="w-full pl-10"
                  suppressHydrationWarning
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
              </div>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm px-5"
                suppressHydrationWarning
              >
                Search
              </Button>
            </div>

            <div className="w-full md:w-56 shrink-0">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={handleSortChange}
                options={sortOptions}
              />
            </div>
          </form>

          {/* Standardized Contact Table */}
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
        </>
      ) : (
        /* Standardized Contact Reply & Details View */
        <ContactReplyView
          contact={selectedContact}
          replyText={replyText}
          setReplyText={setReplyText}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          onSaveReply={handleSaveReply}
          onClose={closeReply}
          isActionLoading={isActionLoading}
        />
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
