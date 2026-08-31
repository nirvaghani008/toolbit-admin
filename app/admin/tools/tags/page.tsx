'use client';

import { useState, useEffect, useMemo } from 'react';
import TagTable from '@/components/tags/TagTable';
import TagForm from '@/components/tags/TagForm';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import { buildSearchOrClause } from '@/lib/postgrest-search';
import { Tag, CheckCircle2, EyeOff, FileText, Archive, RefreshCw, Search, X, ShieldAlert } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  createTagAction,
  updateTagAction,
  updateTagStatusAction,
  deleteTagAction
} from './actions';

const STATUS_METADATA: Record<string, { label: string; badge: string; icon: React.ReactNode; iconStyle: string; badgeStyle: string; sparklineColor: string }> = {
  show: {
    label: 'Show',
    badge: 'Active',
    icon: <CheckCircle2 size={17} />,
    iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    sparklineColor: 'text-[#3c5748] dark:text-emerald-400'
  },
  hide: {
    label: 'Hide',
    badge: 'Hidden',
    icon: <EyeOff size={17} />,
    iconStyle: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
    badgeStyle: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
    sparklineColor: 'text-[#474c50] dark:text-zinc-400'
  },
  draft: {
    label: 'Draft',
    badge: 'Draft',
    icon: <FileText size={17} />,
    iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
    badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    sparklineColor: 'text-[#8a652a] dark:text-amber-400'
  },
  archived: {
    label: 'Archived',
    badge: 'Archived',
    icon: <Archive size={17} />,
    iconStyle: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
    badgeStyle: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
    sparklineColor: 'text-[#6e5e50] dark:text-violet-400'
  }
};

function getStatusMeta(st: string) {
  const lower = (st || '').toLowerCase();
  if (STATUS_METADATA[lower]) return STATUS_METADATA[lower];
  const cap = st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Unknown';
  return {
    label: cap,
    badge: cap,
    icon: <Tag size={17} />,
    iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
    badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
    sparklineColor: 'text-[#364954] dark:text-zinc-400'
  };
}

