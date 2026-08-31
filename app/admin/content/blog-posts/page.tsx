'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import BlogTable from '@/components/blogs/BlogTable';
import BlogPreviewModal from '@/components/blogs/BlogPreviewModal';
import CountUp from '@/components/common/CountUp';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import { buildSearchOrClause } from '@/lib/postgrest-search';
import { Database, CheckCircle2, FileText, Archive, XCircle, Clock, RefreshCw, Plus, Search, ShieldAlert } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import dynamic from 'next/dynamic';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  createBlogPostAction,
  updateBlogPostAction,
  updateBlogPostStatusAction,
  deleteBlogPostAction
} from './actions';

const BlogForm = dynamic(() => import('@/components/blogs/BlogForm'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-sm font-bold text-[var(--text-muted)] animate-pulse">Loading Blog Form Component...</div>
});

export default function BlogPostsPage() {
  const confirmDelete = useConfirm();
  const { hasPermission, isAuthorized, isSuperAdmin } = useAdmin();

  // Granular RBAC permissions for 'blog_posts' module
  const canView = isSuperAdmin || hasPermission('blog_posts', 'view');
  const canInsert = isSuperAdmin || hasPermission('blog_posts', 'insert');
  const canUpdate = isSuperAdmin || hasPermission('blog_posts', 'update');
  const canDelete = isSuperAdmin || hasPermission('blog_posts', 'delete');

  const [blogs, setBlogs] = useState<any[]>([]);
  const [previewBlog, setPreviewBlog] = useState<any | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    published: 0,
    pending: 0,
    draft: 0,
    rejected: 0,
    archived: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    published: [0, 0, 0, 0, 0, 0, 0],
    pending: [0, 0, 0, 0, 0, 0, 0],
    draft: [0, 0, 0, 0, 0, 0, 0],
    rejected: [0, 0, 0, 0, 0, 0, 0],
    archived: [0, 0, 0, 0, 0, 0, 0]
  });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'pending' | 'draft' | 'rejected' | 'archived'>('all');
  const [authorFilter, setAuthorFilter] = useState<'all' | 'U' | 'A'>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'title'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showForm, setShowForm] = useState(false);
  const [editingBlog, setEditingBlog] = useState<any>(null);

  // Synchronize form state with browser history (Back/Forward support)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.formOpen) {
        setShowForm(true);
        if (e.state.editingData) setEditingBlog(e.state.editingData);
      } else {
        setShowForm(false);
        setEditingBlog(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openForm = (blog: any = null) => {
    if (blog && !canUpdate) {
      alert('Access denied: You do not have permission to edit blog posts.');
      return;
    }
    if (!blog && !canInsert) {
      alert('Access denied: You do not have permission to create blog posts.');
      return;
    }
    setEditingBlog(blog);
    setShowForm(true);
    window.history.pushState({ formOpen: true, editingData: blog }, '');
  };

  const closeForm = () => {
    if (showForm) {
      setShowForm(false);
      setEditingBlog(null);
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
        { count: cPub },
        { count: cPen },
        { count: cDraft },
        { count: cRej },
        { count: cArc }
      ] = await Promise.all([
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'archived')
      ]);

      const all = cAll || 0;
      const published = cPub || 0;
      const pending = cPen || 0;
      const draft = cDraft || 0;
      const rejected = cRej || 0;
      const archived = cArc || 0;

      setStats({ all, published, pending, draft, rejected, archived });

      try {
        const trends = await fetchSparklinesForStatuses(
          'blog_posts',
          [null, 'published', 'pending', 'draft', 'rejected', 'archived'],
          'updated_at',
          7
        );

        setSparklines({
          all: trends['all'] || [],
          published: trends['published'] || [],
          pending: trends['pending'] || [],
          draft: trends['draft'] || [],
          rejected: trends['rejected'] || [],
          archived: trends['archived'] || []
        });
      } catch (trendErr) {
        console.warn('Sparklines trend fetch warning:', trendErr);
      }
    } catch (err: any) {
      console.warn('Error fetching blog stats:', err?.message || err);
    }
  };

  const fetchBlogs = async (manual = false) => {
    if (!canView) return;
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) fetchStats();

      let query = supabase
        .from('blog_posts')
        .select(`
          id,
          title,
          slug,
          description,
          featured_image_url,
          author_name,
          status,
          categories,
          tags,
          meta_title,
          meta_description,
          reading_time_minutes,
          view_count,
          is_featured,
          is_paid,
          submission_tier,
          ai_approved,
          ai_denied_reason,
          created_at,
          updated_at,
          external_source_url,
          content_mdx
        `, { count: 'exact' });

      // Apply Search
      const searchOrClause = buildSearchOrClause(['title', 'slug', 'description'], searchQuery);
      if (searchOrClause) {
        query = query.or(searchOrClause);
      }

      // Apply Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply Author Filter (A = Admin, U = User)
      if (authorFilter === 'A') {
        query = query.ilike('author_name', '%Toolbit AI%');
      } else if (authorFilter === 'U') {
        query = query.not('author_name', 'ilike', '%Toolbit AI%');
      }

      // Apply Sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' }).order('id', { ascending: sortOrder === 'asc' });

      // Apply Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      setBlogs(data || []);
      setTotalCount(count || 0);
      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching blogs:', err?.message || err);
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
      fetchBlogs();
    }
  }, [canView, searchQuery, statusFilter, authorFilter, sortBy, sortOrder, currentPage]);

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

  const handleAddBlog = async (formData: any) => {
    if (!canInsert) {
      throw new Error('Access denied: You do not have permission to create blog posts.');
    }
    setIsActionLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await createBlogPostAction(formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create blog post.');
      }

      await fetchBlogs(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding blog:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateBlog = async (formData: any) => {
    if (!canUpdate) {
      throw new Error('Access denied: You do not have permission to edit blog posts.');
    }
    setIsActionLoading(true);
    try {
      const targetId = editingBlog?.id;
      if (!targetId) throw new Error('Missing blog post ID for update.');

      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required. Please log in.');

      const res = await updateBlogPostAction(targetId, formData, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update blog post.');
      }

      await fetchBlogs(true);
      closeForm();
    } catch (err: any) {
      console.error('Error updating blog:', err);
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteBlog = async (id: number, name?: string) => {
    if (!canDelete) {
      alert('Access denied: You do not have permission to delete blog posts.');
      return;
    }
    const confirmed = await confirmDelete({
      title: 'Delete Blog Post',
      itemName: name,
      message: 'Are you sure you want to permanently delete this blog post? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await deleteBlogPostAction(id, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete blog post.');
      }

      await fetchBlogs(true);
    } catch (err: any) {
      console.error('Error deleting blog:', err);
      alert(err.message || 'Failed to delete blog post.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBlogStatusChange = async (blogId: number, newStatus: string) => {
    if (!canUpdate) {
      alert('Access denied: You do not have permission to update blog status.');
      return;
    }
    setIsRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required.');

      const res = await updateBlogPostStatusAction(blogId, newStatus, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update blog status.');
      }

      // Optimistically update blogs in local state
      setBlogs(prev => prev.map(b => b.id === blogId ? { ...b, status: newStatus, updated_at: new Date().toISOString() } : b));
      await fetchStats();
    } catch (err: any) {
      console.error('Error updating blog status:', err);
      alert('Failed to update blog status: ' + (err?.message || 'Unknown error'));
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

  // Unauthorized state for subadmins lacking blog_posts permission
  if (isAuthorized && !canView) {
    return (
      <div className="max-w-[800px] mx-auto p-8 my-16 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto">
          Your account does not have permission to view or manage Blog Posts.
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Blogs Management</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Create and manage platform blog posts.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fetchBlogs(true)}
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
                + New Post
              </Button>
            )}
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[
              {
                id: 'all',
                label: 'Total Blogs',
                value: stats.all,
                iconStyle: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#364954] dark:text-zinc-400',
                icon: <Database size={17} />,
                points: sparklines.all,
                badge: 'All Blogs'
              },
              {
                id: 'published',
                label: 'Published',
                value: stats.published,
                iconStyle: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
                badgeStyle: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                sparklineColor: 'text-[#3c5748] dark:text-emerald-400',
                icon: <CheckCircle2 size={17} />,
                points: sparklines.published,
                badge: 'Published'
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
                badge: 'Pending'
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
                badge: 'Draft'
              },
              {
                id: 'rejected',
                label: 'Rejected',
                value: stats.rejected,
                iconStyle: 'text-[#7a3030] bg-[#fdf0f0] border-[#f5d0d0] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
                badgeStyle: 'bg-[#fdf0f0] text-[#7a3030] border-[#f5d0d0] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
                sparklineColor: 'text-[#7a3030] dark:text-rose-400',
                icon: <XCircle size={17} />,
                points: sparklines.rejected,
                badge: 'Rejected'
              },
              {
                id: 'archived',
                label: 'Archived',
                value: stats.archived,
                iconStyle: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
                badgeStyle: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
                sparklineColor: 'text-[#474c50] dark:text-zinc-400',
                icon: <Archive size={17} />,
                points: sparklines.archived,
                badge: 'Archived'
              },
            ].map((stat) => {
              const isSelected = statusFilter === stat.id;
              return (
                <button
                  key={stat.id}
                  onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id as any); setCurrentPage(1); }}
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

          {/* Search & Filter Bar */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 flex gap-2">
              <Input
                type="text"
                placeholder="Search articles across title, slug, or description..."
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
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

            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              {/* Author Filter Dropdown */}
              <Select
                value={authorFilter}
                onChange={(val) => {
                  setAuthorFilter(val as any);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[130px]"
                suppressHydrationWarning
              >
                <option value="all">All Authors</option>
                <option value="A">Admin</option>
                <option value="U">User</option>
              </Select>

              {/* Sort Order Dropdown */}
              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(val) => {
                  const [newSort, newOrder] = val.split('-') as [any, any];
                  setSortBy(newSort);
                  setSortOrder(newOrder);
                }}
                className="h-11 min-w-[170px]"
                suppressHydrationWarning
              >
                <option value="updated_at-desc">Last Updated</option>
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="title-asc">Name (A-Z)</option>
                <option value="title-desc">Name (Z-A)</option>
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
            <BlogTable
              blogs={blogs}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={(b) => openForm(b)}
              onDelete={handleDeleteBlog}
              onPreview={(b) => setPreviewBlog(b)}
              onStatusChange={handleBlogStatusChange}
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
          <BlogForm
            initialData={editingBlog}
            onSubmit={editingBlog ? handleUpdateBlog : handleAddBlog}
            onCancel={closeForm}
            isLoading={isActionLoading}
          />
        </div>
      )}

      {/* Article Live Preview Modal */}
      {previewBlog && (
        <BlogPreviewModal
          blog={previewBlog}
          onClose={() => setPreviewBlog(null)}
        />
      )}
    </div>
  );
}


