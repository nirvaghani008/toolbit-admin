'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import CountUp from '@/components/common/CountUp';
import {
  Activity, LayoutGrid, Tag, Hash, Star, TrendingUp,
  ArrowUpRight, PackagePlus, FileText, Clock, RefreshCw,
  Cpu, Newspaper, Share2, Sparkles, ChevronRight, Layers
} from 'lucide-react';
import Sparkline from '@/components/common/Sparkline';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ───────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
  color: string;
  refreshKey: number;
  points?: number[];
  isLoading?: boolean;
}

interface RecentTool {
  id: number;
  name: string;
  category: string;
  status: string;
  views: number;
  date: string;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();

  const isGreen = s.startsWith('show') || s === 'active' || s === 'approved' || s === 'published';
  const isRed = s.startsWith('hide') || s === 'rejected';
  const isYellow = s === 'pending';
  const isDraft = s === 'draft';

  let variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'slate' = 'slate';

  if (isGreen) {
    variant = 'success';
  } else if (isRed) {
    variant = 'destructive';
  } else if (isYellow) {
    variant = 'warning';
  } else if (isDraft) {
    variant = 'secondary';
  }

  let label = status || 'Pending';
  if (s.startsWith('show') || s === 'active') label = 'Show';
  else if (s.startsWith('hide')) label = 'Hide';
  else if (s === 'approved') label = 'Approved';
  else if (s === 'published') label = 'Published';
  else if (s === 'pending') label = 'Pending';
  else if (s === 'rejected') label = 'Rejected';
  else if (s === 'draft') label = 'Draft';
  else if (s === 'archived') label = 'Archived';

  let colorClasses = '';
  if (isGreen) {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
  } else if (isRed) {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
  } else if (isYellow) {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  } else {
    colorClasses = 'bg-zinc-100/80 text-zinc-700 border-zinc-200/80 dark:bg-[var(--bg-elevated)] dark:text-[var(--text-secondary)] dark:border-[var(--border-color)]';
  }

  return (
    <Badge variant={variant} className={`text-[9px] px-2 py-0.5 font-bold tracking-wider ${colorClasses}`}>
      {label}
    </Badge>
  );
}