export default function TagsPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'tags' module
  const canView = isSuperAdmin || hasPermission('tags', 'view');
  const canInsert = isSuperAdmin || hasPermission('tags', 'insert');
  const canUpdate = isSuperAdmin || hasPermission('tags', 'update');
  const canDelete = isSuperAdmin || hasPermission('tags', 'delete');

  const [tags, setTags] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>(['show', 'hide']);
  const [stats, setStats] = useState<Record<string, number>>({
    all: 0,
    show: 0,
    hide: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    show: [0, 0, 0, 0, 0, 0, 0],
    hide: [0, 0, 0, 0, 0, 0, 0]
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'name'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null);

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingTag(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingTag(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openForm = (tag: any = null) => {
    if (tag && !canUpdate) {
      alert('Access denied: You do not have permission to edit tags.');
      return;
    }
    if (!tag && !canInsert) {
      alert('Access denied: You do not have permission to create tags.');
      return;
    }
    setEditingTag(tag);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: tag }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingTag(null);
      if (window.history.state?.formOpen) {
        window.history.back();
      }
    }
  };

  const fetchStats = async (forceRefresh = false) => {
    if (!canView) return;
    try {
      // 1. Fetch unique status values directly from tags table in Supabase
      const { data: statusRows } = await supabase
        .from('tags')
        .select('status')
        .limit(2000);

      const discoveredStatuses: string[] = [];
      const seen = new Set<string>();

      if (statusRows && statusRows.length > 0) {
        statusRows.forEach((row: any) => {
          if (row.status && typeof row.status === 'string') {
            const clean = row.status.trim().toLowerCase();
            if (clean && !seen.has(clean)) {
              seen.add(clean);
              discoveredStatuses.push(clean);
            }
          }
        });
      }

      // If 'show' and 'hide' exist, maintain standard order; otherwise use discovered statuses
      const orderedStatuses: string[] = [];
      ['show', 'hide', 'draft', 'archived'].forEach((standardStatus) => {
        if (seen.has(standardStatus)) {
          orderedStatuses.push(standardStatus);
          seen.delete(standardStatus);
        }
      });
      // Append any other unique custom statuses
      seen.forEach((customStatus) => {
        orderedStatuses.push(customStatus);
      });

      const finalStatuses = orderedStatuses.length > 0 ? orderedStatuses : ['show', 'hide'];
      setUniqueStatuses(finalStatuses);

      // 2. Fetch counts and sparklines for discovered unique statuses
      const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
        'tags',
        finalStatuses,
        'updated_at',
        7,
        forceRefresh
      );

      const statsObj: Record<string, number> = { all: counts.total || 0 };
      finalStatuses.forEach((st) => {
        statsObj[st] = counts[st] || 0;
      });

      setStats(statsObj);
      setSparklines(trends);
    } catch (err: any) {
      console.warn('Error fetching tag stats:', err?.message || err);
    }
  };

  const fetchTags = async (manual = false) => {
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      const tagsQueryPromise = (async () => {
        let query = supabase
          .from('tags')
          .select('id, name, slug, parent_tag, tool_count, views, status, updated_at, meta_title, meta_description, meta_keywords, description', { count: 'exact' });

        // Apply Search across name, slug, and parent_tag with strict sanitization
        const searchOrClause = buildSearchOrClause(
          ['name', 'slug', 'parent_tag'],
          searchQuery.replace(/^#+/, '')
        );
        if (searchOrClause) {
          query = query.or(searchOrClause);
        }

        // Apply Status Filter
        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }

        // Apply Sorting
        const sortCol = (sortBy === 'created_at' || sortBy === 'updated_at') ? 'updated_at' : sortBy;
        query = query.order(sortCol, { ascending: sortOrder === 'asc' }).order('id', { ascending: sortOrder === 'asc' });

        // Apply Pagination
        const from = (currentPage - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        return await query;
      })();

      const [queryResult] = await Promise.all([
        tagsQueryPromise,
        manual ? fetchStats(true) : Promise.resolve()
      ]);

      const { data, count, error } = queryResult;

      if (error) throw error;
      setTags(data || []);
      setTotalCount(count || 0);

      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching tags:', err?.message || err);
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
      fetchTags();
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
    setSearchQuery(searchInputValue.trim());
  };

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const handleAddTag = async (formData: any) => {
    if (!canInsert) {
      throw new Error('Access denied: You do not have permission to create tags.');
    }
    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await createTagAction(formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create tag.');
      }

      await fetchTags(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding tag:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateTag = async (formData: any) => {
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to edit tags.');
    }
    setIsActionLoading(true);
    try {
      const targetId = editingTag?.id;
      if (!targetId) throw new Error('Missing tag ID for update.');

      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await updateTagAction(targetId, formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update tag.');
      }

      await fetchTags(true);
      closeForm();
    } catch (err: any) {
      console.error('Error updating tag:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusChange = async (tagId: number | string, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update tag status.');
      return;
    }
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateTagStatusAction(tagId, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update tag status.');
      }

      await fetchTags(true);
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error';
      console.error('Error updating tag status:', errorMsg);
      alert('Failed to update tag status: ' + errorMsg);
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteTag = async (id: number, name?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete tags.');
      return;
    }
    const confirmed = await confirmDelete({
      title: 'Delete Tag',
      itemName: name,
      message: 'Are you sure you want to permanently delete this tag? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteTagAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete tag.');
      }

      await fetchTags(true);
    } catch (err: any) {
      console.error('Error deleting tag:', err);
      alert(err.message || 'Failed to delete tag.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const statCards = useMemo(() => {
    const cards = [
      {
        id: 'all',
        label: 'Total Tags',
        value: stats.all || 0,
        iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
        badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
        sparklineColor: 'text-[#364954] dark:text-zinc-400',
        icon: <Tag size={17} />,
        points: sparklines['all'] || [0, 0, 0, 0, 0, 0, 0],
        badge: 'All Tags'
      },
      ...uniqueStatuses.map((st) => {
        const meta = getStatusMeta(st);
        return {
          id: st,
          label: meta.label,
          value: stats[st] || 0,
          iconStyle: meta.iconStyle,
          badgeStyle: meta.badgeStyle,
          sparklineColor: meta.sparklineColor,
          icon: meta.icon,
          points: sparklines[st] || [0, 0, 0, 0, 0, 0, 0],
          badge: meta.badge
        };
      })
    ];
    return cards;
  }, [stats, sparklines, uniqueStatuses]);

  const gridColsClass = useMemo(() => {
    if (statCards.length <= 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6';
    if (statCards.length === 3) return 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6';
    if (statCards.length === 4) return 'grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6';
    return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6';
  }, [statCards.length]);

  // While authenticating, show spinner
  if (isAuthorized === null) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  // Unauthorized state for subadmins lacking tags permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or manage Tags.
          Please contact a Super Administrator if you require access to this section.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Tags Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage platform-wide tags and discoverability labels.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchTags(true)}
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
                + New Tag
              </Button>
            )}
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Dynamic Unique Stats Bar */}
          <div className={gridColsClass}>
            {statCards.map((stat) => {
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

          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                <Input
                  type="text"
                  placeholder="Search across all tags (name, slug, parent tag)..."
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                  className="w-full h-11 pl-10 pr-9 text-sm"
                  suppressHydrationWarning
                />
                {searchInputValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInputValue('');
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded-md cursor-pointer transition-colors"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <Button
                type="submit"
                className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 cursor-pointer"
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
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </Select>
            </div>
          </form>

          {/* Table Container */}
          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
                  <Spinner size={20} />
                </div>
              </div>
            )}
            <TagTable
              tags={tags}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={(t) => openForm(t)}
              onDelete={handleDeleteTag}
              onStatusChange={handleStatusChange}
              availableStatuses={uniqueStatuses}
              isLoading={loading}
            />
          </div>
        </>
      ) : (
        <div className="animate-fade-in-up">
          <StickyFormBackButton
            label="Back to Overview"
            onClick={closeForm}
            isLoading={isActionLoading}
          />
          <TagForm
            key={editingTag?.id ? `edit-${editingTag.id}` : 'new-tag'}
            initialData={editingTag}
            availableStatuses={uniqueStatuses}
            onSubmit={editingTag ? handleUpdateTag : handleAddTag}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}
    </div>
  );
}


