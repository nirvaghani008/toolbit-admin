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
          <div className="flex gap-3">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => fetchModels(true)} 
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
              + New Model
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Hero Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { id: 'all', label: 'Total Models', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Cpu size={18} />, points: sparklines.all },
              { id: 'show', label: 'Show', value: stats.show, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.show },
              { id: 'draft', label: 'Draft', value: stats.draft, color: 'text-cyan-500', bg: 'bg-cyan-500/10', hex: '#06b6d4', icon: <FileText size={18} />, points: sparklines.draft },
              { id: 'archived', label: 'Archived', value: stats.archived, color: 'text-slate-400', bg: 'bg-slate-500/10', hex: '#64748b', icon: <Archive size={18} />, points: sparklines.archived },
              { id: 'hide', label: 'Hide', value: stats.hide, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <EyeOff size={18} />, points: sparklines.hide },
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

            <div className="w-full md:w-56">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [string, 'asc' | 'desc'];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                  setCurrentPage(1);
                }}
                className="h-11 font-semibold"
                suppressHydrationWarning
              >
                <option value="id-desc">Newest First</option>
                <option value="id-asc">Oldest First</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </Select>
            </div>
          </div>

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
            variant="link"
            onClick={closeForm}
            className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-2 p-0 h-auto cursor-pointer"
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
