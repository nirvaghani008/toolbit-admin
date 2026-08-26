'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database, RefreshCw, AlertTriangle, HelpCircle, XCircle, Clock, Layers, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import Sparkline from '@/components/common/Sparkline';
import CountUp from '@/components/common/CountUp';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import ReportTable, { ToolReport, Submitter, formatReportType } from '@/components/reports/ReportTable';
import dynamic from 'next/dynamic';

const ToolForm = dynamic(() => import('@/components/tools/ToolForm'), {
  ssr: false,
  loading: () => (
    <div className="p-8 text-center text-sm font-bold text-[var(--text-muted)] animate-pulse">
      Loading Tool Form Component...
    </div>
  ),
});

const REPORT_TYPES = [
  'not working',
  'false info',
  'needs review',
  'detail mismatch',
  'other issue',
];

export default function ToolReportsPage() {
  const confirmDelete = useConfirm();
  const [reports, setReports] = useState<ToolReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<any>(null);

  const handleEditTool = async (report: ToolReport) => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_tools')
        .select('*')
        .eq('tool_id', report.tool_id)
        .single();

      if (error) throw error;
      setEditingTool(data);
      setShowForm(true);
    } catch (err: any) {
      console.error('Error fetching tool for editing:', err);
      if (report.ai_tools) {
        setEditingTool({ ...report.ai_tools, tool_id: report.tool_id });
        setShowForm(true);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTool(null);
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
      await fetchReports(true);
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

  const [stats, setStats] = useState({
    all: 0,
    notWorking: 0,
    falseInfo: 0,
    needsReview: 0,
    detailMismatch: 0,
    otherIssue: 0,
  });
  const [sparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    notWorking: [0, 0, 0, 0, 0, 0, 0],
    falseInfo: [0, 0, 0, 0, 0, 0, 0],
    needsReview: [0, 0, 0, 0, 0, 0, 0],
    detailMismatch: [0, 0, 0, 0, 0, 0, 0],
    otherIssue: [0, 0, 0, 0, 0, 0, 0],
  });

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const pageSize = 20;

  const fetchStats = async () => {
    try {
      const [
        { count: cAll },
        { count: cNW },
        { count: cFI },
        { count: cNR },
        { count: cDM },
      ] = await Promise.all([
        supabase.from('tool_reports').select('*', { count: 'exact', head: true }),
        supabase.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['not working', 'not_working']),
        supabase.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['false info', 'false_info']),
        supabase.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['needs review', 'need review', 'needs_review', 'need_review', 'need to review', 'need_to_review', 'nees review', 'nees_review']),
        supabase.from('tool_reports').select('*', { count: 'exact', head: true }).in('report_type', ['detail mismatch', 'detail_mismatch']),
      ]);

      const knownCount = (cNW || 0) + (cFI || 0) + (cNR || 0) + (cDM || 0);
      const cOther = Math.max(0, (cAll || 0) - knownCount);

      setStats({
        all: cAll || 0,
        notWorking: cNW || 0,
        falseInfo: cFI || 0,
        needsReview: cNR || 0,
        detailMismatch: cDM || 0,
        otherIssue: cOther,
      });
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching report stats:', err?.message || err);
    }
  };

  const fetchReports = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);
    try {
      if (manual) fetchStats();

      let query = supabase
        .from('tool_reports')
        .select('*, ai_tools(tool_id, favicon_url, tool_site_url, tool_url, tool_info)', { count: 'exact' });

      if (searchQuery) {
        query = query.or(`report_type.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }
      if (typeFilter !== 'all') {
        const normFilter = typeFilter.toLowerCase();
        if (normFilter === 'not working') {
          query = query.in('report_type', ['not working', 'not_working']);
        } else if (normFilter === 'false info') {
          query = query.in('report_type', ['false info', 'false_info']);
        } else if (normFilter === 'needs review' || normFilter === 'need review') {
          query = query.in('report_type', [
            'needs review',
            'need review',
            'needs_review',
            'need_review',
            'need to review',
            'need_to_review',
            'nees review',
            'nees_review',
          ]);
        } else if (normFilter === 'detail mismatch') {
          query = query.in('report_type', ['detail mismatch', 'detail_mismatch']);
        } else if (normFilter === 'other issue' || normFilter === 'other') {
          query = query.not(
            'report_type',
            'in',
            '("not working","not_working","false info","false_info","needs review","need review","needs_review","need_review","need to review","need_to_review","nees review","nees_review","detail mismatch","detail_mismatch")'
          );
        } else {
          const spaceFormat = typeFilter.replace(/_/g, ' ');
          const underscoreFormat = typeFilter.replace(/ /g, '_');
          query = query.in('report_type', [spaceFormat, underscoreFormat]);
        }
      }

      query = query
        .order('created_at', { ascending: sortOrder === 'asc' })
        .order('id', { ascending: sortOrder === 'asc' });

      const from = (currentPage - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      // Fetch submitters using get_users_by_ids RPC with get_admin_users fallback
      const userMap: Record<string, Submitter> = {};
      const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        try {
          const { data: usersData, error: rpcErr } = await supabase.rpc('get_users_by_ids', { p_ids: userIds });
          let list = usersData;
          if (rpcErr || !list || list.length === 0) {
            const { data: fallbackData } = await supabase.rpc('get_admin_users', { p_limit: 5000 });
            list = fallbackData;
          }

          (list || []).forEach((u: any) => {
            if (u?.id) {
              userMap[String(u.id).toLowerCase()] = {
                id: u.id,
                email: u.email || null,
                full_name: u.full_name || u.name || null,
                avatar_url: u.avatar_url || u.picture || null,
              };
            }
          });
        } catch (e) {
          console.warn('Error fetching submitters:', e);
        }
      }

      const enriched: ToolReport[] = (data || []).map((r: any) => {
        const sKey = r.user_id ? String(r.user_id).toLowerCase() : '';
        return {
          ...r,
          submitter: sKey ? userMap[sKey] || null : null,
        };
      });

      setReports(enriched);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.warn('Error fetching reports:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [currentPage, typeFilter, sortOrder, searchQuery]);

  useEffect(() => {
    if (searchInputValue === '') setSearchQuery('');
  }, [searchInputValue]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Report',
      message: 'Are you sure you want to permanently delete this tool report? This action cannot be undone.',
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const { error } = await supabase.from('tool_reports').delete().eq('id', id);
      if (error) throw error;
      await fetchStats();
      await fetchReports();
    } catch (err) {
      console.error('Error deleting report:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const statCards = [
    {
      id: 'all',
      label: 'Total Reports',
      value: stats.all,
      iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#364954] dark:text-zinc-400',
      icon: <Database size={17} />,
      points: sparklines.all,
      badge: 'All Reports',
    },
    {
      id: 'not working',
      label: 'Not Working',
      value: stats.notWorking,
      iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      sparklineColor: 'text-[#824235] dark:text-rose-400',
      icon: <XCircle size={17} />,
      points: sparklines.notWorking || [0, 0, 0, 0, 0, 0, 0],
      badge: 'Critical',
    },
    {
      id: 'false info',
      label: 'False Info',
      value: stats.falseInfo,
      iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      sparklineColor: 'text-[#8a652a] dark:text-amber-400',
      icon: <AlertTriangle size={17} />,
      points: sparklines.falseInfo || [0, 0, 0, 0, 0, 0, 0],
      badge: 'Content',
    },
    {
      id: 'needs review',
      label: 'Needs Review',
      value: stats.needsReview,
      iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
      icon: <Clock size={17} />,
      points: sparklines.needsReview || [0, 0, 0, 0, 0, 0, 0],
      badge: 'Review',
    },
    {
      id: 'detail mismatch',
      label: 'Detail Mismatch',
      value: stats.detailMismatch,
      iconStyle: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
      badgeStyle: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
      sparklineColor: 'text-[#6e5e50] dark:text-violet-400',
      icon: <Layers size={17} />,
      points: sparklines.detailMismatch || [0, 0, 0, 0, 0, 0, 0],
      badge: 'Mismatch',
    },
    {
      id: 'other issue',
      label: 'Other Issue',
      value: stats.otherIssue,
      iconStyle: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#474c50] dark:text-zinc-400',
      icon: <HelpCircle size={17} />,
      points: sparklines.otherIssue || [0, 0, 0, 0, 0, 0, 0],
      badge: 'Other',
    },
  ];

  if (showForm) {
    return (
      <div className="animate-fade-in-up max-w-[1500px] mx-auto p-6 md:p-8">
        <StickyFormBackButton
          label="Back to Tool Reports"
          onClick={closeForm}
          isLoading={isActionLoading}
        />
        <ToolForm
          initialData={editingTool}
          onSubmit={handleUpdateTool}
          onCancel={closeForm}
          isLoading={isActionLoading}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            Tool Issue Reports
          </h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            Review and manage user-submitted tool issue reports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fetchReports(true)}
            disabled={isRefreshing}
            className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            suppressHydrationWarning
          >
            {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((stat) => {
          const isSelected = typeFilter === stat.id;
          return (
            <button
              key={stat.id}
              onClick={() => {
                setTypeFilter((prev) => (prev === stat.id ? 'all' : stat.id));
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
                points={stat.points}
                id={stat.id}
                isSelected={isSelected}
              />

              <div className="p-4 sm:p-5 pb-2 sm:pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 ${stat.iconStyle}`}
                >
                  {stat.icon}
                </div>
                {isSelected ? (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded-full border bg-zinc-800 text-zinc-100 border-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600 shadow-2xs">
                    Selected
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 text-[9px] font-bold rounded-full border shadow-2xs transition-colors ${stat.badgeStyle}`}
                  >
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

      {/* Search & Filter */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            placeholder="Search by report type or description..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="flex-1 h-11 px-4 text-sm"
            suppressHydrationWarning
          />
          <Button
            type="submit"
            className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-bold rounded-xl shadow-xs active:scale-95 cursor-pointer"
            suppressHydrationWarning
          >
            Search
          </Button>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <Select
            value={typeFilter}
            onChange={(val) => {
              setTypeFilter(val);
              setCurrentPage(1);
            }}
            className="h-11 min-w-[170px]"
            suppressHydrationWarning
          >
            <option value="all">All Issue Types</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {formatReportType(t)}
              </option>
            ))}
          </Select>
          <Select
            value={`created_at-${sortOrder}`}
            onChange={(val) => setSortOrder(val.split('-')[1] as 'asc' | 'desc')}
            className="h-11 min-w-[160px]"
            suppressHydrationWarning
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
          </Select>
        </div>
      </form>

      {/* Reports Table with Shadcn UI */}
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
              <Spinner size={20} />
            </div>
          </div>
        )}
        <ReportTable
          reports={reports}
          totalCount={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onEditTool={handleEditTool}
          onDelete={handleDelete}
          isLoading={loading}
        />
      </div>
    </div>
  );
}


