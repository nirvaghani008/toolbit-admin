'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
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
  // Keep the query used for fetching separate from the input draft.
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
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

      if (appliedSearchQuery) {
        query = query.or(`full_name.ilike.%${appliedSearchQuery}%,business_email.ilike.%${appliedSearchQuery}%,tool_site_url.ilike.%${appliedSearchQuery}%`);
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
  }, [currentPage, appliedSearchQuery, sortBy, sortOrder, statusFilter]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentPage !== 1) setCurrentPage(1);
    setAppliedSearchQuery(searchInputValue);
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
    setIsRefreshing(true);
    try {
      const { error } = await supabase.from('ai_tool_submissions').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchTools(true);
    } catch (err) {
      console.error('Error deleting tool submission:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const statCards = [
    {
      id: 'all',
      label: 'Total Submissions',
      value: stats.all,
      iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      sparklineColor: 'text-[#364954] dark:text-zinc-400',
      icon: <Database size={17} />,
      points: sparklines.all,
      badge: 'All Submissions',
    },
    {
      id: 'approved',
      label: 'Approved',
      value: stats.approved,
      iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
      icon: <CheckCircle2 size={17} />,
      points: sparklines.approved,
      badge: 'Approved',
    },
    {
      id: 'pending',
      label: 'Pending',
      value: stats.pending,
      iconStyle: 'text-[#5a4833] bg-[#f7f4ee] border-[#e2dcd0] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badgeStyle: 'bg-[#f7f4ee] text-[#5a4833] border-[#e2dcd0] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      sparklineColor: 'text-[#5a4833] dark:text-amber-400',
      icon: <Clock size={17} />,
      points: sparklines.pending,
      badge: 'Pending',
    },
    {
      id: 'rejected',
      label: 'Rejected',
      value: stats.rejected,
      iconStyle: 'text-[#5c3838] bg-[#f6f1f1] border-[#e2d3d3] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badgeStyle: 'bg-[#f6f1f1] text-[#5c3838] border-[#e2d3d3] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      sparklineColor: 'text-[#5c3838] dark:text-rose-400',
      icon: <XCircle size={17} />,
      points: sparklines.rejected,
      badge: 'Rejected',
    },
    {
      id: 'draft',
      label: 'Draft',
      value: stats.draft,
      iconStyle: 'text-[#5b4375] bg-[#f7f3f9] border-[#e6deed] dark:text-purple-400 dark:bg-purple-500/10 dark:border-purple-500/20',
      badgeStyle: 'bg-[#f7f3f9] text-[#5b4375] border-[#e6deed] dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
      sparklineColor: 'text-[#5b4375] dark:text-purple-400',
      icon: <FileText size={17} />,
      points: sparklines.draft,
      badge: 'Draft',
    },
  ];

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">AI Tool Submissions</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Review community tool submissions and publication requests.</p>
        </div>
        {!showForm && (
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
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {statCards.map((stat) => {
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

          {/* Search & Sort */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search by name, email, or URL..."
                value={searchInputValue}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSearchInputValue(nextValue);

                  if (nextValue.trim() === '') {
                    setAppliedSearchQuery('');
                    if (currentPage !== 1) setCurrentPage(1);
                  }
                }}
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

          {/* Table */}
          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-2xs flex items-center justify-center rounded-2xl animate-fade-in pointer-events-none">
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-sm">
                  <Spinner size={20} />
                </div>
              </div>
            )}
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
          </div>
        </>
      ) : (
        <div className="animate-fade-in-up">
          <StickyFormBackButton
            label="Back to Database"
            onClick={closeForm}
            isLoading={isActionLoading}
          />
          <ToolForm initialData={editingTool} onSubmit={handleUpdateTool} onCancel={closeForm} isSubmission={true} isLoading={isActionLoading} />
        </div>
      )}

      {/* Preview Modal */}
      {previewTool && (
        <ToolPreviewModal
          tool={previewTool}
          onClose={() => setPreviewTool(null)}
        />
      )}
    </div>
  );
}