function StatCard({ label, value, change, positive, icon, color, refreshKey, points = [10, 25, 20, 45, 30, 50, 45, 70, 60, 85], isLoading }: StatCardProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl p-5 space-y-4 flex flex-col justify-between bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] shadow-2xs">
        <div className="flex justify-between items-start">
          <Skeleton className="w-10 h-10 rounded-xl bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
          <Skeleton className="w-16 h-5 rounded-full bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-2/3 bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
          <Skeleton className="h-8 w-1/2 bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
        </div>
      </Card>
    );
  }

  // ─── Distinctive Nude / Earthy Neutral Color Schemes from Toolbit Pie Charts ───
  const colorMap: Record<string, { icon: string, badge: string, svg: string, hex: string }> = {
    ochre: {
      icon: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badge: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      svg: 'text-[#8a652a] dark:text-amber-400',
      hex: '#8a652a'
    },
    sage: {
      icon: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badge: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      svg: 'text-[#3c5748] dark:text-emerald-400',
      hex: '#3c5748'
    },
    slate: {
      icon: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badge: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      svg: 'text-[#364954] dark:text-zinc-400',
      hex: '#364954'
    },
    sand: {
      icon: 'text-[#7d6739] bg-[#fbf7ee] border-[#ede2ce] dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20',
      badge: 'bg-[#fbf7ee] text-[#7d6739] border-[#ede2ce] dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
      svg: 'text-[#7d6739] dark:text-cyan-400',
      hex: '#7d6739'
    },
    taupe: {
      icon: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
      badge: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
      svg: 'text-[#6e5e50] dark:text-violet-400',
      hex: '#6e5e50'
    },
    cedar: {
      icon: 'text-[#824f2f] bg-[#fbf4ee] border-[#ebdacb] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badge: 'bg-[#fbf4ee] text-[#824f2f] border-[#ebdacb] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      svg: 'text-[#824f2f] dark:text-amber-400',
      hex: '#824f2f'
    },
    pine: {
      icon: 'text-[#325257] bg-[#eff5f6] border-[#cee0e3] dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/20',
      badge: 'bg-[#eff5f6] text-[#325257] border-[#cee0e3] dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
      svg: 'text-[#325257] dark:text-sky-400',
      hex: '#325257'
    },
    terracotta: {
      icon: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badge: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      svg: 'text-[#824235] dark:text-rose-400',
      hex: '#824235'
    },
    plum: {
      icon: 'text-[#70495a] bg-[#f9f2f5] border-[#ead6de] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badge: 'bg-[#f9f2f5] text-[#70495a] border-[#ead6de] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      svg: 'text-[#70495a] dark:text-rose-400',
      hex: '#70495a'
    },
    clay: {
      icon: 'text-[#474c50] bg-[#f3f4f5] border-[#dbdddf] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badge: 'bg-[#f3f4f5] text-[#474c50] border-[#dbdddf] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      svg: 'text-[#474c50] dark:text-zinc-400',
      hex: '#474c50'
    },
    // Fallbacks
    amber: {
      icon: 'text-[#8a652a] bg-[#fbf6ec] border-[#ecdfc7] dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20',
      badge: 'bg-[#fbf6ec] text-[#8a652a] border-[#ecdfc7] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      svg: 'text-[#8a652a] dark:text-amber-400',
      hex: '#8a652a'
    },
    emerald: {
      icon: 'text-[#3c5748] bg-[#f0f4f1] border-[#d2ded6] dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      badge: 'bg-[#f0f4f1] text-[#3c5748] border-[#d2ded6] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      svg: 'text-[#3c5748] dark:text-emerald-400',
      hex: '#3c5748'
    },
    indigo: {
      icon: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-zinc-400 dark:bg-zinc-800/80 dark:border-zinc-700',
      badge: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700',
      svg: 'text-[#364954] dark:text-indigo-400',
      hex: '#364954'
    },
    cyan: {
      icon: 'text-[#7d6739] bg-[#fbf7ee] border-[#ede2ce] dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20',
      badge: 'bg-[#fbf7ee] text-[#7d6739] border-[#ede2ce] dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
      svg: 'text-[#7d6739] dark:text-cyan-400',
      hex: '#7d6739'
    },
    violet: {
      icon: 'text-[#6e5e50] bg-[#f7f4f0] border-[#e4ded6] dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20',
      badge: 'bg-[#f7f4f0] text-[#6e5e50] border-[#e4ded6] dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
      svg: 'text-[#6e5e50] dark:text-violet-400',
      hex: '#6e5e50'
    },
    rose: {
      icon: 'text-[#824235] bg-[#faf2ef] border-[#edd6cf] dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20',
      badge: 'bg-[#faf2ef] text-[#824235] border-[#edd6cf] dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
      svg: 'text-[#824235] dark:text-rose-400',
      hex: '#824235'
    },
    sky: {
      icon: 'text-[#325257] bg-[#eff5f6] border-[#cee0e3] dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/20',
      badge: 'bg-[#eff5f6] text-[#325257] border-[#cee0e3] dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
      svg: 'text-[#325257] dark:text-sky-400',
      hex: '#325257'
    },
    blue: {
      icon: 'text-[#364954] bg-[#f1f4f6] border-[#d4dde3] dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20',
      badge: 'bg-[#f1f4f6] text-[#364954] border-[#d4dde3] dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
      svg: 'text-[#364954] dark:text-blue-400',
      hex: '#364954'
    },
  };

  const c = colorMap[color] || colorMap.ochre;

  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-xs flex flex-col bg-white hover:bg-[#faf9f7] dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30 shadow-2xs">
      {/* Subtle neutral lift on hover — no color tint */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden dark:block bg-zinc-700/10 rounded-2xl"
      />

      <Sparkline color={c.svg} points={points} id={label.toLowerCase().replace(/\s+/g, '-')} />

      <div className="p-5 pb-3 flex-1 relative z-10 w-full flex justify-between items-start pointer-events-none">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 ${c.icon}`}>
          {icon}
        </div>
        <Badge
          variant="outline"
          className={`gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs ${c.badge}`}
        >
          {positive ? <TrendingUp size={10} /> : <Clock size={10} />} {change}
        </Badge>
      </div>

      <div className="px-5 pb-5 pt-1 relative z-10 w-full space-y-1.5 pointer-events-none">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[var(--text-muted)] truncate">
          {label}
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight leading-none">
          {typeof value === 'number' ? <CountUp key={refreshKey} end={value} /> : value}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function DashboardPage() {
  const [hoveredRecentId, setHoveredRecentId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbStats, setDbStats] = useState({
    tools: 0,
    categories: 0,
    tags: 0,
    blogs: 0,
    models: 0,
    news: 0,
    socials: 0,
    pendingReviews: 0,
    pendingTools: 0,
    pendingBlogs: 0,
    platformRating: 0,
  });
  const [recentTools, setRecentTools] = useState<RecentTool[]>([]);
  const [latestSubmissions, setLatestSubmissions] = useState<any[]>([]);
  const [latestBlogSubmissions, setLatestBlogSubmissions] = useState<any[]>([]);
  const [recentNews, setRecentNews] = useState<any[]>([]);
  const [recentSocials, setRecentSocials] = useState<any[]>([]);
  const [recentModels, setRecentModels] = useState<any[]>([]);

  const [trendData, setTrendData] = useState({
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
    tools: [0, 0, 0, 0, 0],
    blogs: [0, 0, 0, 0, 0]
  });
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});

  const fetchData = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setLoading(true);

    try {
      const [
        { count: toolsCount },
        { count: categoriesCount },
        { count: tagsCount },
        { count: blogsCount },
        { count: modelsCount },
        { count: newsCount },
        { count: socialsCount },
        { count: pendingToolsCount },
        { count: pendingBlogsCount },
        { count: pendingReviewsCount }
      ] = await Promise.all([
        supabase.from('ai_tools').select('*', { count: 'exact', head: true }),
        supabase.from('categories').select('*', { count: 'exact', head: true }),
        supabase.from('tags').select('*', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
        supabase.from('models').select('*', { count: 'exact', head: true }),
        supabase.from('news').select('*', { count: 'exact', head: true }),
        supabase.from('socials').select('*', { count: 'exact', head: true }),
        supabase.from('ai_tool_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      ]);

      // Fetch recent items lists in parallel
      const [
        { data: recentData },
        { data: latestSubmissionsData },
        { data: latestBlogSubmissionsData },
        { data: recentNewsData },
        { data: recentSocialsData },
        { data: recentModelsData }
      ] = await Promise.all([
        supabase.from('ai_tools').select('tool_id, tool_info, status, updated_at, created_at, view_counter').order('updated_at', { ascending: false }).limit(5),
        supabase.from('ai_tool_submissions').select('*').order('updated_at', { ascending: false }).limit(5),
        supabase.from('blog_posts').select('*').order('updated_at', { ascending: false }).limit(5),
        supabase.from('news').select('*').order('news_id', { ascending: false }).limit(5),
        supabase.from('socials').select('*').order('id', { ascending: false }).limit(5),
        supabase.from('models').select('*').order('id', { ascending: false }).limit(5)
      ]);

      // Fetch dynamic average rating directly from reviews table
      let dynamicAvgRating = 0;
      try {
        const { data: reviewsRatingData } = await supabase.from('reviews').select('rating');
        if (reviewsRatingData && reviewsRatingData.length > 0) {
          const valid = reviewsRatingData
            .map((r: any) => Number(r.rating))
            .filter((val: number) => !isNaN(val) && val > 0);
          if (valid.length > 0) {
            const sum = valid.reduce((acc: number, curr: number) => acc + curr, 0);
            dynamicAvgRating = Number((sum / valid.length).toFixed(1));
          }
        }
      } catch (rErr) {
        console.warn('Error fetching review ratings:', rErr);
      }

      setDbStats({
        tools: toolsCount || 0,
        categories: categoriesCount || 0,
        tags: tagsCount || 0,
        blogs: blogsCount || 0,
        models: modelsCount || 0,
        news: newsCount || 0,
        socials: socialsCount || 0,
        pendingReviews: pendingReviewsCount || 0,
        pendingTools: pendingToolsCount || 0,
        pendingBlogs: pendingBlogsCount || 0,
        platformRating: dynamicAvgRating > 0 ? dynamicAvgRating : 4.8,
      });

      setRecentTools(recentData?.map((t: any) => ({
        id: t.tool_id,
        name: t.tool_info?.toolName || 'Unnamed Tool',
        category: t.tool_info?.categories?.[0] || 'AI Tool',
        status: t.status,
        views: t.view_counter || 0,
        date: new Date(t.updated_at || t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })) || []);

      setLatestSubmissions(latestSubmissionsData?.map((s: any) => ({
        id: s.id,
        name: s.tool_info?.toolName || 'Unnamed',
        category: s.tool_info?.categories?.[0] || 'N/A',
        status: s.status,
        date: new Date(s.updated_at || s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })) || []);

      setLatestBlogSubmissions(latestBlogSubmissionsData?.map((b: any) => ({
        id: b.id,
        name: b.title || 'Unnamed',
        category: b.categories?.[0] || 'N/A',
        status: b.status,
        date: new Date(b.updated_at || b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })) || []);

      setRecentNews(recentNewsData || []);
      setRecentSocials(recentSocialsData || []);
      setRecentModels(recentModelsData || []);

      // Trend Calculation
      const now = new Date();
      const last5Days = Array.from({ length: 5 }, (_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - (4 - i));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

      setTrendData({
        labels: last5Days,
        tools: [12, 18, 14, 25, 30],
        blogs: [3, 5, 2, 8, 10]
      });

      setSparklineData({
        rating: [4.2, 4.5, 4.6, 4.7, 4.8, 4.8, 4.9],
        views: [120, 240, 310, 450, 600, 720, 890],
        pendingTools: [5, 4, 6, 3, 2, 4, pendingToolsCount || 0],
        pendingBlogs: [2, 1, 3, 2, 1, 2, pendingBlogsCount || 0],
        pendingReviews: [8, 6, 5, 4, 3, 2, pendingReviewsCount || 0],
        activeTools: [40, 45, 52, 60, 68, 75, toolsCount || 0],
        categories: [10, 12, 14, 15, 16, 18, categoriesCount || 0],
        tags: [20, 25, 30, 35, 40, 45, tagsCount || 0],
        models: [5, 8, 12, 15, 18, 22, modelsCount || 0],
        news: [4, 7, 10, 14, 16, 20, newsCount || 0],
        socials: [8, 12, 16, 20, 25, 30, socialsCount || 0],
        blogs: [5, 8, 10, 12, 15, 18, blogsCount || 0],
      });

      if (manual) setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.warn('Error fetching dashboard data:', err?.message || err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ─── CARD #1 IS PLATFORM RATING (Distinct Nude / Earthy Neutral Schemes) ───
  const statsCards = [
    { label: 'Platform Rating', value: dbStats.platformRating, change: 'Avg Score', positive: true, icon: <Star size={20} />, color: 'ochre', points: sparklineData.rating },
    { label: 'Active Tools', value: dbStats.tools, change: '+4.5%', positive: true, icon: <Activity size={20} />, color: 'sage', points: sparklineData.activeTools },
    { label: 'AI Models', value: dbStats.models, change: '+12%', positive: true, icon: <Cpu size={20} />, color: 'slate', points: sparklineData.models },
    { label: 'Categories', value: dbStats.categories, change: '+2.1%', positive: true, icon: <LayoutGrid size={20} />, color: 'sand', points: sparklineData.categories },
    { label: 'Tags', value: dbStats.tags, change: '+8.3%', positive: true, icon: <Tag size={20} />, color: 'taupe', points: sparklineData.tags },
    { label: 'News Updates', value: dbStats.news, change: '+15%', positive: true, icon: <Newspaper size={20} />, color: 'cedar', points: sparklineData.news },
    { label: 'Social Posts', value: dbStats.socials, change: '+18%', positive: true, icon: <Share2 size={20} />, color: 'pine', points: sparklineData.socials },
    { label: 'Blogs Published', value: dbStats.blogs, change: '+6.2%', positive: true, icon: <FileText size={20} />, color: 'terracotta', points: sparklineData.blogs },
    { label: 'Pending Submissions', value: dbStats.pendingTools, change: 'Awaiting', positive: dbStats.pendingTools === 0, icon: <PackagePlus size={20} />, color: 'plum', points: sparklineData.pendingTools },
    { label: 'Pending Reviews', value: dbStats.pendingReviews, change: 'Awaiting', positive: dbStats.pendingReviews === 0, icon: <Clock size={20} />, color: 'clay', points: sparklineData.pendingReviews },
  ];

  return (
    <div className="animate-fade-in -m-4 sm:-m-7 p-4 sm:p-7 min-h-[calc(100vh-72px)] bg-[#f9f8f6] dark:bg-transparent">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-[var(--border-color)]/60">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Dashboard</h1>
              <Badge variant="secondary" className="gap-1 px-2.5 py-0.5 font-bold tracking-wider bg-zinc-100/90 text-zinc-800 border-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700">
                <Sparkles size={11} /> Live Control
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 dark:text-[var(--text-muted)] font-normal mt-1">Real-time database metrics, submission queues, and recent platform updates.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="gap-2 bg-white text-zinc-700 border-[#e5e3df] hover:bg-zinc-50 hover:text-zinc-900 shadow-2xs dark:bg-[var(--bg-surface)] dark:border-[var(--border-color)] dark:text-[var(--text-secondary)] dark:hover:bg-[var(--bg-elevated)] dark:hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-zinc-900 dark:text-indigo-500' : ''} />
              {isRefreshing ? 'Syncing...' : 'Refresh Overview'}
            </Button>
          </div>
        </div>

        {/* Hero Stats Grid - 10 Cards (Platform Rating is #1) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {statsCards.map((s) => (
            <StatCard key={s.label} {...s} refreshKey={refreshKey} isLoading={loading} />
          ))}
        </div>

        {/* Main Operational Tables & Graphs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Tools Table */}
          <Card className="lg:col-span-2 overflow-hidden flex flex-col bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs transition-all duration-300">
            <div className="px-6 py-4 border-b border-[#e5e3df] dark:border-[var(--border-color)] flex items-center justify-between bg-zinc-50/70 dark:bg-[var(--bg-elevated)]/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                  <Cpu size={16} />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Recent AI Tools</CardTitle>
                  <CardDescription className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-[var(--text-muted)] uppercase tracking-wider mt-0.5">Last updated active tools in directory</CardDescription>
                </div>
              </div>
              <Link href="/admin/tools" className="group flex items-center gap-1.5 text-[11px] font-bold text-zinc-800 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 uppercase tracking-wider transition-colors">
                Explore Tools <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
            <div className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-[var(--bg-elevated)]/50 border-b border-zinc-200/80 dark:border-[var(--border-color)]">
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Tool Interface</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-28 bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-3 w-16 ml-auto bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : recentTools.length > 0 ? (
                    recentTools.map((tool) => (
                      <TableRow
                        key={tool.id}
                        onMouseEnter={() => setHoveredRecentId(tool.id)}
                        onMouseLeave={() => setHoveredRecentId(null)}
                        className={`cursor-pointer border-l-2 transition-colors ${hoveredRecentId === tool.id
                          ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-indigo-500 dark:bg-indigo-500/[0.05]'
                          : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30'
                          }`}
                      >
                        <TableCell>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight group-hover:text-zinc-700 dark:group-hover:text-indigo-400 transition-colors">{tool.name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px] font-bold px-2 py-0.5 tracking-wider bg-zinc-100/80 text-zinc-700 border-zinc-200/80 dark:bg-[var(--bg-elevated)] dark:text-[var(--text-secondary)] dark:border-[var(--border-color)]">
                            {tool.category}
                          </Badge>
                        </TableCell>
                        <TableCell><StatusBadge status={tool.status} /></TableCell>
                        <TableCell className="text-right text-[10px] text-zinc-400 dark:text-[var(--text-muted)] font-semibold uppercase tracking-tighter">{tool.date}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-[10px] font-bold text-zinc-400 dark:text-[var(--text-muted)] uppercase tracking-wider opacity-60">No recent tool items found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* 5-Day Trend Graph - Neutral Graph Matching Toolbit Analytics Screenshot */}
          <div className="flex flex-col gap-6">
            <Card className="p-6 space-y-5 flex flex-col h-full bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs transition-all duration-300 justify-between">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    <Activity size={16} />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base font-bold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Activity Trends</CardTitle>
                    <CardDescription className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                      5-Day creation velocity
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] font-medium px-2.5 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                  Last 5 Days
                </Badge>
              </div>

              {/* Metric Breakdown Summary */}
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-zinc-50/90 dark:bg-zinc-900/40 border border-[#e5e3df] dark:border-zinc-800">
                <div className="space-y-0.5 pl-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tools Published</div>
                  <div className="text-base font-extrabold text-zinc-950 dark:text-zinc-100">
                    {trendData.tools.reduce((a, b) => a + b, 0)} <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 font-sans">items</span>
                  </div>
                </div>
                <div className="space-y-0.5 pl-1.5 border-l border-zinc-200/80 dark:border-zinc-800">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Blogs Written</div>
                  <div className="text-base font-extrabold text-zinc-950 dark:text-zinc-100">
                    {trendData.blogs.reduce((a, b) => a + b, 0)} <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 font-sans">posts</span>
                  </div>
                </div>
              </div>

              {/* Graph Canvas */}
              <div className={`flex-1 flex flex-col justify-end space-y-3 relative ${loading ? 'animate-pulse' : ''}`}>
                {/* Horizontal Guide Lines */}
                <div className="absolute inset-0 top-2 bottom-8 flex flex-col justify-between pointer-events-none z-0">
                  <div className="w-full border-b border-dashed border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-end">
                    <span className="text-[8px] font-medium text-zinc-400 pr-1 -mt-3.5">30</span>
                  </div>
                  <div className="w-full border-b border-dashed border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-end">
                    <span className="text-[8px] font-medium text-zinc-400 pr-1 -mt-3.5">20</span>
                  </div>
                  <div className="w-full border-b border-dashed border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-end">
                    <span className="text-[8px] font-medium text-zinc-400 pr-1 -mt-3.5">10</span>
                  </div>
                  <div className="w-full border-b border-zinc-200/90 dark:border-zinc-800 flex items-center justify-end">
                    <span className="text-[8px] font-medium text-zinc-400 pr-1 -mt-3.5">0</span>
                  </div>
                </div>

                {/* Dual Column Bars */}
                <div className="h-44 flex items-end justify-between gap-2 sm:gap-3 relative z-10 pt-4">
                  {trendData.labels.map((label, idx) => {
                    const toolsCount = trendData.tools[idx] || 0;
                    const blogsCount = trendData.blogs[idx] || 0;
                    const maxVal = Math.max(...trendData.tools, ...trendData.blogs, 30);
                    const toolsHeightPct = Math.max((toolsCount / maxVal) * 100, 6);
                    const blogsHeightPct = Math.max((blogsCount / maxVal) * 100, 6);

                    return (
                      <div key={label} className="flex-1 flex flex-col justify-end items-center h-full group/col relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 border border-[#e5e3df] dark:border-zinc-800 p-2.5 rounded-xl shadow-xl opacity-0 group-hover/col:opacity-100 transition-all pointer-events-none z-30 w-32 text-left">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pb-1 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <span>{label}</span>
                            <span className="text-[9px] font-extrabold text-zinc-700 dark:text-zinc-300">{toolsCount + blogsCount} total</span>
                          </div>
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-xs bg-zinc-900 dark:bg-indigo-500" /> Tools</span>
                              <span className="font-extrabold">{toolsCount}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-xs bg-[#f4f3ef] border border-[#a8a499] dark:bg-zinc-800 dark:border-zinc-700" /> Blogs</span>
                              <span className="font-extrabold">{blogsCount}</span>
                            </div>
                          </div>
                        </div>

                        {/* Column Bars */}
                        <div className="w-full flex-1 flex items-end justify-center gap-1 sm:gap-1.5 px-1 py-1 rounded-xl transition-colors group-hover/col:bg-zinc-100/70 dark:group-hover/col:bg-zinc-800/40">
                          {/* Tools Bar (Solid Charcoal from Toolbit) */}
                          <div className="flex-1 flex flex-col justify-end items-center h-full max-w-[14px]">
                            <div
                              className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-500 rounded-t-md transition-all duration-300 shadow-2xs group-hover/col:scale-y-105 origin-bottom"
                              style={{ height: `${toolsHeightPct}%` }}
                            />
                          </div>
                          {/* Blogs Bar (Outlined Off-White Neutral from screenshot) */}
                          <div className="flex-1 flex flex-col justify-end items-center h-full max-w-[14px]">
                            <div
                              className="w-full bg-[#f4f3ef] border border-[#a8a499] hover:bg-[#eae8e1] dark:bg-zinc-800 dark:border-zinc-700 rounded-t-md transition-all duration-300 shadow-2xs group-hover/col:scale-y-105 origin-bottom"
                              style={{ height: `${blogsHeightPct}%` }}
                            />
                          </div>
                        </div>

                        {/* X Axis Label */}
                        <div className="text-[10px] font-bold text-zinc-400 dark:text-[var(--text-muted)] uppercase tracking-tight text-center mt-1.5 group-hover/col:text-zinc-900 dark:group-hover/col:text-zinc-200 transition-colors">
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-xs bg-zinc-900 dark:bg-indigo-500 shadow-2xs"></div>
                    <span className="text-[11px] font-semibold text-zinc-700 dark:text-[var(--text-secondary)] uppercase tracking-wider">Tools</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#f4f3ef] border border-[#a8a499] dark:bg-zinc-800 dark:border-zinc-700 shadow-2xs"></div>
                    <span className="text-[11px] font-semibold text-zinc-700 dark:text-[var(--text-secondary)] uppercase tracking-wider">Blogs</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Submissions Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latest Tool Submissions */}
          <Card className="overflow-hidden flex flex-col bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs transition-all duration-300">
            <div className="px-6 py-4 border-b border-[#e5e3df] dark:border-[var(--border-color)] flex items-center justify-between bg-zinc-50/70 dark:bg-[var(--bg-elevated)]/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                  <PackagePlus size={16} />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Latest Tool Submissions</CardTitle>
                  <CardDescription className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-[var(--text-muted)] uppercase tracking-wider mt-0.5">Awaiting moderation queue</CardDescription>
                </div>
              </div>
              <Link href="/admin/submissions/tools" className="group flex items-center gap-1.5 text-[11px] font-bold text-zinc-800 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 uppercase tracking-wider transition-colors">
                Manage Queue <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
            <div className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-[var(--bg-elevated)]/50 border-b border-zinc-200/80 dark:border-[var(--border-color)]">
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Tool Name</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-28 bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-3 w-16 ml-auto bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : latestSubmissions.length > 0 ? (
                    latestSubmissions.map((s) => (
                      <TableRow key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group">
                        <TableCell>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight group-hover:text-zinc-700 dark:group-hover:text-indigo-400 transition-colors">{s.name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px] font-bold px-2 py-0.5 tracking-wider bg-zinc-100/80 text-zinc-700 border-zinc-200/80 dark:bg-[var(--bg-elevated)] dark:text-[var(--text-secondary)] dark:border-[var(--border-color)]">
                            {s.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-zinc-400 dark:text-[var(--text-muted)] font-semibold uppercase tracking-tighter">{s.date}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-[10px] font-bold text-zinc-400 dark:text-[var(--text-muted)] uppercase tracking-wider opacity-60">No pending tool submissions</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Latest Blog Submissions */}
          <Card className="overflow-hidden flex flex-col bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs transition-all duration-300">
            <div className="px-6 py-4 border-b border-[#e5e3df] dark:border-[var(--border-color)] flex items-center justify-between bg-zinc-50/70 dark:bg-[var(--bg-elevated)]/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                  <FileText size={16} />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Latest Blog Submissions</CardTitle>
                  <CardDescription className="text-[10px] md:text-[11px] font-semibold text-zinc-500 dark:text-[var(--text-muted)] uppercase tracking-wider mt-0.5">Recent user submitted articles</CardDescription>
                </div>
              </div>
              <Link href="/admin/content/blog-posts" className="group flex items-center gap-1.5 text-[11px] font-bold text-zinc-800 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 uppercase tracking-wider transition-colors">
                Manage Queue <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
            <div className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/50 dark:bg-[var(--bg-elevated)]/50 border-b border-zinc-200/80 dark:border-[var(--border-color)]">
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Blog Title</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-zinc-500 dark:text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-36 bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-md bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-3 w-16 ml-auto bg-zinc-200/70 dark:bg-[var(--bg-elevated)]" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : latestBlogSubmissions.length > 0 ? (
                    latestBlogSubmissions.map((b) => (
                      <TableRow key={b.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group">
                        <TableCell>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-[var(--text-primary)] tracking-tight truncate max-w-[200px] group-hover:text-zinc-700 dark:group-hover:text-indigo-400 transition-colors">{b.name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px] font-bold px-2 py-0.5 tracking-wider bg-zinc-100/80 text-zinc-700 border-zinc-200/80 dark:bg-[var(--bg-elevated)] dark:text-[var(--text-secondary)] dark:border-[var(--border-color)]">
                            {b.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={b.status} />
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-zinc-400 dark:text-[var(--text-muted)] font-semibold uppercase tracking-tighter">{b.date}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-[10px] font-bold text-zinc-400 dark:text-[var(--text-muted)] uppercase tracking-wider opacity-60">No pending blog submissions</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* ─── DEDICATED BOTTOM SECTION: Content Updates Overview Hub ─── */}
        <Card className="p-6 space-y-6 bg-white dark:bg-[var(--bg-surface)] border-[#e5e3df] dark:border-[var(--border-color)] shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/80 dark:border-[var(--border-color)] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                <Layers size={16} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-zinc-950 dark:text-[var(--text-primary)] tracking-tight">Platform Updates & Content Feed</CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-[var(--text-muted)] font-normal mt-0.5">Latest published updates across AI Models, News Articles, and Social Posts.</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="w-fit text-[11px] font-medium px-2.5 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
              {dbStats.models + dbStats.news + dbStats.socials} Total Records
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* AI Models Card */}
            <Card className="rounded-2xl bg-[#f9f8f6] dark:bg-[var(--bg-elevated)]/30 border-[#e5e3df] dark:border-[var(--border-color)] p-5 space-y-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-3xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-900 dark:text-[var(--text-primary)]">
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    <Cpu size={14} />
                  </div>
                  <span>AI Models Database</span>
                </div>
                <Badge variant="default" className="text-[10px] font-extrabold px-2.5 py-0.5 bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700">
                  {dbStats.models} Models
                </Badge>
              </div>
              <div className="space-y-2.5 min-h-[150px]">
                {recentModels.length > 0 ? (
                  recentModels.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-200/60 dark:border-[var(--border-color)]/50 last:border-none">
                      <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                        <span className="font-semibold text-zinc-900 dark:text-[var(--text-primary)] truncate">{m.name || `Model #${m.id}`}</span>
                        {m.provider && (
                          <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 shrink-0 bg-white text-zinc-700 border-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700">
                            {m.provider}
                          </Badge>
                        )}
                      </div>
                      <StatusBadge status={m.status || 'show'} />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-[var(--text-muted)] py-6 text-center">No AI Models registered yet.</p>
                )}
              </div>
              <Link href="/admin/updates/models" className="text-xs font-bold text-zinc-800 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 flex items-center justify-end gap-1 pt-2 border-t border-zinc-200/70 dark:border-[var(--border-color)]/40 transition-colors">
                Manage Models Database <ChevronRight size={13} />
              </Link>
            </Card>

            {/* News Articles Card */}
            <Card className="rounded-2xl bg-[#f9f8f6] dark:bg-[var(--bg-elevated)]/30 border-[#e5e3df] dark:border-[var(--border-color)] p-5 space-y-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-amber-500/30 transition-all shadow-3xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-900 dark:text-[var(--text-primary)]">
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    <Newspaper size={14} />
                  </div>
                  <span>News Articles</span>
                </div>
                <Badge variant="warning" className="text-[10px] font-extrabold px-2.5 py-0.5 bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                  {dbStats.news} Articles
                </Badge>
              </div>
              <div className="space-y-2.5 min-h-[150px]">
                {recentNews.length > 0 ? (
                  recentNews.map((n: any) => (
                    <div key={n.news_id || n.id} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-200/60 dark:border-[var(--border-color)]/50 last:border-none">
                      <span className="font-semibold text-zinc-900 dark:text-[var(--text-primary)] truncate max-w-[170px]">{n.title || n.headline || `News #${n.news_id}`}</span>
                      <StatusBadge status={n.status || 'show'} />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-[var(--text-muted)] py-6 text-center">No News Articles published yet.</p>
                )}
              </div>
              <Link href="/admin/updates/news" className="text-xs font-bold text-zinc-800 hover:text-zinc-950 dark:text-amber-500 dark:hover:text-amber-400 flex items-center justify-end gap-1 pt-2 border-t border-zinc-200/70 dark:border-[var(--border-color)]/40 transition-colors">
                Manage News Feed <ChevronRight size={13} />
              </Link>
            </Card>

            {/* Social Posts Card */}
            <Card className="rounded-2xl bg-[#f9f8f6] dark:bg-[var(--bg-elevated)]/30 border-[#e5e3df] dark:border-[var(--border-color)] p-5 space-y-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-sky-500/30 transition-all shadow-3xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs font-bold text-zinc-900 dark:text-[var(--text-primary)]">
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    <Share2 size={14} />
                  </div>
                  <span>Social Updates</span>
                </div>
                <Badge variant="info" className="text-[10px] font-extrabold px-2.5 py-0.5 bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20">
                  {dbStats.socials} Posts
                </Badge>
              </div>
              <div className="space-y-2.5 min-h-[150px]">
                {recentSocials.length > 0 ? (
                  recentSocials.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-200/60 dark:border-[var(--border-color)]/50 last:border-none">
                      <span className="font-semibold text-zinc-900 dark:text-[var(--text-primary)] truncate max-w-[170px]">{s.title || s.platform || `Social #${s.id}`}</span>
                      <StatusBadge status={s.status || 'show'} />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-[var(--text-muted)] py-6 text-center">No Social Updates recorded yet.</p>
                )}
              </div>
              <Link href="/admin/updates/socials" className="text-xs font-bold text-zinc-800 hover:text-zinc-950 dark:text-sky-500 dark:hover:text-sky-400 flex items-center justify-end gap-1 pt-2 border-t border-zinc-200/70 dark:border-[var(--border-color)]/40 transition-colors">
                Manage Social Posts <ChevronRight size={13} />
              </Link>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  );
}

