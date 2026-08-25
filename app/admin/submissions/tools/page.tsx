'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import ToolForm from '@/components/tools/ToolForm';
import ToolPreviewModal from '@/components/tools/ToolPreviewModal';
import ToolSubmissionTable from '@/components/submissions/ToolSubmissionTable';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Database,
  RefreshCw,
  FileText,
  Search,
  ArrowLeft,
} from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function ToolSubmissionsPage() {
  const confirmDelete = useConfirm();
  const [tools, setTools] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    pending: 0,
    approved: 0,
    draft: 0,
    rejected: 0,
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    pending: [0, 0, 0, 0, 0, 0, 0],
    approved: [0, 0, 0, 0, 0, 0, 0],
    draft: [0, 0, 0, 0, 0, 0, 0],
    rejected: [0, 0, 0, 0, 0, 0, 0],
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'draft' | 'rejected'>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'tool_name' | 'id'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<any>(null);
  const [previewTool, setPreviewTool] = useState<any>(null);

  const sortOptions = [
    { value: 'updated_at-desc', label: 'Last Updated' },
    { value: 'created_at-desc', label: 'Newest First' },
    { value: 'created_at-asc', label: 'Oldest First' },
    { value: 'tool_name-asc', label: 'Name (A-Z)' },
    { value: 'tool_name-desc', label: 'Name (Z-A)' },
  ];

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

  const openForm = (tool: any = null) => {
    setEditingTool(tool);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: tool }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingTool(null);
      if (window.history.state?.formOpen) {
        window.history.back();
      }
    }
  };

  const fetchStats = async () => {
    try {
      const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
        'ai_tool_submissions',
        ['pending', 'approved', 'draft', 'rejected'],
        'updated_at',
        7
      );

      setStats({
        all: counts.total || 0,
        pending: counts.pending || 0,
        approved: counts.approved || 0,
        draft: counts.draft || 0,
        rejected: counts.rejected || 0,
      });

      setSparklines({
        all: trends['all'] || [],
        pending: trends['pending'] || [],
        approved: trends['approved'] || [],
        draft: trends['draft'] || [],
        rejected: trends['rejected'] || [],
      });
    } catch (err: any) {
      console.warn('Error fetching tool submission stats:', err?.message || err);
    }
  };

  const fetchTools = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) await fetchStats();

      let query = supabase
        .from('ai_tool_submissions')
        .select('*', { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,business_email.ilike.%${searchQuery}%,tool_site_url.ilike.%${searchQuery}%`);
      }

      query = query.order(sortBy, { ascending: sortOrder === 'asc' }).order('id', { ascending: sortOrder === 'asc' });

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      setTools(data || []);
      setTotalCount(count || 0);
      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching tool submissions:', err?.message || err);
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
  }, [currentPage, searchQuery, sortBy, sortOrder, statusFilter]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setSearchQuery(searchInputValue);
  };

  const handleUpdateTool = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('ai_tool_submissions')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', editingTool.id);

      if (error) throw error;

      await fetchStats();
      await fetchTools(true);
      closeForm();
    } catch (err: any) {
      console.error('Error updating tool submission:', err.message || err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This tool URL slug is already in use.');
      }
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteTool = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Tool Submission',
      message: 'Are you sure you want to permanently delete this tool submission? This action cannot be undone.',
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('ai_tool_submissions').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchTools(true);
    } catch (err) {
      console.error('Error deleting tool submission:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const statCards = [
    { id: 'all', label: 'Total Submissions', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Database size={18} />, points: sparklines.all },
    { id: 'approved', label: 'Approved', value: stats.approved, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.approved },
    { id: 'pending', label: 'Pending', value: stats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <Clock size={18} />, points: sparklines.pending },
    { id: 'rejected', label: 'Rejected', value: stats.rejected, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <XCircle size={18} />, points: sparklines.rejected },
    { id: 'draft', label: 'Draft', value: stats.draft, color: 'text-violet-500', bg: 'bg-violet-500/10', hex: '#8b5cf6', icon: <FileText size={18} />, points: sparklines.draft },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Tool Submissions Database</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Review and moderate new tool requests from the community.</p>
        </div>
        {!showForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTools(true)}
            disabled={isRefreshing}
            className="gap-2 font-semibold shadow-xs"
            suppressHydrationWarning
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </Button>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {statCards.map((stat) => (
              <button
                key={stat.id}
                onClick={() => {
                  setStatusFilter((prev) => (prev === stat.id ? 'all' : (stat.id as any)));
                  setCurrentPage(1);
                }}
                className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-500 hover:shadow-md flex flex-col cursor-pointer ${
                  statusFilter === stat.id
                    ? 'bg-[var(--bg-elevated)] border-indigo-500/20 shadow-md'
                    : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                }`}
                style={
                  statusFilter === stat.id
                    ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` }
                    : undefined
                }
                suppressHydrationWarning
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                    statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${
                      statusFilter === stat.id ? '15' : '05'
                    }, transparent)`,
                  }}
                />

                <Sparkline
                  color={stat.color}
                  points={stat.points}
                  id={stat.id}
                  isSelected={statusFilter === stat.id}
                />

                {statusFilter === stat.id && (
                  <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                    <div
                      className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75"
                      style={{ backgroundColor: stat.hex }}
                    />
                    <div
                      className="relative w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }}
                    />
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
                      statusFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'
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

          {/* Search & Sort */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search by name, email, or URL..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                className="flex-1"
                suppressHydrationWarning
              />
              <Button
                type="submit"
                variant="default"
                className="px-5 shadow-sm shrink-0"
                suppressHydrationWarning
              >
                <Search size={15} />
                <span>Search</span>
              </Button>
            </div>

            <div className="flex gap-2 shrink-0">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [any, any];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                }}
                options={sortOptions}
                className="min-w-[180px]"
                suppressHydrationWarning
              />
            </div>
          </form>

          {/* Table */}
          <ToolSubmissionTable
            tools={tools}
            totalCount={totalCount}
            pageSize={pageSize}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onEdit={openForm}
            onDelete={handleDeleteTool}
            onPreview={setPreviewTool}
            isLoading={loading}
          />
        </>
      ) : (
        <div className="animate-fade-in-up">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeForm}
            className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 flex items-center gap-2 transition-all p-0 h-auto cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back to Database</span>
          </Button>
          <ToolForm initialData={editingTool} onSubmit={handleUpdateTool} onCancel={closeForm} isSubmission={true} />
        </div>
      )}

      {/* Preview Modal */}
      {previewTool && (
        <ToolPreviewModal
          tool={previewTool}
          onClose={() => setPreviewTool(null)}
        />
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
