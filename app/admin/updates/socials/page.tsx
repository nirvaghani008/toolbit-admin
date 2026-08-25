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
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSocials(true)}
              disabled={isRefreshing}
              className="h-9 px-4 font-semibold text-xs rounded-xl"
              suppressHydrationWarning
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
              {isRefreshing ? 'Syncing...' : 'Refresh'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => openForm()}
              className="h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 rounded-xl"
              suppressHydrationWarning
            >
              + New Social Update
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Hero Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { id: 'all', label: 'Total Socials', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Share2 size={18} />, points: sparklines.all },
              { id: 'show', label: 'Show', value: stats.show, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.show },
              { id: 'featured', label: 'Featured', value: stats.featured, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <Star size={18} />, points: sparklines.all },
              { id: 'draft', label: 'Draft', value: stats.draft, color: 'text-cyan-500', bg: 'bg-cyan-500/10', hex: '#06b6d4', icon: <FileText size={18} />, points: sparklines.draft },
              { id: 'hide', label: 'Hide', value: stats.hide, color: 'text-slate-400', bg: 'bg-slate-500/10', hex: '#64748b', icon: <EyeOff size={18} />, points: sparklines.hide },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id); setCurrentPage(1); }}
                className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col ${statusFilter === stat.id ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md' : 'bg-[var(--bg-surface)] border-[var(--border-color)]'}`}
                style={statusFilter === stat.id ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` } : undefined}
                suppressHydrationWarning
              >
                <div className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} style={{ backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${statusFilter === stat.id ? '15' : '05'}, transparent)` }} />

                <Sparkline color={stat.color} points={stat.points} id={stat.id} isSelected={statusFilter === stat.id} />

                {statusFilter === stat.id && (
                  <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                    <div className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75" style={{ backgroundColor: stat.hex }} />
                    <div className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }} />
                  </div>
                )}

                <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}>
                    {stat.icon}
                  </div>
                </div>

                <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
                  <div className={`text-[10px] font-bold uppercase tracking-wider truncate ${statusFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'}`}>
                    {stat.label}
                  </div>
                  <div className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                    <CountUp key={refreshKey} end={stat.value} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Control Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="flex-1 h-11 px-4 text-sm font-medium"
                suppressHydrationWarning
              />
              <Button
                type="button"
                variant="default"
                onClick={() => handleSearch()}
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-600/10 active:scale-95"
                suppressHydrationWarning
              >
                Search
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Platform Filter Dropdown */}
              <div className="w-full sm:w-40">
                <Select
                  value={platformFilter}
                  onChange={(val) => {
                    setPlatformFilter(val);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All Platforms' },
                    { value: 'YouTube', label: 'YouTube' },
                    { value: 'X (Twitter)', label: 'Twitter' },
                    { value: 'Instagram', label: 'Instagram' },
                    { value: 'Reddit', label: 'Reddit' },
                  ]}
                  className="h-11 font-semibold"
                  suppressHydrationWarning
                />
              </div>

              {/* Sort Dropdown */}
              <div className="w-full sm:w-48">
                <Select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(val) => {
                    const [newSort, newOrder] = val.split('-') as [string, 'asc' | 'desc'];
                    setSortBy(newSort);
                    setSortOrder(newOrder);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'id-desc', label: 'Newest First' },
                    { value: 'id-asc', label: 'Oldest First' },
                    { value: 'title-asc', label: 'Title (A-Z)' },
                    { value: 'title-desc', label: 'Title (Z-A)' },
                  ]}
                  className="h-11 font-semibold"
                  suppressHydrationWarning
                />
              </div>
            </div>
          </div>

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
            className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 flex items-center gap-2 px-3 py-2 rounded-xl"
          >
            <ArrowLeft size={16} /> Back to Database
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
