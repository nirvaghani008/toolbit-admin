'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import {
  RefreshCw, Folder, Clock, CheckCircle2, XCircle,
  Star, ShieldAlert
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import ReviewTable, { Review, ToolLogo } from '@/components/reviews/ReviewTable';
import {
  getReviewsAction,
  getReviewStatsAction,
  updateReviewAction,
  updateReviewStatusAction,
  deleteReviewAction
} from './actions';

export default function ReviewsPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'reviews' module
  const canView = isSuperAdmin || hasPermission('reviews', 'view');
  const canUpdate = isSuperAdmin || hasPermission('reviews', 'update');
  const canDelete = isSuperAdmin || hasPermission('reviews', 'delete');

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

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchStats = useCallback(async () => {
    if (!canView) return;
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await getReviewStatsAction(token);
      if (res.success && res.stats) {
        setStats(res.stats);
        if (res.sparklines) {
          setSparklines(res.sparklines);
        }
        setRefreshKey((prev) => prev + 1);
      } else if (res.error) {
        console.warn('Error fetching review stats:', res.error);
      }
    } catch (err: any) {
      console.warn('Error fetching review stats:', err?.message || err);
    }
  }, [canView]);

  const fetchReviews = useCallback(async (manual = false) => {
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) fetchStats();
      const token = await getAuthToken();
      if (!token) {
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      const res = await getReviewsAction(
        {
          page: currentPage,
          pageSize,
          statusFilter,
          searchQuery,
          sortBy,
          sortOrder,
        },
        token
      );

      if (res.success && res.reviews) {
        setReviews(res.reviews);
        setTotalCount(res.totalCount || 0);
        if (manual) setRefreshKey((prev) => prev + 1);
      } else if (res.error) {
        console.warn('Error fetching reviews:', res.error);
      }
    } catch (err: any) {
      console.warn('Error fetching reviews:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [canView, currentPage, pageSize, statusFilter, searchQuery, sortBy, sortOrder, fetchStats]);

  useEffect(() => {
    if (canView) {
      fetchStats();
    }
  }, [canView, fetchStats]);

  useEffect(() => {
    if (canView) {
      fetchReviews();
    }
  }, [canView, fetchReviews]);

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
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update review status.');
      return;
    }

    if (selectedReview) {
      setIsActionLoading(true);
    } else {
      setIsRefreshing(true);
    }
    let newStatus = '';

    if (forceStatus) {
      newStatus = forceStatus;
    } else {
      const isCurrentlyLive = (review.status === 'show' || review.status === 'approved');
      newStatus = isCurrentlyLive ? 'hide' : 'show';
    }

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateReviewStatusAction(review.review_id, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update review status.');
      }

      await fetchStats();
      await fetchReviews(true);

      // If we are in the edit view, redirect back to main page
      if (selectedReview) {
        closeReview();
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert(err.message || 'Failed to update review status.');
    } finally {
      setIsActionLoading(false);
      setIsRefreshing(false);
    }
  };

  // Direct status change from a table row (via the shared StatusChangeControl confirmation popup)
  const handleStatusChange = async (id: number | string, newStatus: string) => {
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to update review status.');
    }

    const token = await getAuthToken();
    if (!token) throw new Error('Authentication required.');

    const res = await updateReviewStatusAction(id, newStatus, token);
    if (!res.success) {
      throw new Error(res.error || 'Failed to update review status.');
    }

    await fetchStats();
    await fetchReviews(true);
  };

  const handleDelete = async (id: number, name?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete reviews.');
      return;
    }

    const confirmed = await confirmDelete({
      title: 'Delete Review',
      itemName: name,
      message: 'Are you sure you want to permanently delete this review? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteReviewAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete review.');
      }

      await fetchStats();
      await fetchReviews(true);
    } catch (err: any) {
      console.error('Error deleting review:', err);
      alert(err.message || 'Failed to delete review.');
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

  // Unauthorized state for subadmins lacking reviews permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or moderate user reviews.
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Review Moderation</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage platform credibility and user trust.</p>
        </div>
        {!selectedReview && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchReviews(true)}
              disabled={isRefreshing}
              className="gap-2 text-sm font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              suppressHydrationWarning
            >
              {isRefreshing ? <Spinner size={16} className="text-zinc-500" /> : <RefreshCw size={16} />}
              Refresh
            </Button>
          </div>
        )}
      </div>

      {!selectedReview ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Reviews',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Folder size={17} />,
                points: sparklines.all,
                badge: 'All Reviews',
              },
              {
                id: 'pending',
                label: 'Pending',
                value: stats.pending,
                iconStyle: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
                badgeStyle: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                sparklineColor: 'text-[#8a652a] dark:text-amber-400',
                icon: <Clock size={17} />,
                points: sparklines.pending,
                badge: 'Pending',
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
                id: 'rejected',
                label: 'Rejected',
                value: stats.rejected,
                iconStyle: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
                badgeStyle: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                sparklineColor: 'text-[#824235] dark:text-rose-400',
                icon: <XCircle size={17} />,
                points: sparklines.rejected,
                badge: 'Rejected',
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

          {/* Search & Filter Controls */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search reviewer name or feedback content..."
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
                <option value="review_date-desc">Newest First</option>
                <option value="review_date-asc">Oldest First</option>
                <option value="reviewer_name-asc">Name (A-Z)</option>
                <option value="reviewer_name-desc">Name (Z-A)</option>
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
            <ReviewTable
              reviews={reviews}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={openReview}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              isLoading={loading}
            />
          </div>
        </>
      ) : (
        <div className="animate-fade-in-up">
          <StickyFormBackButton
            label="Back to Overview"
            onClick={closeReview}
            isLoading={isActionLoading}
          />

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
                  <div className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-color)] text-sm text-[var(--text-secondary)] leading-relaxed italic relative z-10">
                    &ldquo;{selectedReview.review_text}&rdquo;
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
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
                      value={
                        selectedReview.status === 'hide' || selectedReview.status === 'rejected'
                          ? 'hide'
                          : selectedReview.status === 'pending'
                          ? 'pending'
                          : 'show'
                      }
                      onChange={(val) => setSelectedReview({ ...selectedReview, status: val })}
                      disabled={isActionLoading || !canUpdate}
                      className="h-11"
                    >
                      <option value="show">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="hide">Rejected</option>
                    </Select>
                  </div>
                </CardContent>
              </div>

              <CardFooter className="pt-4 border-t border-[var(--border-color)] flex flex-col gap-3">
                <Button
                  onClick={() => handleStatusToggle(selectedReview, selectedReview.status)}
                  disabled={isActionLoading || !canUpdate}
                  className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs active:scale-95 cursor-pointer"
                  suppressHydrationWarning
                >
                  {isActionLoading ? <Spinner size={14} className="text-current shrink-0" /> : 'Update Status'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}



