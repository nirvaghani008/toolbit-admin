'use client';

import { useState, useEffect } from 'react';
import AdvertiseTable from '@/components/advertise/AdvertiseTable';
import AdvertiseForm from '@/components/advertise/AdvertiseForm';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import { Database, Clock, CheckCircle2, XCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function AdvertiseSubmissionsPage() {
  const confirmDelete = useConfirm();
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
    try {
      let all = 0, active = 0, inactive = 0, expired = 0;

      const { data: statusCounts, error: countError } = await supabase.rpc('get_status_counts', {
        tbl_name: 'advertisement_tools'
      });

      if (!countError && statusCounts) {
        all = statusCounts.total || 0;
        active = statusCounts.active || 0;
        inactive = statusCounts.inactive || 0;
        expired = statusCounts.expired || 0;
      } else {
        const [
          { count: cAll },
          { count: cAct },
          { count: cIna },
          { count: cExp }
        ] = await Promise.all([
          supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }),
          supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'inactive'),
          supabase.from('advertisement_tools').select('*', { count: 'exact', head: true }).eq('status', 'expired')
        ]);

        all = cAll || 0;
        active = cAct || 0;
        inactive = cIna || 0;
        expired = cExp || 0;
      }

      setStats({ all, active, inactive, expired });

      try {
        const trends = await fetchSparklinesForStatuses(
          'advertisement_tools',
          [null, 'active', 'inactive', 'expired'],
          'updated_at',
          7
        );

        setSparklines({
          all: trends['all'] || [],
          active: trends['active'] || [],
          inactive: trends['inactive'] || [],
          expired: trends['expired'] || []
        });
      } catch (trendErr) {
        console.warn('Sparklines trend fetch warning:', trendErr);
      }
    } catch (err: any) {
      console.warn('Error fetching advertise tool stats:', err?.message || err);
    }
  };

  const fetchAdvertiseTools = async (manual = false) => {
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
        let subQuery = supabase
          .from('ai_tool_submissions')
          .select('id, user_id, full_name, business_email, tool_site_url, tool_info, is_paid');

        if (toolUrls.length > 0) {
          subQuery = subQuery.in('tool_site_url', toolUrls);
        } else if (userIds.length > 0) {
          subQuery = subQuery.in('user_id', userIds);
        }

        const { data: subData } = await subQuery;

        const subMapByUrl = new Map();
        subData?.forEach(s => {
          if (s.tool_site_url) {
            const clean = s.tool_site_url.toLowerCase().trim();
            subMapByUrl.set(clean, s);
            try {
              const host = new URL(clean.startsWith('http') ? clean : `https://${clean}`).hostname.replace('www.', '');
              subMapByUrl.set(host, s);
            } catch {}
          }
        });

        const toolMapById = new Map();
        const toolMapByUrl = new Map();
        toolData?.forEach(t => {
          if (t.tool_id) toolMapById.set(Number(t.tool_id), t);
          if (t.tool_site_url) {
            const clean = t.tool_site_url.toLowerCase().trim();
            toolMapByUrl.set(clean, t);
            try {
              const host = new URL(clean.startsWith('http') ? clean : `https://${clean}`).hostname.replace('www.', '');
              toolMapByUrl.set(host, t);
            } catch {}
          }
        });

        const getToolNameFromObj = (obj: any) => {
          if (!obj) return null;
          const info = typeof obj.tool_info === 'string'
            ? (() => { try { return JSON.parse(obj.tool_info); } catch { return {}; } })()
            : (obj.tool_info || {});
          return obj.tool_name || obj.name || info.toolName || info.name || info.tool_name || info.title || null;
        };

        const enriched = resultData.map(item => {
          const cleanUrl = item.tool_site_url ? item.tool_site_url.toLowerCase().trim() : '';
          let itemHost = '';
          try {
            if (cleanUrl) itemHost = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`).hostname.replace('www.', '');
          } catch {}

          const tool = (item.tool_id && toolMapById.get(Number(item.tool_id))) ||
                       (cleanUrl && toolMapByUrl.get(cleanUrl)) ||
                       (itemHost && toolMapByUrl.get(itemHost));

          const sub = (cleanUrl && subMapByUrl.get(cleanUrl)) ||
                      (itemHost && subMapByUrl.get(itemHost)) ||
                      (item.user_id && subData?.find(s => s.user_id === item.user_id));

          const name = getToolNameFromObj(tool) || getToolNameFromObj(item) || getToolNameFromObj(sub) || null;
          const submitterName = item.full_name || item.name || sub?.full_name || 'Admin';
          const submitterEmail = item.business_email || item.email || sub?.business_email || '';
          const isPaid = tool?.is_paid === true || sub?.is_paid === true || item.is_paid === true;

          return {
            ...item,
            full_name: submitterName,
            user_name: submitterName,
            business_email: submitterEmail,
            user_email: submitterEmail,
            tool_name: name,
            is_paid: isPaid,
            tool_info: tool?.tool_info || item.tool_info || sub?.tool_info || null,
            favicon_url: tool?.favicon_url || item.favicon_url || sub?.favicon_url || null
          };
        });

        setData(enriched);
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
    fetchStats();
  }, []);

  useEffect(() => {
    fetchAdvertiseTools();
  }, [currentPage, statusFilter, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    if (searchInputValue === '') {
      setSearchQuery('');
      setCurrentPage(1);
    }
  }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const sanitizePayload = (data: any) => {
    const payload = { ...data };
    delete payload.id;
    delete payload.full_name;
    delete payload.user_name;
    delete payload.business_email;
    delete payload.user_email;
    delete payload.tool_name;
    delete payload.is_paid;
    delete payload.tool_info;
    delete payload.favicon_url;
    delete payload.views_count;
    delete payload.clicks_count;

    const order = data.order;
    delete payload.order;

    return {
      ...payload,
      display_order: data.display_order ?? (order !== undefined && order !== null && order !== '' ? parseInt(order.toString()) : 0),
    };
  };

  const handleAddItem = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = sanitizePayload(formData);
      if (user?.id && !payload.user_id) {
        payload.user_id = user.id;
      }
      const { error } = await supabase
        .from('advertisement_tools')
        .insert([{
          ...payload,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

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
    setIsActionLoading(true);
    try {
      const payload = sanitizePayload(formData);
      const { error } = await supabase
        .from('advertisement_tools')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingItem.id);

      if (error) throw error;

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

  const handleDeleteItem = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Remove Advertise Tool',
      message: 'Are you sure you want to remove this advertise tool placement? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('advertisement_tools').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchAdvertiseTools(true);
    } catch (err) {
      console.error('Error deleting advertise tool:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditClick = (item: any) => {
    openForm(item);
  };

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
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAdvertiseTools(true)}
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
              + New Record
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { id: 'all', label: 'Total Advertise Submissions', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Database size={18} />, points: sparklines.all },
              { id: 'active', label: 'Active', value: stats.active, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.active },
              { id: 'inactive', label: 'Inactive', value: stats.inactive, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <Clock size={18} />, points: sparklines.inactive },
              { id: 'expired', label: 'Expired', value: stats.expired, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <XCircle size={18} />, points: sparklines.expired },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id as any); setCurrentPage(1); }}
                className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col ${statusFilter === stat.id ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md' : 'bg-[var(--bg-surface)] border-[var(--border-color)]'}`}
                style={statusFilter === stat.id ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` } : undefined}
                suppressHydrationWarning
              >
                <div className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} style={{ backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${statusFilter === stat.id ? '15' : '05'}, transparent)` }} />

                <Sparkline color={stat.color} points={stat.points || [0, 0, 0, 0, 0, 0, 0]} id={stat.id} isSelected={statusFilter === stat.id} />

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

          {/* Search and Filter Control Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search across all advertise tools..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
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

            <div className="flex gap-2">
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
                    { value: 'updated_at-desc', label: 'Last Updated' },
                    { value: 'created_at-desc', label: 'Newest First' },
                    { value: 'created_at-asc', label: 'Oldest First' },
                    { value: 'tool_site_url-asc', label: 'Name (A-Z)' },
                    { value: 'tool_site_url-desc', label: 'Name (Z-A)' },
                  ]}
                  className="h-11 font-semibold"
                  suppressHydrationWarning
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div>
            <AdvertiseTable
              data={data}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={handleEditClick}
              onDelete={handleDeleteItem}
              isLoading={loading}
            />
          </div>
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
          <AdvertiseForm
            initialData={editingItem}
            onSubmit={editingItem ? handleUpdateItem : handleAddItem}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
