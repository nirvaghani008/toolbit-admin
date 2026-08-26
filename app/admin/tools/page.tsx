'use client';

import { useState, useEffect } from 'react';
import ToolTable from '@/components/tools/ToolTable';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import { Database, CheckCircle2, AlertTriangle, AlertCircle, EyeOff, PauseCircle, RefreshCw } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import dynamic from 'next/dynamic';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const ToolForm = dynamic(() => import('@/components/tools/ToolForm'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-sm font-bold text-[var(--text-muted)] animate-pulse">Loading Tool Form Component...</div>
});

export default function ToolsPage() {
  const confirmDelete = useConfirm();
  const [tools, setTools] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    show: 0,
    showInvalid: 0,
    showError: 0,
    hide: 0,
    error: 0,
    archived: 0,
    showInactive: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    show: [0, 0, 0, 0, 0, 0, 0],
    'show:invalid': [0, 0, 0, 0, 0, 0, 0],
    'show:error': [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0],
    error: [0, 0, 0, 0, 0, 0, 0],
    archived: [0, 0, 0, 0, 0, 0, 0],
    'show:inactive': [0, 0, 0, 0, 0, 0, 0]
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'show' | 'show:invalid' | 'show:error' | 'hide' | 'error' | 'archived' | 'show:inactive'>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'tool_name'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<any>(null);

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingTool(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingTool(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync state to history when form opens manually
  const openForm = (tool: any = null) => {
    setEditingTool(tool);
    setShowForm(true);
    // Push new state to history
    window.history.pushState({ formOpen: true, editingData: tool }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingTool(null);
      // If we are currently in the form state in history, go back
      if (window.history.state?.formOpen) {
        window.history.back();
      }
    }
  };


  const fetchStats = async () => {
    try {
      const statusList = ['show', 'show:invalid', 'show:error', 'hide', 'error', 'archived', 'show:inactive'];
      const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
        'ai_tools',
        statusList,
        'updated_at',
        7
      );

      setStats({
        all: counts.total || 0,
        show: counts.show || 0,
        showInvalid: counts['show:invalid'] || 0,
        showError: counts['show:error'] || 0,
        hide: counts.hide || 0,
        error: counts.error || 0,
        archived: counts.archived || 0,
        showInactive: counts['show:inactive'] || 0
      });

      setSparklines({
        all: trends['all'] || [],
        show: trends['show'] || [],
        'show:invalid': trends['show:invalid'] || [],
        'show:error': trends['show:error'] || [],
        hide: trends['hide'] || [],
        error: trends['error'] || [],
        archived: trends['archived'] || [],
        'show:inactive': trends['show:inactive'] || []
      });
    } catch (err: any) {
      console.warn('Error fetching stats:', err?.message || err);
    }
  };

  const fetchTools = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      // Also refresh stats when we refresh tools
      if (manual) fetchStats();

      let query = supabase
        .from('ai_tools')
        .select('*', { count: 'exact' });

      // Apply Search (Search across name, URL, or status name)
      if (searchQuery) {
        query = query.or(`tool_url.ilike.%${searchQuery}%,status.ilike.%${searchQuery}%,tool_info->>toolName.ilike.%${searchQuery}%`);
      }

      // Apply Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply Sorting
      // If sorting by tool_name, we need to target tool_info->>toolName
      const orderColumn = sortBy === 'tool_name' ? 'tool_info->>toolName' : sortBy;
      query = query.order(orderColumn, { ascending: sortOrder === 'asc' }).order('tool_id', { ascending: sortOrder === 'asc' });

      // Apply Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      setTools(data || []);
      setTotalCount(count || 0);
      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching tools:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchTools();
  }, [currentPage, statusFilter, sortBy, sortOrder, searchQuery]);

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

  // Server-side filtering is handled in fetchTools
  const filteredTools = tools;

  const handleAddTool = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('ai_tools').insert([formData]);
      if (error) throw error;

      // Auto refresh stats and tools
      await fetchStats();
      await fetchTools(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding tool:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This tool URL slug is already in use.');
      }
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateTool = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('ai_tools')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('tool_id', editingTool.tool_id);

      if (error) throw error;

      await fetchStats();
      await fetchTools(true);

      closeForm();
    } catch (err: any) {
      console.error('Error updating tool:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This tool URL slug is already in use.');
      }
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusChange = async (toolId: number | string, newStatus: string) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('ai_tools')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('tool_id', toolId);

      if (error) throw error;

      // Optimistically update tools in local state
      setTools(prev => prev.map(t => t.tool_id === toolId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t));
      await fetchStats();
    } catch (err: any) {
      console.error('Error updating tool status:', err);
      alert('Failed to update tool status: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteTool = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete AI Tool',
      message: 'Are you sure you want to permanently delete this AI tool? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('ai_tools').delete().eq('tool_id', id);
      if (error) throw error;

      await fetchStats();
      await fetchTools(true);
    } catch (err) {
      console.error('Error deleting tool:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">AI Tools Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Full management of platform entries and metadata.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchTools(true)}
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
              + New Tool
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar - 6 Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Tools',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Database size={17} />,
                points: sparklines.all,
                badge: 'All Tools'
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
                id: 'show:invalid',
                label: 'Show: Invalid',
                value: stats.showInvalid,
                iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
                badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                sparklineColor: 'text-[#8a652a] dark:text-amber-400',
                icon: <AlertTriangle size={17} />,
                points: sparklines['show:invalid'],
                badge: 'Invalid'
              },
              {
                id: 'show:error',
                label: 'Show: Error',
                value: stats.showError,
                iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
                badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                sparklineColor: 'text-[#824235] dark:text-rose-400',
                icon: <AlertCircle size={17} />,
                points: sparklines['show:error'],
                badge: 'Error'
              },
              {
                id: 'show:inactive',
                label: 'Show: Inactive',
                value: stats.showInactive,
                iconStyle: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
                badgeStyle: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
                sparklineColor: 'text-[#6e5e50] dark:text-violet-400',
                icon: <PauseCircle size={17} />,
                points: sparklines['show:inactive'],
                badge: 'Inactive'
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
                  onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id as any); setCurrentPage(1); }}
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

          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search across all tools (name or URL)..."
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

            <div className="flex gap-2">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [any, any];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                }}
                className="h-11 min-w-[180px]"
                suppressHydrationWarning
              >
                <option value="updated_at-desc">Last Updated</option>
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="tool_name-asc">Name (A-Z)</option>
                <option value="tool_name-desc">Name (Z-A)</option>
              </Select>
            </div>
          </form>

          <div>
            <ToolTable
              tools={filteredTools}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={(t) => openForm(t)}
              onDelete={handleDeleteTool}
              onStatusChange={handleStatusChange}
              isLoading={loading}
            />
          </div>
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
          <ToolForm initialData={editingTool} onSubmit={editingTool ? handleUpdateTool : handleAddTool} onCancel={closeForm} />
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}

