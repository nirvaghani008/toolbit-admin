'use client';

import { useState, useEffect, useRef } from 'react';
import ToolTable from '@/components/tools/ToolTable';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import { buildSearchOrClause } from '@/lib/postgrest-search';
import { Database, CheckCircle2, AlertTriangle, AlertCircle, EyeOff, PauseCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import dynamic from 'next/dynamic';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  createToolAction,
  updateToolAction,
  updateToolStatusAction,
  deleteToolAction
} from './actions';

const ToolForm = dynamic(() => import('@/components/tools/ToolForm'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-sm font-bold text-[var(--text-muted)] animate-pulse">Loading Tool Form Component...</div>
});

export default function ToolsPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'tools' module
  const canView = isSuperAdmin || hasPermission('tools', 'view');
  const canInsert = isSuperAdmin || hasPermission('tools', 'insert');
  const canUpdate = isSuperAdmin || hasPermission('tools', 'update');
  const canDelete = isSuperAdmin || hasPermission('tools', 'delete');

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
  const isProgrammaticCloseRef = useRef(false);

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    // Sanitize any stale formOpen state on initial page load / refresh
    if (typeof window !== 'undefined' && window.history.state?.formOpen) {
      window.history.replaceState({ ...window.history.state, formOpen: false, editingData: null }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      if (isProgrammaticCloseRef.current) {
        isProgrammaticCloseRef.current = false;
        setShowForm(false);
        setEditingTool(null);
        if (typeof window !== 'undefined' && window.history.state?.formOpen) {
          window.history.replaceState({ ...window.history.state, formOpen: false, editingData: null }, '');
        }
        return;
      }

      if (e.state?.formOpen) {
        setShowForm(true);
        setEditingTool(e.state.editingData || null);
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
    if (tool && !canUpdate) {
      alert('Access denied: You do not have permission to edit AI tools.');
      return;
    }
    if (!tool && !canInsert) {
      alert('Access denied: You do not have permission to create AI tools.');
      return;
    }
    setEditingTool(tool);
    setShowForm(true);
    // Push new state to history
    window.history.pushState({ formOpen: true, editingData: tool }, '');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTool(null);
    if (typeof window !== 'undefined' && window.history.state?.formOpen) {
      isProgrammaticCloseRef.current = true;
      window.history.back();
    }
  };


  const fetchStats = async () => {
    if (!canView) return;
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
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      // Also refresh stats when we refresh tools
      if (manual) fetchStats();

      let query = supabase
        .from('ai_tools')
        .select('*', { count: 'exact' });

      // Apply Search (Search across name, URL, or status name)
      const searchOrClause = buildSearchOrClause(['tool_url', 'status', 'tool_info->>toolName'], searchQuery);
      if (searchOrClause) {
        query = query.or(searchOrClause);
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
    if (canView) {
      fetchStats();
    }
  }, [canView]);

  useEffect(() => {
    if (canView) {
      fetchTools();
    }
  }, [canView, currentPage, statusFilter, sortBy, sortOrder, searchQuery]);

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

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const handleAddTool = async (formData: any) => {
    if (!canInsert) {
      throw new Error('Access denied: You do not have permission to create AI tools.');
    }
    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await createToolAction(formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create tool.');
      }

      // Auto refresh stats and tools
      await fetchStats();
      await fetchTools(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding tool:', err.message || err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateTool = async (formData: any) => {
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to edit AI tools.');
    }
    setIsActionLoading(true);
    try {
      const targetId = editingTool?.tool_id;
      if (!targetId) throw new Error('Missing tool ID for update.');

      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await updateToolAction(targetId, formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update tool.');
      }

      await fetchStats();
      await fetchTools(true);

      closeForm();
    } catch (err: any) {
      console.error('Error updating tool:', err.message || err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusChange = async (toolId: number | string, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update tool status.');
      return;
    }
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateToolStatusAction(toolId, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update tool status.');
      }

      // Optimistically update tools in local state
      setTools(prev => prev.map(t => t.tool_id === toolId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t));
      await fetchStats();
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error';
      console.error('Error updating tool status:', errorMsg);
      alert('Failed to update tool status: ' + errorMsg);
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteTool = async (id: number, name?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete AI tools.');
      return;
    }
    const confirmed = await confirmDelete({
      title: 'Delete AI Tool',
      itemName: name,
      message: 'Are you sure you want to permanently delete this AI tool? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteToolAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete tool.');
      }

      await fetchStats();
      await fetchTools(true);
    } catch (err: any) {
      console.error('Error deleting tool:', err);
      alert(err.message || 'Failed to delete tool.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // While authenticating, show spinner
  if (isAuthorized === null) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  // Unauthorized state for subadmins lacking tools permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or manage the AI Tools Directory.
          Please contact a Super Administrator if you require access to this section.
        </p>
      </div>
    );
  }

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
              {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
              Refresh
            </Button>
            {canInsert && (
              <Button
                onClick={() => openForm()}
                className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold shadow-xs active:scale-95"
                suppressHydrationWarning
              >
                + New Tool
              </Button>
            )}
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

          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
                  <Spinner size={20} />
                </div>
              </div>
            )}
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
          <StickyFormBackButton
            label="Back to Database"
            onClick={closeForm}
            isLoading={isActionLoading}
          />
          <ToolForm initialData={editingTool} onSubmit={editingTool ? handleUpdateTool : handleAddTool} onCancel={closeForm} isLoading={isActionLoading} />
        </div>
      )}
    </div>
  );
}

