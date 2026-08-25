'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database, RefreshCw, AlertTriangle, HelpCircle, XCircle, Clock, Layers, Search, ArrowLeft } from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
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
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('tool_reports').delete().eq('id', id);
      if (error) throw error;
      await fetchStats();
      await fetchReports();
    } catch (err) {
      console.error('Error deleting report:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const statCards = [
    {
      id: 'all',
      label: 'Total Reports',
      value: stats.all,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
      hex: '#6366f1',
      icon: <Database size={18} />,
      points: sparklines.all,
    },
    {
      id: 'not working',
      label: 'Not Working',
      value: stats.notWorking,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      hex: '#f43f5e',
      icon: <XCircle size={18} />,
      points: sparklines.notWorking || [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'false info',
      label: 'False Info',
      value: stats.falseInfo,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      hex: '#f97316',
      icon: <AlertTriangle size={18} />,
      points: sparklines.falseInfo || [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'needs review',
      label: 'Needs Review',
      value: stats.needsReview,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      hex: '#f59e0b',
      icon: <Clock size={18} />,
      points: sparklines.needsReview || [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'detail mismatch',
      label: 'Detail Mismatch',
      value: stats.detailMismatch,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      hex: '#a855f7',
      icon: <Layers size={18} />,
      points: sparklines.detailMismatch || [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'other issue',
      label: 'Other Issue',
      value: stats.otherIssue,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      hex: '#3b82f6',
      icon: <HelpCircle size={18} />,
      points: sparklines.otherIssue || [0, 0, 0, 0, 0, 0, 0],
    },
  ];

  if (showForm) {
    return (
      <div className="animate-fade-in-up max-w-[1500px] mx-auto p-6 md:p-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={closeForm}
          className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 hover:bg-transparent p-0 h-auto flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Tool Reports
        </Button>
        <ToolForm
          initialData={editingTool}
          onSubmit={handleUpdateTool}
          onCancel={closeForm}
        />
        {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
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
        <Button
          variant="outline"
          size="default"
          onClick={() => fetchReports(true)}
          disabled={isRefreshing}
          className="font-semibold shadow-xs"
          suppressHydrationWarning
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
          {isRefreshing ? 'Syncing...' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map((stat) => (
          <button
            key={stat.id}
            onClick={() => {
              setTypeFilter((prev) => (prev === stat.id ? 'all' : stat.id));
              setCurrentPage(1);
            }}
            className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col cursor-pointer ${
              typeFilter === stat.id
                ? 'bg-[var(--bg-elevated)] shadow-md'
                : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
            }`}
            style={
              typeFilter === stat.id
                ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` }
                : undefined
            }
            suppressHydrationWarning
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                typeFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${
                  typeFilter === stat.id ? '15' : '05'
                }, transparent)`,
              }}
            />
            <Sparkline color={stat.color} points={stat.points} id={stat.id} isSelected={typeFilter === stat.id} />
            {typeFilter === stat.id && (
              <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                <div className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75" style={{ backgroundColor: stat.hex }} />
                <div className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }} />
              </div>
            )}
            <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}
              >
                {stat.icon}
              </div>
            </div>
            <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
              <div
                className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                  typeFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'
                }`}
              >
                {stat.label}
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                <CountUp key={refreshKey} end={stat.value} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            />
            <Input
              type="text"
              placeholder="Search by report type or description..."
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              className="h-11 pl-10 shadow-xs"
              suppressHydrationWarning
            />
          </div>
          <Button
            type="submit"
            variant="default"
            className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/10 cursor-pointer"
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
            className="h-11 shadow-xs min-w-[170px]"
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
            className="h-11 shadow-xs min-w-[160px]"
            suppressHydrationWarning
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
          </Select>
        </div>
      </form>

      {/* Reports Table with Shadcn UI */}
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

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
