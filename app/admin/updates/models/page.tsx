'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import ModelTable, { Model } from '@/components/models/ModelTable';
import ModelForm from '@/components/models/ModelForm';

import CountUp from '@/components/common/CountUp';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { 
  RefreshCw, Cpu, CheckCircle2, FileText, Archive, EyeOff 
} from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form View State (Full Page matching Tool & Category Forms)
  const [showForm, setShowForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  // Filters, Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 12;

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingModel(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingModel(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openForm = (model: Model | null = null) => {
    setEditingModel(model);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: model }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingModel(null);
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
    draft: 0,
    archived: 0,
    hide: 0,
  });

  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    show: [0, 0, 0, 0, 0, 0, 0],
    draft: [0, 0, 0, 0, 0, 0, 0],
    archived: [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0],
  });

  const confirmDelete = useConfirm();

  // Fetch stats & sparklines
  const fetchStats = useCallback(async () => {
    try {
      const statusList = ['show', 'draft', 'archived', 'hide'];
      const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
        'models',
        statusList,
        'release_date',
        7
      );

      // Fetch exact count of active/show model items
      const { count: liveShowCount } = await supabase
        .from('models')
        .select('*', { count: 'exact', head: true })
        .or('status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null');

      setStats({
        all: counts['total'] || 0,
        show: (counts['show'] && counts['show'] > 0) ? counts['show'] : (liveShowCount || 0),
        draft: counts['draft'] || 0,
        archived: counts['archived'] || 0,
        hide: counts['hide'] || 0,
      });

      if (trends) {
        setSparklines(prev => ({
          ...prev,
          ...trends,
          show: (trends['show'] && trends['show'].some(n => n > 0)) ? trends['show'] : (trends['all'] || [0,0,0,0,0,0,0])
        }));
      }
    } catch (err) {
      console.warn('Error fetching model stats:', err);
    }
  }, []);

  // Fetch models from Supabase
  const fetchModels = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let query = supabase.from('models').select('*', { count: 'exact' });

      if (statusFilter === 'show') {
        query = query.or('status.eq.show,status.eq.published,status.eq.active,status.ilike.show%,status.is.null');
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,provider.ilike.%${searchQuery}%`);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const sortCol = (sortBy === 'created_at' || sortBy === 'id') ? 'id' : sortBy;
      query = query.order(sortCol, { ascending: sortOrder === 'asc' }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setModels(data || []);
      if (count !== null && count !== undefined) {
        setTotalCount(count);
      }
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, pageSize, searchQuery, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDeleteModel = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete AI Model',
      message: 'Are you sure you want to permanently delete this AI Model record? This action cannot be undone.'
    });
    if (!confirmed) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('models').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchModels(true);
    } catch (err: any) {
      alert(err?.message || 'Error deleting model');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditModel = (model: Model) => {
    openForm(model);
  };

  const handleSaveModel = async (data: Partial<Model>) => {
    if (!editingModel) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('models')
        .update(data)
        .eq('id', editingModel.id);
      if (error) throw error;
      await fetchStats();
      await fetchModels(true);
      closeForm();
    } catch (err: any) {
      console.error('Error saving model:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This AI model URL slug is already in use.');
      }
      throw new Error(err.message || 'An error occurred while saving model.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateModel = async (data: Partial<Model>) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('models')
        .insert([data]);
      if (error) throw error;
      await fetchStats();
      await fetchModels(true);
      closeForm();
    } catch (err: any) {
      console.error('Error creating model:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This AI model URL slug is already in use.');
      }
      throw new Error(err.message || 'An error occurred while creating model.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">AI Models Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage AI models, providers, context windows, and availability status.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              onClick={() => fetchModels(true)} 
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
              + New Model
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
                label: 'Total Models',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Cpu size={17} />,
                points: sparklines.all,
                badge: 'All Models'
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
                id: 'archived',
                label: 'Archived',
                value: stats.archived,
                iconStyle: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
                badgeStyle: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
                sparklineColor: 'text-[#6e5e50] dark:text-violet-400',
                icon: <Archive size={17} />,
                points: sparklines.archived,
                badge: 'Archived'
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
                placeholder="Search model name or provider..."
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

            <div className="flex gap-2">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [string, 'asc' | 'desc'];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[180px]"
                suppressHydrationWarning
              >
                <option value="id-desc">Newest First</option>
                <option value="id-asc">Oldest First</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </Select>
            </div>
          </form>

          {/* Table */}
          <ModelTable
            models={models}
            totalCount={totalCount}
            pageSize={pageSize}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onEdit={handleEditModel}
            onDelete={handleDeleteModel}
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
          <ModelForm
            initialData={editingModel}
            onSubmit={editingModel ? handleSaveModel : handleCreateModel}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}


