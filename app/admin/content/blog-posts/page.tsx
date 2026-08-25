'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import BlogTable from '@/components/blogs/BlogTable';
import BlogPreviewModal from '@/components/blogs/BlogPreviewModal';
import CountUp from '@/components/common/CountUp';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchSparklinesForStatuses } from '@/lib/sparkline-utils';
import { Database, CheckCircle2, FileText, Archive, RefreshCw, Plus, ArrowLeft, Search } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import dynamic from 'next/dynamic';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const BlogForm = dynamic(() => import('@/components/blogs/BlogForm'), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-sm font-bold text-[var(--text-muted)] animate-pulse">Loading Blog Form Component...</div>
});

export default function BlogPostsPage() {
  const confirmDelete = useConfirm();
  const [blogs, setBlogs] = useState<any[]>([]);
  const [previewBlog, setPreviewBlog] = useState<any | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    all: 0,
    published: 0,
    pending: 0,
    draft: 0,
    archived: 0
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    all: [0, 0, 0, 0, 0, 0, 0],
    published: [0, 0, 0, 0, 0, 0, 0],
    pending: [0, 0, 0, 0, 0, 0, 0],
    draft: [0, 0, 0, 0, 0, 0, 0],
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'pending' | 'draft' | 'archived'>('all');
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
    try {
      let all = 0, published = 0, pending = 0, draft = 0, archived = 0;

      const { data: statusCounts, error: countError } = await supabase.rpc('get_status_counts', {
        tbl_name: 'blog_posts'
      });

      if (!countError && statusCounts) {
        all = statusCounts.total || 0;
        published = statusCounts.published || 0;
        pending = statusCounts.pending || 0;
        draft = statusCounts.draft || 0;
        archived = statusCounts.archived || 0;
      } else {
        const [
          { count: cAll },
          { count: cPub },
          { count: cPen },
          { count: cDraft },
          { count: cArc }
        ] = await Promise.all([
          supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
          supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
          supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'archived')
        ]);

        all = cAll || 0;
        published = cPub || 0;
        pending = cPen || 0;
        draft = cDraft || 0;
        archived = cArc || 0;
      }

      setStats({ all, published, pending, draft, archived });

      try {
        const trends = await fetchSparklinesForStatuses(
          'blog_posts',
          [null, 'published', 'pending', 'draft', 'archived'],
          'updated_at',
          7
        );

        setSparklines({
          all: trends['all'] || [],
          published: trends['published'] || [],
          pending: trends['pending'] || [],
          draft: trends['draft'] || [],
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
    if (manual) setIsRefreshing(true);
    setLoading(true);

    try {
      if (manual) fetchStats();

      let query = supabase
        .from('blog_posts')
        .select('*', { count: 'exact' });

      // Apply Search
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      // Apply Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply Author Filter (A = Admin, U = User)
      if (authorFilter === 'A') {
        query = query.ilike('author_name', '%Toolbit AI%');
      } else if (authorFilter === 'U') {
        query = query.or('author_name.is.null,author_name.not.ilike.%Toolbit AI%');
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
    fetchStats();
  }, []);

  useEffect(() => {
    fetchBlogs();
  }, [searchQuery, statusFilter, authorFilter, sortBy, sortOrder, currentPage]);

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

  const handleAddBlog = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('blog_posts').insert([formData]);
      if (error) throw error;

      await fetchStats();
      await fetchBlogs(true);
      closeForm();
    } catch (err: any) {
      console.error('Error adding blog:', err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This slug is already in use by another blog post.');
      }
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateBlog = async (formData: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', editingBlog.id);

      if (error) throw error;

      await fetchStats();
      await fetchBlogs(true);

      closeForm();
    } catch (err: any) {
      console.error('Error updating blog:', err);
      if (err?.code === '23505') {
        throw new Error('Duplicate URL slug. This slug is already in use by another blog post.');
      }
      throw new Error(err.message || 'An error occurred while saving.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteBlog = async (id: number) => {
    const confirmed = await confirmDelete({
      title: 'Delete Blog Post',
      message: 'Are you sure you want to permanently delete this blog post? This action cannot be undone.'
    });
    if (!confirmed) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('blog_posts').delete().eq('id', id);
      if (error) throw error;

      await fetchStats();
      await fetchBlogs(true);
    } catch (err) {
      console.error('Error deleting blog:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

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
              size="sm"
              onClick={() => fetchBlogs(true)}
              disabled={isRefreshing}
              className="h-9 px-3.5 font-semibold text-xs text-[var(--text-secondary)] shadow-2xs"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => openForm()}
              className="h-9 px-4 text-xs font-bold shadow-md shadow-indigo-600/20"
            >
              <Plus size={14} />
              <span>New Post</span>
            </Button>
          </div>
        )}
      </div>

      {!showForm ? (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { id: 'all', label: 'Total Blogs', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Database size={18} />, points: sparklines.all },
              { id: 'published', label: 'Published', value: stats.published, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.published },
              { id: 'pending', label: 'Pending', value: stats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <Archive size={18} />, points: sparklines.pending },
              { id: 'draft', label: 'Draft', value: stats.draft, color: 'text-violet-500', bg: 'bg-violet-500/10', hex: '#7c3aed', icon: <FileText size={18} />, points: sparklines.draft },
              { id: 'archived', label: 'Archived', value: stats.archived, color: 'text-slate-500', bg: 'bg-slate-500/10', hex: '#64748b', icon: <Archive size={18} />, points: sparklines.archived },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => { setStatusFilter(prev => prev === stat.id ? 'all' : stat.id as any); setCurrentPage(1); }}
                className={`professional-card text-left rounded-2xl shadow-sm border group relative overflow-hidden transition-all duration-300 hover:shadow-md flex flex-col cursor-pointer ${
                  statusFilter === stat.id
                    ? 'bg-[var(--bg-elevated)] border-indigo-500/30 shadow-md'
                    : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                }`}
                style={statusFilter === stat.id ? { borderColor: stat.hex, boxShadow: `0 8px 20px -4px ${stat.hex}15` } : undefined}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br transition-opacity pointer-events-none ${
                    statusFilter === stat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{ backgroundImage: `linear-gradient(to bottom right, ${stat.hex}${statusFilter === stat.id ? '15' : '05'}, transparent)` }}
                />

                <Sparkline color={stat.color} points={stat.points} id={stat.id} isSelected={statusFilter === stat.id} />

                {statusFilter === stat.id && (
                  <div className="absolute top-4 right-4 z-20 flex items-center justify-center">
                    <div className="absolute w-1.5 h-1.5 rounded-full animate-ping opacity-75" style={{ backgroundColor: stat.hex }} />
                    <div className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stat.hex, boxShadow: `0 0 6px ${stat.hex}` }} />
                  </div>
                )}

                <div className="p-5 pb-4 flex-1 relative z-10 w-full pointer-events-none">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-2xs transition-transform group-hover:scale-105 ${stat.color} ${stat.bg}`}>
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

          {/* Search & Filter Bar */}
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search articles (title, slug, or description)..."
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                  className="pl-10 h-10 text-xs"
                />
              </div>
              <Button
                type="submit"
                variant="default"
                className="h-10 px-5 text-xs font-bold shrink-0"
              >
                Search
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {/* Author Filter Dropdown */}
              <div className="w-[105px]">
                <Select
                  value={authorFilter}
                  onChange={(val) => {
                    setAuthorFilter(val as any);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'all', label: 'All Authors' },
                    { value: 'A', label: 'Admin' },
                    { value: 'U', label: 'User' },
                  ]}
                  className="h-10 text-xs"
                />
              </div>

              {/* Sort Order Dropdown */}
              <div className="w-[165px]">
                <Select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(val) => {
                    const [newSort, newOrder] = val.split('-') as [any, any];
                    setSortBy(newSort);
                    setSortOrder(newOrder);
                  }}
                  options={[
                    { value: 'updated_at-desc', label: 'Last Updated' },
                    { value: 'created_at-desc', label: 'Newest First' },
                    { value: 'created_at-asc', label: 'Oldest First' },
                    { value: 'title-asc', label: 'Name (A-Z)' },
                    { value: 'title-desc', label: 'Name (Z-A)' },
                  ]}
                  className="h-10 text-xs"
                />
              </div>
            </div>
          </form>

          {/* Table Container */}
          <div>
            <BlogTable
              blogs={blogs}
              totalCount={totalCount}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEdit={(b) => openForm(b)}
              onDelete={handleDeleteBlog}
              onPreview={(b) => setPreviewBlog(b)}
              isLoading={loading}
            />
          </div>
        </>
      ) : (
        <div className="animate-fade-in-up">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeForm}
            className="mb-6 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-1.5 p-0 h-auto"
          >
            <ArrowLeft size={16} />
            <span>Back to Content List</span>
          </Button>
          <BlogForm
            initialData={editingBlog}
            onSubmit={editingBlog ? handleUpdateBlog : handleAddBlog}
            onCancel={closeForm}
          />
        </div>
      )}

      {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}

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
