'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import {
  RefreshCw, Folder, Clock, CheckCircle2, XCircle,
  Search, ArrowLeft, Star
} from 'lucide-react';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import ReviewTable, { Review, ToolLogo } from '@/components/reviews/ReviewTable';

export default function ReviewsPage() {
  const confirmDelete = useConfirm();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  // Synchronize detail view state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.reviewOpen) {
        if (e.state.reviewData) setSelectedReview(e.state.reviewData);
      } else {
        setSelectedReview(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openReview = (review: Review) => {
    setSelectedReview(review);
    window.history.pushState({ reviewOpen: true, reviewData: review }, '');
  };

  const closeReview = () => {
    if (selectedReview) {
      setSelectedReview(null);
      if (window.history.state?.reviewOpen) {
        window.history.back();
      }
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'review_date' | 'reviewer_name'>('review_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [stats, setStats] = useState({
    all: 0,
    approved: 0,
    rejected: 0,
    pending: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    approved: [0, 0, 0, 0, 0, 0, 0],
    rejected: [0, 0, 0, 0, 0, 0, 0],
    pending: [0, 0, 0, 0, 0, 0, 0]
  });

  const fetchStats = async () => {
    try {
      let all = 0, approved = 0, rejected = 0, pending = 0;

      const { data: statusCounts, error: countError } = await supabase.rpc('get_status_counts', {
        tbl_name: 'reviews'
      });

      if (!countError && statusCounts) {
        all = statusCounts.total || 0;
        approved = (statusCounts.show || 0) + (statusCounts.approved || 0);
        rejected = (statusCounts.hide || 0) + (statusCounts.rejected || 0);
        pending = statusCounts.pending || 0;
      } else {
        const [
          { count: cAll },
          { count: cApproved },
          { count: cShow },
          { count: cRejected },
          { count: cHide },
          { count: cPending }
        ] = await Promise.all([
          supabase.from('reviews').select('*', { count: 'exact', head: true }),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'show'),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'hide'),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        ]);

        all = cAll || 0;
        approved = (cApproved || 0) + (cShow || 0);
        rejected = (cRejected || 0) + (cHide || 0);
        pending = cPending || 0;
      }

      setStats({ all, approved, rejected, pending });

      try {
        const trends = await fetchSparklinesForStatuses(
          'reviews',
          [null, 'show', 'approved', 'hide', 'rejected', 'pending'],
          'review_date',
          7
        );

        const allTrend = trends['all'] || [];
        const approvedTrend = (trends['show'] || []).map((v, i) => v + (trends['approved']?.[i] || 0));
        const rejectedTrend = (trends['hide'] || []).map((v, i) => v + (trends['rejected']?.[i] || 0));
        const pendingTrend = trends['pending'] || [];

        setSparklines({
          all: allTrend,
          approved: approvedTrend,
          rejected: rejectedTrend,
          pending: pendingTrend
        });
      } catch (trendErr) {
        console.warn('Sparklines trend fetch warning:', trendErr);
      }
    } catch (err: any) {
      console.warn('Error fetching review stats:', err?.message || err);
    }
  };

  const fetchReviews = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) await fetchStats();

      // Use a simple query first to ensure we get the data
      let query = supabase
        .from('reviews')
        .select(`
          *,
          ai_tools:tool_id (
            tool_id,
            tool_site_url,
            favicon_url,
            tool_info
          )
        `, { count: 'exact' });

      if (searchQuery) {
        query = query.or(`reviewer_name.ilike.%${searchQuery}%,review_text.ilike.%${searchQuery}%`);
      }

      if (statusFilter === 'approved') {
        query = query.or('status.eq.show,status.eq.approved');
      } else if (statusFilter === 'rejected') {
        query = query.or('status.eq.hide,status.eq.rejected');
      } else if (statusFilter === 'pending') {
        query = query.eq('status', 'pending');
      }
      // If statusFilter is 'all', we don't add any status filter at all

      const sortCol = sortBy === 'review_date' ? 'review_date' : 'reviewer_name';
      query = query.order(sortCol, { ascending: sortOrder === 'asc' }).order('review_id', { ascending: sortOrder === 'asc' });

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setReviews(data || []);
      setTotalCount(count || 0);
      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching reviews:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [currentPage, statusFilter, searchQuery, sortBy, sortOrder]);

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

  const handleStatusToggle = async (review: Review, forceStatus?: string) => {
    setIsActionLoading(true);
    let newStatus = '';

    if (forceStatus) {
      newStatus = forceStatus;
    } else {
      const isCurrentlyLive = (review.status === 'show' || review.status === 'approved');
      newStatus = isCurrentlyLive ? 'hide' : 'show';
    }

    try {
      const { error } = await supabase
        .from('reviews')
        .update({ status: newStatus })
        .eq('review_id', review.review_id);
      if (error) throw error;

      await fetchStats();
      await fetchReviews(true);

      // If we are in the edit view, redirect back to main page
      if (selectedReview) {
        closeReview();
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Review',
      message: 'Are you sure you want to permanently delete this review? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('reviews').delete().eq('review_id', id);
      if (error) throw error;
      await fetchStats();
      await fetchReviews(true);
    } catch (err) {
      console.error('Error deleting review:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Review Moderation</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage platform credibility and user trust.</p>
        </div>
        {!selectedReview && (
          <Button
            variant="outline"
            size="default"
            onClick={() => fetchReviews(true)}
            disabled={isRefreshing}
            className="font-semibold shadow-xs"
            suppressHydrationWarning
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </Button>
        )}
      </div>

      {!selectedReview ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { id: 'all', label: 'Total Reviews', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Folder size={18} />, points: sparklines.all },
              { id: 'pending', label: 'Pending', value: stats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <Clock size={18} />, points: sparklines.pending },
              { id: 'approved', label: 'Approved', value: stats.approved, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.approved },
              { id: 'rejected', label: 'Rejected', value: stats.rejected, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <XCircle size={18} />, points: sparklines.rejected },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id as any); setCurrentPage(1); }}
                className={`professional-card text-left rounded-[24px] shadow-sm border-2 group relative overflow-hidden transition-all duration-500 hover:shadow-xl flex flex-col ${statusFilter === stat.id ? 'bg-[var(--bg-elevated)] shadow-md' : 'bg-[var(--bg-surface)] border-[var(--border-color)]/60'}`}
                style={statusFilter === stat.id ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}30, 0 4px 8px -4px ${stat.hex}20` } : undefined}
                suppressHydrationWarning
              >
                <div className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} style={{ backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${statusFilter === stat.id ? '15' : '05'}, transparent)` }} />

                <Sparkline color={stat.color} points={stat.points} id={stat.id} isSelected={statusFilter === stat.id} />

                {statusFilter === stat.id && (
                  <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                    <div className="absolute w-2 h-2 rounded-full animate-ping opacity-75" style={{ backgroundColor: stat.hex }} />
                    <div className="relative w-2 h-2 rounded-full" style={{ backgroundColor: stat.hex, boxShadow: `0 0 8px ${stat.hex}` }} />
                  </div>
                )}

                <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}>
                    {stat.icon}
                  </div>
                </div>

                <div className="px-5 py-4 relative z-10 w-full space-y-1 pointer-events-none">
                  <div className={`text-[10px] font-black uppercase tracking-[0.15em] ${statusFilter === stat.id ? stat.color : 'text-[var(--text-muted)]'}`}>
                    {stat.label}
                  </div>
                  <div className="text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
                    <CountUp key={refreshKey} end={stat.value} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Search Controls */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search reviewer name or feedback content..."
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                  className="h-11 pl-10 shadow-xs"
                  suppressHydrationWarning
                />
              </div>
              <Button
                type="submit"
                variant="default"
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/10"
                suppressHydrationWarning
              >
                Search
              </Button>
            </div>

            <div className="flex gap-2 min-w-[200px]">
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [any, any];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                }}
                className="h-11 shadow-xs min-w-[190px]"
                suppressHydrationWarning
              >
                <option value="review_date-desc">Newest First</option>
                <option value="review_date-asc">Oldest First</option>
                <option value="reviewer_name-asc">Name (A-Z)</option>
                <option value="reviewer_name-desc">Name (Z-A)</option>
              </Select>
            </div>
          </form>

          {/* Table */}
          <ReviewTable
            reviews={reviews}
            totalCount={totalCount}
            pageSize={pageSize}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onEdit={openReview}
            onDelete={handleDelete}
            onStatusToggle={handleStatusToggle}
            isLoading={loading}
          />
        </>
      ) : (
        <div className="animate-fade-in-up">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeReview}
            className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 hover:bg-transparent p-0 h-auto flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Back to Database
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="rounded-2xl shadow-sm h-full flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Feedback Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 flex-1">
                <div className="flex items-center gap-3.5">
                  <ToolLogo
                    tool={selectedReview.ai_tools}
                    toolName={selectedReview.ai_tools?.tool_info?.toolName || 'Unknown Tool'}
                  />
                  <div>
                    <h4 className="text-xl font-bold text-[var(--text-primary)] leading-tight">
                      {selectedReview.ai_tools?.tool_info?.toolName || 'Unknown Tool'}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {selectedReview.reviewer_name}
                      </span>

                      <div className="flex items-center text-amber-400 gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={13}
                            className={
                              i < (selectedReview.rating || 0)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 dark:text-slate-600 fill-transparent'
                            }
                          />
                        ))}
                        <span className="text-xs font-bold text-[var(--text-primary)] ml-1">
                          ({selectedReview.rating || 0}/5)
                        </span>
                      </div>

                      <span className="text-[10px] text-[var(--text-muted)] font-bold">
                        {new Date(selectedReview.review_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-3 -top-3 text-5xl text-indigo-500/10 font-serif leading-none select-none opacity-40">
                    &ldquo;
                  </div>
                  <div className="p-6 rounded-2xl bg-[var(--bg-elevated)]/50 border border-indigo-500/10 text-sm text-[var(--text-secondary)] leading-relaxed italic font-serif relative z-10">
                    &ldquo;{selectedReview.review_text}&rdquo;
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                      <Folder size={16} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-tight">
                        Moderation Controls
                      </CardTitle>
                      <CardDescription className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">
                        Set platform visibility
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Visibility Status
                    </label>
                    <Select
                      value={selectedReview.status === 'hide' || selectedReview.status === 'rejected' ? 'hide' : 'show'}
                      onChange={(val) => setSelectedReview({ ...selectedReview, status: val })}
                      className="h-11"
                    >
                      <option value="show">Approved</option>
                      <option value="hide">Rejected</option>
                    </Select>
                  </div>
                </CardContent>
              </div>

              <CardFooter className="pt-4 border-t border-[var(--border-color)] flex flex-col gap-3">
                <Button
                  onClick={() =>
                    handleStatusToggle(
                      selectedReview,
                      selectedReview.status === 'hide' || selectedReview.status === 'rejected' ? 'hide' : 'show'
                    )
                  }
                  disabled={isActionLoading}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-wider shadow-md shadow-indigo-600/15 cursor-pointer"
                  suppressHydrationWarning
                >
                  {isActionLoading ? <RefreshCw size={14} className="animate-spin" /> : 'Update Status'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
    </div>
  );
}
