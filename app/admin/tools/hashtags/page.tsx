'use client';

import { useState, useEffect } from 'react';
import HashtagTable from '@/components/hashtags/HashtagTable';
import HashtagForm from '@/components/hashtags/HashtagForm';
import { supabase } from '@/lib/supabase';
import CountUp from '@/components/common/CountUp';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import { fetchTableStatsAndSparklines } from '@/lib/sparkline-utils';
import { Database, CheckCircle2, XCircle, FileText, Archive, RefreshCw, Plus, ArrowLeft, Search } from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function HashtagsPage() {
    const confirmDelete = useConfirm();
    const [hashtags, setHashtags] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [stats, setStats] = useState({
        all: 0,
        show: 0,
        hide: 0,
        draft: 0,
        archived: 0
    });
    const [sparklines, setSparklines] = useState<Record<string, number[]>>({
        all: [0, 0, 0, 0, 0, 0, 0],
        show: [0, 0, 0, 0, 0, 0, 0],
        hide: [0, 0, 0, 0, 0, 0, 0],
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
    const [statusFilter, setStatusFilter] = useState<'all' | 'show' | 'hide' | 'draft' | 'archived'>('all');
    const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'name'>('updated_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [showForm, setShowForm] = useState(false);
    const [editingHashtag, setEditingHashtag] = useState<any>(null);

    // Synchronize form state with browser history (Back/Forward support)
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state?.formOpen) {
                setShowForm(true);
                if (e.state.editingData) setEditingHashtag(e.state.editingData);
            } else {
                setShowForm(false);
                setEditingHashtag(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const openForm = (hashtag: any = null) => {
        setEditingHashtag(hashtag);
        setShowForm(true);
        window.history.pushState({ formOpen: true, editingData: hashtag }, '');
    };

    const closeForm = () => {
        if (showForm) {
            setShowForm(false);
            setEditingHashtag(null);
            if (window.history.state?.formOpen) {
                window.history.back();
            }
        }
    };

    const fetchStats = async () => {
        try {
            const { counts, sparklines: trends } = await fetchTableStatsAndSparklines(
                'tags',
                ['show', 'hide', 'draft', 'archived'],
                'updated_at',
                7
            );

            setStats({
                all: counts.total || 0,
                show: counts.show || 0,
                hide: counts.hide || 0,
                draft: counts.draft || 0,
                archived: counts.archived || 0
            });

            setSparklines({
                all: trends['all'] || [],
                show: trends['show'] || [],
                hide: trends['hide'] || [],
                draft: trends['draft'] || [],
                archived: trends['archived'] || []
            });
        } catch (err: any) {
            console.warn('Error fetching stats:', err?.message || err);
        }
    };

    const fetchHashtags = async (manual = false) => {
        if (manual) setIsRefreshing(true);
        setLoading(true);

        try {
            if (manual) await fetchStats();
            let query = supabase
                .from('tags')
                .select('*', { count: 'exact' });

            // Apply Search
            if (searchQuery) {
                query = query.or(`name.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
            }

            // Apply Status Filter
            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            // Apply Sorting
            const sortCol = (sortBy === 'created_at' || sortBy === 'updated_at') ? 'updated_at' : 'name';
            query = query.order(sortCol, { ascending: sortOrder === 'asc' }).order('id', { ascending: sortOrder === 'asc' });

            // Apply Pagination
            const from = (currentPage - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data, count, error } = await query;

            if (error) throw error;
            setHashtags(data || []);
            setTotalCount(count || 0);

            if (manual) setRefreshKey(prev => prev + 1);
        } catch (err: any) {
            console.warn('Error fetching hashtags:', err?.message || err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        fetchHashtags();
    }, [currentPage, statusFilter, sortBy, sortOrder, searchQuery]);

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

    const handleAddHashtag = async (formData: any) => {
        setIsActionLoading(true);
        try {
            const { error } = await supabase.from('tags').insert([{ ...formData, updated_at: new Date().toISOString() }]);
            if (error) throw error;

            await fetchStats();
            await fetchHashtags(true);
            closeForm();
        } catch (err: any) {
            console.error('Error adding hashtag:', err);
            if (err?.code === '23505') {
                throw new Error('Duplicate URL slug. This URL is already in use by another hashtag.');
            }
            throw new Error(err.message || 'An error occurred while saving.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleUpdateHashtag = async (formData: any) => {
        setIsActionLoading(true);
        try {
            const { error } = await supabase
                .from('tags')
                .update({ ...formData, updated_at: new Date().toISOString() })
                .eq('id', editingHashtag.id || editingHashtag.hashtag_id);

            if (error) throw error;

            await fetchStats();
            await fetchHashtags(true);
            closeForm();
        } catch (err: any) {
            console.error('Error updating hashtag:', err);
            if (err?.code === '23505') {
                throw new Error('Duplicate URL slug. This URL is already in use by another hashtag.');
            }
            throw new Error(err.message || 'An error occurred while saving.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteHashtag = async (id: number) => {
        const confirmed = await confirmDelete({
            title: 'Delete Hashtag',
            message: 'Are you sure you want to permanently delete this hashtag? This action cannot be undone.'
        });
        if (!confirmed) return;
        setIsActionLoading(true);
        try {
            const { error } = await supabase.from('tags').delete().eq('id', id);
            if (error) throw error;

            await fetchStats();
            await fetchHashtags(true);
        } catch (err) {
            console.error('Error deleting hashtag:', err);
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <div className="animate-fade-in max-w-[1500px] mx-auto p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Hashtags Database</h1>
                    <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage platform-wide tags and discoverability labels.</p>
                </div>
                {!showForm && (
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            size="default"
                            onClick={() => fetchHashtags(true)}
                            disabled={isRefreshing}
                            className="font-semibold shadow-xs"
                            suppressHydrationWarning
                        >
                            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
                            {isRefreshing ? 'Syncing...' : 'Refresh'}
                        </Button>
                        <Button
                            variant="default"
                            size="default"
                            onClick={() => openForm()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                            suppressHydrationWarning
                        >
                            <Plus size={16} />
                            Add Hashtag
                        </Button>
                    </div>
                )}
            </div>

            {!showForm ? (
                <>
                    {/* Stats Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                        {[
                            { id: 'all', label: 'Total Hashtags', value: stats.all, color: 'text-indigo-500', bg: 'bg-indigo-500/10', hex: '#6366f1', icon: <Database size={18} />, points: sparklines.all },
                            { id: 'show', label: 'Show', value: stats.show, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hex: '#10b981', icon: <CheckCircle2 size={18} />, points: sparklines.show },
                            { id: 'hide', label: 'Hide', value: stats.hide, color: 'text-rose-500', bg: 'bg-rose-500/10', hex: '#f43f5e', icon: <XCircle size={18} />, points: sparklines.hide },
                            { id: 'draft', label: 'Drafts', value: stats.draft, color: 'text-amber-500', bg: 'bg-amber-500/10', hex: '#f59e0b', icon: <FileText size={18} />, points: sparklines.draft },
                            { id: 'archived', label: 'Archived', value: stats.archived, color: 'text-slate-500', bg: 'bg-slate-500/10', hex: '#64748b', icon: <Archive size={18} />, points: sparklines.archived },
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

                    <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1 flex gap-2">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                                <Input
                                    type="text"
                                    placeholder="Search across all hashtags (name or URL)..."
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
                                <option value="updated_at-desc">Last Updated</option>
                                <option value="created_at-desc">Newest First</option>
                                <option value="created_at-asc">Oldest First</option>
                                <option value="name-asc">Name (A-Z)</option>
                                <option value="name-desc">Name (Z-A)</option>
                            </Select>
                        </div>
                    </form>


                    <div>
                        <HashtagTable
                            hashtags={hashtags}
                            totalCount={totalCount}
                            pageSize={pageSize}
                            currentPage={currentPage}
                            onPageChange={setCurrentPage}
                            onEdit={(h) => openForm(h)}
                            onDelete={handleDeleteHashtag}
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
                        className="mb-6 text-sm font-bold text-indigo-500 hover:text-indigo-600 hover:bg-transparent p-0 h-auto flex items-center gap-2"
                    >
                        <ArrowLeft size={16} /> Back to Overview
                    </Button>
                    <HashtagForm initialData={editingHashtag} onSubmit={editingHashtag ? handleUpdateHashtag : handleAddHashtag} onCancel={closeForm} />
                </div>
            )}

            {isActionLoading && <LoadingOverlay message="Synchronizing with database..." />}
        </div>
    );
}
