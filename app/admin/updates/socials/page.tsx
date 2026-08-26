'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import SocialTable, { SocialItem } from '@/components/socials/SocialTable';
import SocialForm from '@/components/socials/SocialForm';

import CountUp from '@/components/common/CountUp';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import {
  RefreshCw, Share2, CheckCircle2, EyeOff, FileText, Star, ArrowLeft
} from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function SocialsPage() {
  const [socialsList, setSocialsList] = useState<SocialItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form View State (Full Page matching Model & Tool Forms)
  const [showForm, setShowForm] = useState(false);
  const [editingSocial, setEditingSocial] = useState<SocialItem | null>(null);

  // Filters, Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingSocial(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingSocial(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openForm = (item: SocialItem | null = null) => {
    setEditingSocial(item);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: item }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingSocial(null);
      if (window.history.state?.formOpen) {
        window.history.back();
      }
    }
  };

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  // Stats & Sparklines
  const [stats, setStats] = useState({
    all: 0,
    show: 0,
    hide: 0,
    draft: 0,
    featured: 0
  });

  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    show: [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0],
    draft: [0, 0, 0, 0, 0, 0, 0],
    featured: [0, 0, 0, 0, 0, 0, 0]
  });

  const confirmDelete = useConfirm();

  // Fetch stats & sparklines
  const fetchStats = useCallback(async () => {
    try {
      const statusList = ['show', 'hide', 'draft'];
      const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
        'socials',
        statusList,
        'created_at',
        7
      );

      // Fetch exact count of active/show posts (including show, published, active, or null)
      const { count: liveShowCount } = await supabase
        .from('socials')
        .select('*', { count: 'exact', head: true })
        .or('status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null');

      // Fetch count of featured posts
      const { count: featuredCount } = await supabase
        .from('socials')
        .select('*', { count: 'exact', head: true })
        .eq('is_featured', true);

      setStats({
        all: counts['total'] || 0,
        show: (counts['show'] && counts['show'] > 0) ? counts['show'] : (liveShowCount || 0),
        hide: counts['hide'] || 0,
        draft: counts['draft'] || 0,
        featured: featuredCount || 0
      });

      if (trends) {
        setSparklines(prev => ({
          ...prev,
          ...trends,
          show: (trends['show'] && trends['show'].some(n => n > 0)) ? trends['show'] : (trends['all'] || [0,0,0,0,0,0,0])
        }));
      }
    } catch (err) {
      console.warn('Error fetching socials stats:', err);
    }
  }, []);

  // Fetch socials from Supabase
  const fetchSocials = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let query = supabase.from('socials').select('*', { count: 'exact' });

      if (statusFilter === 'show') {
        query = query.or('status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null');
      } else if (statusFilter === 'featured') {
        query = query.eq('is_featured', true);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (platformFilter !== 'all') {
        query = query.eq('platform', platformFilter);
      }

      if (searchQuery.trim()) {
        const term = searchQuery.trim();
        const KNOWN_PLATFORMS = ['YouTube', 'X (Twitter)', 'Reddit', 'Instagram'];
        const matchedPlatforms = KNOWN_PLATFORMS.filter(p => p.toLowerCase().includes(term.toLowerCase()));

        if (matchedPlatforms.length > 0) {
          const platformConds = matchedPlatforms.map(p => `platform.eq.${p}`).join(',');
          query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,${platformConds}`);
        } else {
          query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
        }
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const sortCol = (sortBy === 'created_at' || sortBy === 'id') ? 'id' : sortBy;
      query = query.order(sortCol, { ascending: sortOrder === 'asc' }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setSocialsList(data || []);
      if (count !== null && count !== undefined) {
        setTotalCount(count);
      }
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error fetching socials:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, pageSize, platformFilter, searchQuery, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSocials();
  }, [fetchSocials]);

  const handleDeleteSocial = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Social Post',
      message: 'Are you sure you want to permanently delete this social post update? This action cannot be undone.'
    });
    if (!confirmed) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('socials').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchSocials(true);
    } catch (err: any) {
      alert(err?.message || 'Error deleting social post');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditSocial = (item: SocialItem) => {
    openForm(item);
  };

  const handleSaveSocial = async (data: Partial<SocialItem>) => {
    if (!editingSocial) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('socials')
        .update(data)
        .eq('id', editingSocial.id);
      if (error) throw error;
      await fetchStats();
      await fetchSocials(true);
      closeForm();
    } catch (err: any) {
      console.error('Error saving social post:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate record. This social post item already exists.');
      }
      throw new Error(err.message || 'An error occurred while saving social post.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateSocial = async (data: Partial<SocialItem>) => {
    setIsActionLoading(true);
    try {
      let insertPayload: Record<string, any> = { ...data };
      const { data: maxIdData } = await supabase.from('socials').select('id').order('id', { ascending: false }).limit(1);
      if (maxIdData && maxIdData.length > 0 && maxIdData[0].id) {
        insertPayload.id = maxIdData[0].id + 1;
      }

      const { error } = await supabase.from('socials').insert([insertPayload]);
      if (error) {
        // Fallback retry without explicit ID if identity handles sequence automatically
        const { error: retryError } = await supabase.from('socials').insert([data]);
        if (retryError) throw retryError;
      }
      await fetchStats();
      await fetchSocials(true);
      closeForm();
    } catch (err: any) {
      console.error('Error creating social post:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate record. This social post item already exists.');
      }
      throw new Error(err.message || 'An error occurred while creating social post.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Social Updates Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage social media posts, announcements, and community updates.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchSocials(true)}
              disabled={isRefreshing}
              className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              suppressHydrationWarning
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-zinc-500' : ''} />
              {isRefreshing ? 'Syncing...' : 'Refresh'}
            </Button>
            <Button
              onClick={() => openForm()}
              className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold shadow-xs active:scale-95"
              suppressHydrationWarning
            >
              + New Social Update
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Socials',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Share2 size={17} />,
                points: sparklines.all,
                badge: 'All Socials'
              },
              {
                id: 'show',
                label: 'Show',
                value: stats.show,
                iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
                badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
                icon: <CheckCircle2 size={17} />,
                points: sparklines.show,
                badge: 'Active'
              },
              {
                id: 'featured',
                label: 'Featured',
                value: stats.featured,
                iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
                badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                sparklineColor: 'text-[#8a652a] dark:text-amber-400',
                icon: <Star size={17} />,
                points: sparklines.all,
                badge: 'Featured'
              },
              {
                id: 'draft',
                label: 'Draft',
                value: stats.draft,
                iconStyle: 'text-[#5b4375] bg-[#f7f3f9] border-[#e6deed] dark:text-purple-400 dark:bg-purple-500/10 dark:border-purple-500/20',
                badgeStyle: 'bg-[#f7f3f9] text-[#5b4375] border-[#e6deed] dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
                sparklineColor: 'text-[#5b4375] dark:text-purple-400',
                icon: <FileText size={17} />,
                points: sparklines.draft,
                badge: 'Draft'
              },
              {
                id: 'hide',
                label: 'Hide',
                value: stats.hide,
                iconStyle: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#474c50] dark:text-zinc-400',
                icon: <EyeOff size={17} />,
                points: sparklines.hide,
                badge: 'Hidden'
              },
            ].map((stat) => {
              const isSelected = statusFilter === stat.id;
              return (
                <button
                  key={stat.id}
                  onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id); setCurrentPage(1); }}
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

          {/* Control Bar */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search headline, text, or platform..."
                value={searchInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInputValue(val);
                  if (val.trim() === '') {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }
                }}
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

            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              {/* Platform Filter Dropdown */}
              <Select
                value={platformFilter}
                onChange={(val) => {
                  setPlatformFilter(val);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[140px]"
                suppressHydrationWarning
              >
                <option value="all">All Platforms</option>
                <option value="YouTube">YouTube</option>
                <option value="X (Twitter)">Twitter</option>
                <option value="Instagram">Instagram</option>
                <option value="Reddit">Reddit</option>
              </Select>

              {/* Sort Dropdown */}
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [string, 'asc' | 'desc'];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[170px]"
                suppressHydrationWarning
              >
                <option value="id-desc">Newest First</option>
                <option value="id-asc">Oldest First</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
              </Select>
            </div>
          </form>

          {/* Table */}
          <SocialTable
            socials={socialsList}
            totalCount={totalCount}
            pageSize={pageSize}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onEdit={handleEditSocial}
            onDelete={handleDeleteSocial}
            isLoading={isLoading}
          />
        </>
      ) : (
        <div className="animate-fade-in-up">
          <Button
            variant="ghost"
            onClick={closeForm}
            className="mb-6 text-sm font-bold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 p-2 h-auto gap-2 -ml-2 rounded-lg"
          >
            ← Back to Database
          </Button>
          <SocialForm
            initialData={editingSocial}
            onSubmit={editingSocial ? handleSaveSocial : handleCreateSocial}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}


