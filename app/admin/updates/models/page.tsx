'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import ModelTable, { Model } from '@/components/models/ModelTable';
import ModelForm from '@/components/models/ModelForm';
import { useAdmin } from '@/contexts/AdminContext';
import {
  getModelsAction,
  getModelStatsAction,
  createModelAction,
  updateModelAction,
  updateModelStatusAction,
  deleteModelAction,
} from './actions';

import CountUp from '@/components/common/CountUp';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { 
  RefreshCw, Cpu, CheckCircle2, EyeOff, Trash2, ShieldAlert, Lock
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function ModelsPage() {
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Permission flags for AI Models module
  const canView = isSuperAdmin || hasPermission('models', 'view');
  const canInsert = isSuperAdmin || hasPermission('models', 'insert');
  const canUpdate = isSuperAdmin || hasPermission('models', 'update');
  const canDelete = isSuperAdmin || hasPermission('models', 'delete');

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

  // Retrieve current user JWT token for server actions
  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

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
    if (!model && !canInsert) {
      alert('Access denied: You do not have permission to create AI models.');
      return;
    }
    if (model && !canUpdate) {
      alert('Access denied: You do not have permission to edit AI models.');
      return;
    }
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
    hide: 0,
    delete: 0,
  });

  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    show: [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0],
    delete: [0, 0, 0, 0, 0, 0, 0],
  });

  const confirmDelete = useConfirm();

  // Fetch stats & sparklines using Server Action (service_role key + RBAC)
  const fetchStats = useCallback(async () => {
    if (!canView) return;
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await getModelStatsAction(token);
      if (res.success && res.stats) {
        setStats(res.stats);
        if (res.sparklines) {
          setSparklines(res.sparklines);
        }
      } else if (res.error) {
        console.warn('Error fetching model stats:', res.error);
      }
    } catch (err) {
      console.warn('Error fetching model stats:', err);
    }
  }, [canView]);

  // Fetch models using Server Action (service_role key + RBAC)
  const fetchModels = useCallback(async (manual = false) => {
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await getModelsAction({
        page: currentPage,
        pageSize,
        search: searchQuery,
        status: statusFilter,
        sortBy,
        sortOrder,
      }, token);

      if (res.success && res.data) {
        setModels(res.data);
        if (res.count !== undefined) {
          setTotalCount(res.count);
        }
        setRefreshKey(prev => prev + 1);
      } else if (res.error) {
        console.error('Error fetching models:', res.error);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [canView, currentPage, pageSize, searchQuery, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (isAuthorized && canView) {
      fetchStats();
    }
  }, [isAuthorized, canView, fetchStats]);

  useEffect(() => {
    if (isAuthorized && canView) {
      fetchModels();
    }
  }, [isAuthorized, canView, fetchModels]);

  const handleDeleteModel = async (id: number) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete AI models.');
      return;
    }

    const confirmed = await confirmDelete({
      title: 'Delete AI Model',
      message: 'Are you sure you want to permanently delete this AI Model record? This action cannot be undone.'
    });
    if (!confirmed) return;

    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      const res = await deleteModelAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Error deleting model');
      }

      await fetchStats();
      await fetchModels(true);
    } catch (err: any) {
      alert(err?.message || 'Error deleting model');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditModel = (model: Model) => {
    openForm(model);
  };

  const handleStatusChange = async (id: number | string, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update AI models.');
      return;
    }

    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      const res = await updateModelStatusAction(id, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update status');
      }

      // Optimistically update the local list
      setModels(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m));
      await fetchStats();
    } catch (err: any) {
      console.error('Error updating model status:', err);
      alert('Failed to update model status: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveModel = async (data: Partial<Model>) => {
    if (!editingModel) return;
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to edit AI models.');
    }

    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      const res = await updateModelAction(editingModel.id, data, token);
      if (!res.success) {
        throw new Error(res.error || 'An error occurred while saving model.');
      }

      await fetchStats();
      await fetchModels(true);
      closeForm();
    } catch (err: any) {
      console.error('Error saving model:', err.message || err);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateModel = async (data: Partial<Model>) => {
    if (!canInsert) {
      throw new Error('Access denied: You do not have permission to create AI models.');
    }

    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      const res = await createModelAction(data, token);
      if (!res.success) {
        throw new Error(res.error || 'An error occurred while creating model.');
      }

      await fetchStats();
      await fetchModels(true);
      closeForm();
    } catch (err: any) {
      console.error('Error creating model:', err.message || err);
      throw err;
    } finally {
      setIsActionLoading(false);
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

  // If authenticated but lacks view permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Denied</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view the AI Models database.
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">AI Models Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage foundational LLMs, multimodal, image, audio, and open-source models.</p>
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
              {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
              Refresh
            </Button>
            {canInsert && (
              <Button 
                onClick={() => openForm()} 
                className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold shadow-xs active:scale-95"
                suppressHydrationWarning
              >
                + New Model
              </Button>
            )}
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
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
              {
                id: 'delete',
                label: 'Delete',
                value: stats.delete,
                iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
                badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                sparklineColor: 'text-[#824235] dark:text-rose-400',
                icon: <Trash2 size={17} />,
                points: sparklines.delete,
                badge: 'Deleted'
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
          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
                  <Spinner size={20} />
                </div>
              </div>
            )}
            <ModelTable
              models={models}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={handleEditModel}
              onDelete={handleDeleteModel}
              onStatusChange={handleStatusChange}
              isLoading={isLoading}
              canEdit={canUpdate}
              canDelete={canDelete}
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
          <ModelForm
            initialData={editingModel}
            onSubmit={editingModel ? handleSaveModel : handleCreateModel}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}
    </div>
  );
}
