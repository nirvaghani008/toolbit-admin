'use client';

import { useState, useEffect } from 'react';
import AdvertiseTable from '@/components/advertise/AdvertiseTable';
import AdvertiseForm from '@/components/advertise/AdvertiseForm';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import { Database, Clock, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  createAdvertiseAction,
  updateAdvertiseAction,
  updateAdvertiseStatusAction,
  deleteAdvertiseAction
} from './actions';

export default function AdvertiseSubmissionsPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'advertise' module
  const canView = isSuperAdmin || hasPermission('advertise', 'view');
  const canInsert = isSuperAdmin || hasPermission('advertise', 'insert');
  const canUpdate = isSuperAdmin || hasPermission('advertise', 'update');
  const canDelete = isSuperAdmin || hasPermission('advertise', 'delete');

  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    active: 0,
    inactive: 0,
    expired: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    active: [0, 0, 0, 0, 0, 0, 0],
    inactive: [0, 0, 0, 0, 0, 0, 0],
    expired: [0, 0, 0, 0, 0, 0, 0]
  });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingItem(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingItem(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openForm = (item: any = null) => {
    if (item && !canUpdate) {
      alert('Access denied: You do not have permission to edit advertised placements.');
      return;
    }
    if (!item && !canInsert) {
      alert('Access denied: You do not have permission to create advertised placements.');
      return;
    }
    setEditingItem(item);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: item }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingItem(null);
      if (window.history.state?.formOpen) {
        window.history.back();
      }
    }
  };

  const fetchStats = async () => {
    if (!canView) return;
    try {
      const [
        { count: cAll },
        { count: cAct },
        { count: cIna },
        { count: cExp },
        trends
      ] = await Promise.all([
        supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }),
        supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'inactive'),
        supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
        fetchSparklinesForStatuses(
          'advertisement_tools',
          [null, 'active', 'inactive', 'expired'],
          'updated_at',
          7
        )
      ]);

      const all = cAll || 0;
      const active = cAct || 0;
      const inactive = cIna || 0;
      const expired = cExp || 0;

      setStats({ all, active, inactive, expired });

      if (trends) {
        setSparklines({
          all: trends['all'] || [],
          active: trends['active'] || [],
          inactive: trends['inactive'] || [],
          expired: trends['expired'] || []
        });
      }
    } catch (err: any) {
      console.warn('Error fetching advertise tool stats:', err?.message || err);
    }
  };

  const fetchAdvertiseTools = async (manual = false) => {
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) fetchStats();
      let query = supabase
        .from('advertisement_tools')
        .select('*', { count: 'exact' });

      // Direct Database Search
      if (searchQuery) {
        query = query.ilike('tool_site_url', `%${searchQuery}%`);
      }

      // Apply Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply Sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' }).order('id', { ascending: sortOrder === 'asc' });

      // Apply Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: resultData, count, error } = await query;

      if (error) throw error;

      if (resultData && resultData.length > 0) {
        const toolIds = resultData.map(r => r.tool_id).filter((id): id is number => id !== null && id !== undefined);
        const toolUrls = resultData.map(r => r.tool_site_url).filter((u): u is string => Boolean(u && u.trim()));
        const userIds = resultData.map(r => r.user_id).filter((u): u is string => Boolean(u && u.trim()));

        // Query targeted ai_tools rows
        let toolQuery = supabase
          .from('ai_tools')
          .select('tool_id, tool_site_url, tool_info, favicon_url, is_paid');

        if (toolIds.length > 0) {
          toolQuery = toolQuery.in('tool_id', toolIds);
        } else if (toolUrls.length > 0) {
          toolQuery = toolQuery.in('tool_site_url', toolUrls);
        }

        const { data: toolData } = await toolQuery;

        // Query targeted ai_tool_submissions rows
        let submissionQuery = supabase
          .from('ai_tool_submissions')
          .select('tool_name, tool_site_url, tool_url, pricing_type, favicon_url, user_id, id');

        if (toolUrls.length > 0) {
          submissionQuery = submissionQuery.in('tool_site_url', toolUrls);
        }

        const { data: submissionData } = await submissionQuery;

        // Query user data via user_profiles
        let userProfilesData: any[] = [];
        if (userIds.length > 0) {
          try {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('id, full_name, email, avatar_url')
              .in('id', userIds);
            userProfilesData = profiles || [];
          } catch (profileErr) {
            console.warn('Error fetching user profiles for advertise tools:', profileErr);
          }
        }

        const merged = resultData.map(item => {
          const aiTool = toolData?.find(t =>
            (item.tool_id && t.tool_id === item.tool_id) ||
            (item.tool_site_url && t.tool_site_url === item.tool_site_url)
          );

          const submission = submissionData?.find(s =>
            item.tool_site_url && s.tool_site_url === item.tool_site_url
          );

          const userProfile = userProfilesData.find(u => u.id === item.user_id);

          return {
            ...item,
            ai_tool: aiTool || null,
            submission: submission || null,
            user_profile: userProfile || null,
          };
        });

        setData(merged);
      } else {
        setData([]);
      }

      setTotalCount(count || 0);

      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching advertise tools:', err?.message || err);
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
      fetchAdvertiseTools();
    }
  }, [canView, currentPage, statusFilter, searchQuery, sortBy, sortOrder]);

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

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const sanitizePayload = (raw: any) => {
    const payload = { ...raw };
    const dateFields = ['start_date', 'end_date'];
    dateFields.forEach(field => {
      if (payload[field] === '' || payload[field] === undefined) {
        payload[field] = null;
      }
    });

    const numericFields = ['impressions', 'clicks'];
    numericFields.forEach(field => {
      if (payload[field] !== null && payload[field] !== undefined && payload[field] !== '') {
        const parsed = Number(payload[field]);
        payload[field] = isNaN(parsed) ? 0 : parsed;
      } else {
        payload[field] = 0;
      }
    });

    const nullableNumberFields = ['slot_id', 'tool_id'];
    nullableNumberFields.forEach(field => {
      if (payload[field] !== null && payload[field] !== undefined && payload[field] !== '') {
        const parsed = Number(payload[field]);
        payload[field] = isNaN(parsed) ? null : parsed;
      } else {
        payload[field] = null;
      }
    });

    return payload;
  };

  const findLivePlacementForTool = async (
    toolId: number | null | undefined,
    excludeId?: number | string
  ): Promise<{ status: string; id: number } | null> => {
    if (!toolId) return null;
    try {
      let query = supabase
        .from('advertisement_tools')
        .select('id, status')
        .eq('tool_id', toolId)
        .in('status', ['active', 'inactive']);

      if (excludeId !== undefined && excludeId !== null) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.limit(1);
      if (error) {
        console.warn('findLivePlacementForTool check warning:', error.message);
        return null;
      }
      if (data && data.length > 0) {
        return { status: data[0].status, id: data[0].id };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleAddItem = async (formData: any) => {
    if (!canInsert) {
      throw new Error('Access denied: You do not have permission to create advertised placements.');
    }
    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const { data: { user } } = await supabase.auth.getUser();
      const payload = sanitizePayload(formData);
      if (user?.id && !payload.user_id) {
        payload.user_id = user.id;
      }

      // Validate before hitting the insert endpoint so we never fire a silent,
      // conflicting API call. Only active/inactive placements are exclusive.
      if (payload.status === 'active' || payload.status === 'inactive') {
        const conflict = await findLivePlacementForTool(payload.tool_id);
        if (conflict) {
          throw new Error(
            `This tool already has an ${conflict.status} advertisement. Set the existing placement to "expired" or edit it instead of creating a new one.`
          );
        }
      }

      const res = await createAdvertiseAction(payload, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create advertisement.');
      }

      await fetchStats();
      await fetchAdvertiseTools(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding advertise tool:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateItem = async (formData: any) => {
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to edit advertised placements.');
    }
    setIsActionLoading(true);
    try {
      const targetId = editingItem?.id;
      if (!targetId) throw new Error('Missing advertisement ID for update.');

      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const payload = sanitizePayload(formData);

      // Prevent an edit from creating a second live placement for the same tool.
      // We exclude the row being edited so re-saving an existing placement is fine.
      if (payload.status === 'active' || payload.status === 'inactive') {
        const conflict = await findLivePlacementForTool(payload.tool_id, targetId);
        if (conflict) {
          throw new Error(
            `Another ${conflict.status} advertisement already exists for this tool. Set that placement to "expired" or edit it instead.`
          );
        }
      }

      const res = await updateAdvertiseAction(targetId, payload, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update advertisement.');
      }

      await fetchStats();
      await fetchAdvertiseTools(true);
      closeForm();
    } catch (err: any) {
      console.error('Error updating advertise tool:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusChange = async (id: number | string, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update advertisement status.');
      return;
    }
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateAdvertiseStatusAction(id, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update advertise status.');
      }

      await fetchStats();
      await fetchAdvertiseTools();
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error';
      console.error('Error updating advertise status:', errorMsg);
      alert('Failed to update advertise status: ' + errorMsg);
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteItem = async (id: number, name?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete advertised placements.');
      return;
    }
    const confirmed = await confirmDelete({
      title: 'Delete Advertise Placement',
      itemName: name,
      message: 'Are you sure you want to permanently delete this advertisement placement? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteAdvertiseAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete advertisement.');
      }

      await fetchStats();
      await fetchAdvertiseTools(true);
    } catch (err: any) {
      console.error('Error deleting advertise tool:', err);
      alert(err.message || 'Failed to delete advertise placement.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditClick = (item: any) => {
    openForm(item);
  };

  // While authenticating, show spinner
  if (isAuthorized === null) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  // Unauthorized state for subadmins lacking advertise permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or manage Advertised Placements.
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Advertise Tools Database
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage high-visibility promotion slots and site-wide highlights.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchAdvertiseTools(true)}
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
                + New Record
              </Button>
            )}
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Advertise Submissions',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Database size={17} />,
                points: sparklines.all,
                badge: 'All Placements',
              },
              {
                id: 'active',
                label: 'Active',
                value: stats.active,
                iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
                badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
                icon: <CheckCircle2 size={17} />,
                points: sparklines.active,
                badge: 'Active',
              },
              {
                id: 'inactive',
                label: 'Inactive',
                value: stats.inactive,
                iconStyle: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
                badgeStyle: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
                sparklineColor: 'text-[#6e5e50] dark:text-violet-400',
                icon: <Clock size={17} />,
                points: sparklines.inactive,
                badge: 'Inactive',
              },
              {
                id: 'expired',
                label: 'Expired',
                value: stats.expired,
                iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
                badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                sparklineColor: 'text-[#824235] dark:text-rose-400',
                icon: <XCircle size={17} />,
                points: sparklines.expired,
                badge: 'Expired',
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
                    points={stat.points || [0, 0, 0, 0, 0, 0, 0]}
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

          {/* Search and Filter Control Bar */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search across all advertise tools..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="flex-1 h-11 px-4 text-sm"
                suppressHydrationWarning
              />
              <Button
                type="submit"
                className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 shrink-0"
                suppressHydrationWarning
              >
                Search
              </Button>
            </div>

            <div className="flex gap-2 shrink-0">
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
                <option value="updated_at-desc">Last Updated</option>
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="tool_site_url-asc">Name (A-Z)</option>
                <option value="tool_site_url-desc">Name (Z-A)</option>
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
            <AdvertiseTable
              data={data}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={handleEditClick}
              onDelete={handleDeleteItem}
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
          <AdvertiseForm
            initialData={editingItem}
            onSubmit={editingItem ? handleUpdateItem : handleAddItem}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}
    </div>
  );
}


