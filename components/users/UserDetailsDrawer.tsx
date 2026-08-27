'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  Bookmark,
  ThumbsUp,
  ExternalLink,
  Send,
  Edit3,
  Megaphone,
  FileText,
  CreditCard,
  Receipt,
  Star,
  AlertTriangle,
  Copy,
  Check,
  CheckCircle2,
  User as UserIcon,
  Layers,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Folder,
  Globe,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserFullDetails } from '@/lib/services/user-details-service';
import { UserRow } from './UsersTable';

const DEFAULT_TOOL_ICON = 'https://cdn.toolbit.ai/favicon-ic/default.png';

interface ToolFaviconProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

function ToolFavicon({
  src,
  alt,
  className = 'w-6 h-6 rounded-md object-contain shrink-0 bg-white dark:bg-zinc-800 p-0.5 border border-zinc-200/80 dark:border-zinc-700/80',
}: ToolFaviconProps) {
  const [failed, setFailed] = useState(false);

  return (
    <img
      src={failed || !src ? DEFAULT_TOOL_ICON : src}
      alt={alt || 'Tool favicon'}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

interface UserDetailsDrawerProps {
  user: UserRow | null;
  isOpen: boolean;
  onClose: () => void;
  details: UserFullDetails | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

type TabType =
  | 'overview'
  | 'saved'
  | 'upvotes'
  | 'launches'
  | 'updates'
  | 'ads'
  | 'blog'
  | 'orders'
  | 'billing'
  | 'reviews'
  | 'reports';

// Format database plan_id into human-friendly label
function formatPlanName(planId?: string | null): string {
  if (!planId) return 'Standard';
  const map: Record<string, string> = {
    free_launch_tool: 'Tool Launch (Free)',
    paid_launch_tool: 'Tool Launch (Paid)',
    free_update_tool: 'Tool Update (Free)',
    paid_update_tool: 'Tool Update (Paid)',
    free_guest_post: 'Guest Post (Free)',
    paid_guest_post: 'Guest Post (Paid)',
    free_advertise_3_days: 'Advertisement (3 Days Free)',
    paid_advertise_3_days: 'Advertisement (3 Days)',
    free_advertise_7_days: 'Advertisement (7 Days Free)',
    paid_advertise_7_days: 'Advertisement (7 Days)',
    free_advertise_15_days: 'Advertisement (15 Days Free)',
    paid_advertise_15_days: 'Advertisement (15 Days)',
    free_social_spotlight: 'Social Advertisement',
  };
  return map[planId] || planId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Compute live directory listing URL on localhost or production Toolbit
function getToolLiveUrl(toolUrl?: string | null): string | null {
  if (!toolUrl) return null;
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const base = isLocal ? 'http://localhost:3000' : 'https://www.toolbit.ai';

  let slug = toolUrl.trim();
  if (slug.startsWith('http://') || slug.startsWith('https://')) {
    try {
      const u = new URL(slug);
      if (u.hostname.includes('toolbit') || u.hostname === 'localhost') {
        const parts = u.pathname.split('/').filter(Boolean);
        slug = parts[parts.length - 1] || '';
      } else {
        return null;
      }
    } catch {
      // ignore parse error
    }
  }
  slug = slug.replace(/^\/?(ai-tool\/)?/, '').trim();
  if (!slug) return null;

  return `${base}/ai-tool/${slug}`;
}

const emptySubscribe = () => () => {};

export default function UserDetailsDrawer({
  user,
  isOpen,
  onClose,
  details,
  isLoading,
  error,
  onRefresh,
}: UserDetailsDrawerProps) {
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedOrderNum, setCopiedOrderNum] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState<string | null>(null);

  // Tab horizontal scroll ref & states
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, isOpen, activeTab]);

  // Native non-passive horizontal wheel listener for buttery smooth mouse roller scrolling
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        e.preventDefault();
        el.scrollLeft += delta;
        checkScroll();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen, checkScroll]);

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const offset = direction === 'left' ? -220 : 220;
      tabsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Reset tab on user change
  if (user?.id && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setActiveTab('overview');
    setSelectedCollection('all');
  }

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Extract all collection names from saved tools
  const savedCollections = React.useMemo(() => {
    const map = new Map<string, number>();
    details?.saved_tools?.forEach((t) => {
      const cols = t.collections && t.collections.length ? t.collections : ['Default'];
      cols.forEach((c) => {
        map.set(c, (map.get(c) || 0) + 1);
      });
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [details]);

  // Filter saved tools by selected collection
  const filteredSavedTools = React.useMemo(() => {
    if (!details?.saved_tools) return [];
    if (selectedCollection === 'all') return details.saved_tools;
    return details.saved_tools.filter((t) => {
      const cols = t.collections && t.collections.length ? t.collections : ['Default'];
      return cols.includes(selectedCollection);
    });
  }, [details, selectedCollection]);

  if (!mounted || !isOpen || !user) return null;

  const handleCopyUuid = () => {
    const idToCopy = details?.profile?.id || user?.id;
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy);
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 2000);
    }
  };

  const handleCopyEmail = () => {
    if (user?.email) {
      navigator.clipboard.writeText(user.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleCopyOrderNumber = (ordNum: string) => {
    if (ordNum) {
      navigator.clipboard.writeText(ordNum);
      setCopiedOrderNum(ordNum);
      setTimeout(() => setCopiedOrderNum(null), 2000);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status?: string | null) => {
    const s = (status || 'pending').toLowerCase();
    switch (s) {
      case 'approved':
      case 'published':
      case 'active':
      case 'completed':
      case 'show':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {status}
          </span>
        );
      case 'pending':
      case 'in_review':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {status}
          </span>
        );
      case 'rejected':
      case 'cancelled':
      case 'failed':
      case 'expired':
      case 'hide':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            {status}
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Draft
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            {status}
          </span>
        );
    }
  };

  const summary = details?.summary || {
    saved_count: user.saved_count || 0,
    upvoted_count: user.upvoted_count || 0,
    submissions_count: 0,
    updates_count: 0,
    advertisements_count: 0,
    blog_posts_count: 0,
    orders_count: 0,
    total_spend_usd: 0,
    reviews_count: 0,
    tool_reports_count: 0,
  };

  // Full Tabs list with separated Launches, Updates, Orders, Billing, Reviews, Reports
  const tabs: { id: TabType; label: string; count?: number; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Layers size={13} /> },
    {
      id: 'saved',
      label: 'Saved Tools',
      count: summary.saved_count,
      icon: <Bookmark size={13} />,
    },
    {
      id: 'upvotes',
      label: 'Upvoted Tools',
      count: summary.upvoted_count,
      icon: <ThumbsUp size={13} />,
    },
    {
      id: 'launches',
      label: 'Launches',
      count: summary.submissions_count,
      icon: <Send size={13} />,
    },
    {
      id: 'updates',
      label: 'Updates',
      count: summary.updates_count,
      icon: <Edit3 size={13} />,
    },
    {
      id: 'ads',
      label: 'Advertisements',
      count: summary.advertisements_count,
      icon: <Megaphone size={13} />,
    },
    {
      id: 'blog',
      label: 'Guest Posts',
      count: summary.blog_posts_count,
      icon: <FileText size={13} />,
    },
    {
      id: 'orders',
      label: 'Orders',
      count: summary.orders_count,
      icon: <CreditCard size={13} />,
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: <Receipt size={13} />,
    },
    {
      id: 'reviews',
      label: 'Tool Reviews',
      count: summary.reviews_count,
      icon: <Star size={13} />,
    },
    {
      id: 'reports',
      label: 'Tool Reports',
      count: summary.tool_reports_count,
      icon: <AlertTriangle size={13} />,
    },
  ];

  const drawerContent = (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />

      {/* Slide-over Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10 pointer-events-none">
        <div className="w-screen max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-white dark:bg-[#121316] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col pointer-events-auto animate-slide-in-right">
          
          {/* ── TOP HERO HEADER ─── */}
          <div className="p-5 sm:p-6 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/50 backdrop-blur-md shrink-0">
            <div className="flex items-center justify-between gap-4">
              {/* User Profile Info */}
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name || user.email}
                    className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl object-cover ring-2 ring-zinc-200/80 dark:ring-zinc-700/80 shrink-0 shadow-xs"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 ring-2 ring-zinc-200/80 dark:ring-zinc-700/80 flex items-center justify-center text-base sm:text-lg font-extrabold text-zinc-700 dark:text-zinc-200 shrink-0 shadow-xs">
                    {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight truncate">
                      {user.full_name || 'No Name Provided'}
                    </h2>
                    {details?.profile?.role ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-300/60 dark:border-zinc-700">
                        {details.profile.role}
                      </span>
                    ) : null}
                    {details?.profile?.email_confirmed_at ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={10} /> Verified
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium truncate">
                      {user.email}
                    </span>
                    <button
                      onClick={handleCopyEmail}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-0.5 cursor-pointer"
                      title="Copy Email"
                    >
                      {copiedEmail ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                  title="Sync Telemetry"
                >
                  {isLoading ? (
                    <Spinner size={14} className="text-zinc-500" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>

            {/* ── KPI METRICS RIBBON ────────────── */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <button
                onClick={() => setActiveTab('saved')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Saved</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.saved_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('upvotes')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Upvotes</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.upvoted_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('launches')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Launches</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.submissions_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('updates')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Updates</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.updates_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('ads')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Ads</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.advertisements_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('blog')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">Posts</div>
                <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {summary.blog_posts_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Orders</div>
                <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {summary.orders_count}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('billing')}
                className="bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 rounded-xl p-2 sm:p-2.5 border border-zinc-200/60 dark:border-zinc-800 text-center shadow-2xs transition-colors cursor-pointer"
              >
                <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Spent</div>
                <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ${Number(summary.total_spend_usd || 0).toLocaleString()}
                </div>
              </button>
            </div>

            {/* ── SCROLLABLE TAB BAR WITH NAVIGATION BUTTONS ────────────── */}
            <div className="relative mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center">
              {canScrollLeft && (
                <button
                  onClick={() => handleScrollTabs('left')}
                  className="absolute left-0 z-10 p-1 rounded-md bg-white/95 dark:bg-zinc-900/95 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
                  title="Scroll left"
                >
                  <ChevronLeft size={14} />
                </button>
              )}

              <div
                ref={tabsRef}
                onScroll={checkScroll}
                className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 w-full px-1"
              >
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {typeof tab.count === 'number' && tab.count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isActive
                              ? 'bg-zinc-700 text-zinc-100 dark:bg-zinc-300 dark:text-zinc-950'
                              : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {canScrollRight && (
                <button
                  onClick={() => handleScrollTabs('right')}
                  className="absolute right-0 z-10 p-1 rounded-md bg-white/95 dark:bg-zinc-900/95 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
                  title="Scroll right"
                >
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── DRAWER BODY ─────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {isLoading ? (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={`stat-skel-${i}`} className="h-20 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
              </div>
            ) : error ? (
              <div className="p-6 rounded-2xl border border-rose-200/80 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/10 text-center space-y-3">
                <AlertTriangle size={28} className="mx-auto text-rose-500" />
                <h3 className="text-sm font-bold text-rose-900 dark:text-rose-300">
                  Telemetry Load Failed
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 max-w-md mx-auto">
                  {error}
                </p>
                <div className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900/80 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 max-w-lg mx-auto text-left space-y-1">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Database Migration Check:</p>
                  <p>
                    Please ensure the migration{' '}
                    <code className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
                      supabase/migrations/20260827103000_add_get_admin_user_full_details_rpc.sql
                    </code>{' '}
                    has been executed on your Supabase project.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2 text-xs">
                  <RefreshCw size={13} /> Retry Fetch
                </Button>
              </div>
            ) : details ? (
              <>
                {/* ── 1. OVERVIEW TAB ───────────────────────────────────────── */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Modern Profile Info Card */}
                    <div className="bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                          <UserIcon size={12} /> Account Specifications
                        </span>
                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                          {details.profile?.role === 'admin' ? 'Super Administrator' : 'Standard Account'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                        {/* User UUID with Copy Icon */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            User UUID
                          </span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-medium text-zinc-800 dark:text-zinc-200 break-all select-all">
                              {details.profile?.id || user.id}
                            </span>
                            <button
                              onClick={handleCopyUuid}
                              className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0 cursor-pointer"
                              title="Copy User UUID"
                            >
                              {copiedUuid ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                            </button>
                          </div>
                        </div>

                        {/* Primary Email */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            Email Address
                          </span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate block">
                            {details.profile?.email || user.email}
                          </span>
                        </div>

                        {/* Verification Status */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            Verification Status
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            {details.profile?.email_confirmed_at ? 'Email Verified' : 'Unconfirmed'}
                          </span>
                        </div>

                        {/* Assigned Role */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            Assigned Role
                          </span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                            {details.profile?.role || 'User'}
                          </span>
                        </div>

                        {/* Registration Date */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            Registered At
                          </span>
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {formatDateTime(details.profile?.created_at || user.created_at)}
                          </span>
                        </div>

                        {/* Last Active Session */}
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex flex-col justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
                            Last Active Session
                          </span>
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {formatDateTime(details.profile?.last_sign_in_at || user.last_sign_in_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4 Feature Highlights Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Saved Tools Summary */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <Bookmark size={13} />
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                              Saved Tools ({details.saved_tools?.length || 0})
                            </h4>
                          </div>
                          <button
                            onClick={() => setActiveTab('saved')}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            View All <ArrowUpRight size={11} />
                          </button>
                        </div>

                        {details.saved_tools?.length ? (
                          <div className="space-y-2">
                            {details.saved_tools.slice(0, 3).map((tool) => {
                              const liveUrl = getToolLiveUrl(tool.tool_url);
                              return (
                                <div
                                  key={`ov-saved-${tool.tool_id}`}
                                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <ToolFavicon src={tool.favicon_url} alt={tool.tool_name} />
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                      {tool.tool_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {liveUrl && (
                                      <a
                                        href={liveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                                        title="Live Listing"
                                      >
                                        Live <ExternalLink size={9} />
                                      </a>
                                    )}
                                    {getStatusBadge(tool.status)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
                            No tools bookmarked yet.
                          </p>
                        )}
                      </div>

                      {/* Launches Summary */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                              <Send size={13} />
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                              Launches ({details.submissions?.length || 0})
                            </h4>
                          </div>
                          <button
                            onClick={() => setActiveTab('launches')}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            View All <ArrowUpRight size={11} />
                          </button>
                        </div>

                        {details.submissions?.length ? (
                          <div className="space-y-2">
                            {details.submissions.slice(0, 3).map((sub) => {
                              const isApproved = sub.status?.toLowerCase() === 'approved';
                              const liveUrl = isApproved ? getToolLiveUrl(sub.tool_url) : null;
                              return (
                                <div
                                  key={`ov-sub-${sub.id}`}
                                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate block">
                                      {sub.tool_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-medium">
                                      {sub.submission_tier || (sub.is_paid ? 'Paid Tier' : 'Free Tier')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {liveUrl && (
                                      <a
                                        href={liveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                                        title="Live Listing"
                                      >
                                        Live <ExternalLink size={9} />
                                      </a>
                                    )}
                                    {getStatusBadge(sub.status)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
                            No tool launches recorded.
                          </p>
                        )}
                      </div>

                      {/* Advertisements Summary */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                              <Megaphone size={13} />
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                              Advertisements ({details.advertisements?.length || 0})
                            </h4>
                          </div>
                          <button
                            onClick={() => setActiveTab('ads')}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            View All <ArrowUpRight size={11} />
                          </button>
                        </div>

                        {details.advertisements?.length ? (
                          <div className="space-y-2">
                            {details.advertisements.slice(0, 3).map((ad) => {
                              const liveUrl = getToolLiveUrl(ad.tool_url);
                              return (
                                <div
                                  key={`ov-ad-${ad.id}`}
                                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs"
                                >
                                  <div>
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate block max-w-[170px]">
                                      {ad.tool_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                      {ad.impression_count} impressions
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {liveUrl && (
                                      <a
                                        href={liveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                                        title="Live Listing"
                                      >
                                        Live <ExternalLink size={9} />
                                      </a>
                                    )}
                                    {getStatusBadge(ad.status)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
                            No advertisements active.
                          </p>
                        )}
                      </div>

                      {/* Orders Summary */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <CreditCard size={13} />
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                              Orders ({details.orders?.length || 0})
                            </h4>
                          </div>
                          <button
                            onClick={() => setActiveTab('orders')}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            View All <ArrowUpRight size={11} />
                          </button>
                        </div>

                        {details.orders?.length ? (
                          <div className="space-y-2">
                            {details.orders.slice(0, 3).map((order) => (
                              <div
                                key={`ov-order-${order.id}`}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                                    {formatPlanName(order.plan_id)}
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                    #{order.order_number}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    ${order.amount_usd}
                                  </span>
                                  {getStatusBadge(order.status)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic py-2">
                            No orders found.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 2. SAVED TOOLS TAB (Collection-Wise) ───────────────────── */}
                {activeTab === 'saved' && (
                  <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <Bookmark size={15} className="text-emerald-500" />
                          Saved Tools ({details.saved_tools?.length || 0})
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Browse bookmarks organized by user collections.
                        </p>
                      </div>

                      {/* Collection Filter Pills */}
                      {savedCollections.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedCollection('all')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              selectedCollection === 'all'
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                            }`}
                          >
                            All ({details.saved_tools?.length || 0})
                          </button>
                          {savedCollections.map((col) => (
                            <button
                              key={`col-pill-${col.name}`}
                              onClick={() => setSelectedCollection(col.name)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                selectedCollection === col.name
                                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              <Folder size={11} />
                              {col.name} ({col.count})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {filteredSavedTools.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredSavedTools.map((tool) => {
                          const liveUrl = getToolLiveUrl(tool.tool_url);
                          return (
                            <div
                              key={`saved-card-${tool.tool_id}`}
                              className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="flex items-center gap-3 min-w-0">
                                  <ToolFavicon
                                    src={tool.favicon_url}
                                    alt={tool.tool_name}
                                    className="w-8 h-8 rounded-lg object-contain border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 bg-white dark:bg-zinc-800 p-0.5"
                                  />
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                      {tool.tool_name}
                                    </h4>
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                      {tool.tagline || tool.pricing_model || 'AI Tool'}
                                    </p>
                                  </div>
                                </div>
                                {getStatusBadge(tool.status)}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-[11px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {tool.collections?.map((col, idx) => (
                                    <span
                                      key={`col-${idx}`}
                                      className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400"
                                    >
                                      {col}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  {liveUrl && (
                                    <a
                                      href={liveUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-semibold transition-colors"
                                      title="View on Toolbit directory"
                                    >
                                      Listing <ExternalLink size={10} />
                                    </a>
                                  )}
                                  {tool.tool_site_url && (
                                    <a
                                      href={tool.tool_site_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 font-semibold transition-colors"
                                      title="Visit external tool site"
                                    >
                                      Website <Globe size={10} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No saved tools in this collection.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 3. UPVOTED TOOLS TAB ──────────────────────────────────── */}
                {activeTab === 'upvotes' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ThumbsUp size={15} className="text-amber-500" />
                        Upvoted Tools ({details.upvoted_tools?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Tools upvoted by this user across the directory.
                      </p>
                    </div>

                    {details.upvoted_tools?.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {details.upvoted_tools.map((tool) => {
                          const liveUrl = getToolLiveUrl(tool.tool_url);
                          return (
                            <div
                              key={`upvoted-card-${tool.tool_id}`}
                              className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="flex items-center gap-3 min-w-0">
                                  <ToolFavicon
                                    src={tool.favicon_url}
                                    alt={tool.tool_name}
                                    className="w-8 h-8 rounded-lg object-contain border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 bg-white dark:bg-zinc-800 p-0.5"
                                  />
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                      {tool.tool_name}
                                    </h4>
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                      {tool.tagline || tool.pricing_model || 'AI Tool'}
                                    </p>
                                  </div>
                                </div>
                                {getStatusBadge(tool.status)}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-[11px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {tool.pricing_model ? (
                                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 capitalize">
                                      {tool.pricing_model}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                                      <ThumbsUp size={9} /> Upvoted
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  {liveUrl && (
                                    <a
                                      href={liveUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-semibold transition-colors"
                                      title="View on Toolbit directory"
                                    >
                                      Listing <ExternalLink size={10} />
                                    </a>
                                  )}
                                  {tool.tool_site_url && (
                                    <a
                                      href={tool.tool_site_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 font-semibold transition-colors"
                                      title="Visit external tool site"
                                    >
                                      Website <Globe size={10} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No upvoted tools recorded for this user.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 4. LAUNCHES TAB (Table View) ──────────────────────────── */}
                {activeTab === 'launches' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Send size={15} className="text-sky-500" />
                        Tool Launches ({details.submissions?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        New tools submitted for launching by this user.
                      </p>
                    </div>

                    {details.submissions?.length ? (
                      <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-zinc-50/70 dark:bg-zinc-900/60">
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tool</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tier</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Status</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Links</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Submitted</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {details.submissions.map((sub) => {
                              const isApproved = sub.status?.toLowerCase() === 'approved';
                              const liveUrl = isApproved ? getToolLiveUrl(sub.tool_url) : null;
                              return (
                                <TableRow key={`sub-row-${sub.id}`}>
                                  <TableCell className="text-xs font-medium">
                                    <div className="flex items-center gap-2.5">
                                      <ToolFavicon src={sub.favicon_url} alt={sub.tool_name} />
                                      <div>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                                          {sub.tool_name}
                                        </span>
                                        {sub.id && (
                                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                                            ID: #{sub.id}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs uppercase font-semibold text-zinc-500 dark:text-zinc-400">
                                    {sub.submission_tier || (sub.is_paid ? 'Paid' : 'Free')}
                                  </TableCell>
                                  <TableCell>{getStatusBadge(sub.status)}</TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {liveUrl && (
                                        <a
                                          href={liveUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]"
                                          title="View on directory"
                                        >
                                          Listing <ExternalLink size={9} />
                                        </a>
                                      )}
                                      {sub.tool_site_url && (
                                        <a
                                          href={sub.tool_site_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline inline-flex items-center gap-0.5 font-medium text-[11px]"
                                          title="Visit website"
                                        >
                                          Website <Globe size={9} />
                                        </a>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {formatDate(sub.created_at)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No tool launches submitted by this user.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 5. UPDATES TAB ────────────────────────────────────────── */}
                {activeTab === 'updates' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Edit3 size={15} className="text-indigo-500" />
                        Tool Update Requests ({details.updates?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Modification and update requests for existing tools.
                      </p>
                    </div>

                    {details.updates?.length ? (
                      <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-zinc-50/70 dark:bg-zinc-900/60">
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tool Target</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tier</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Status</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Links</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {details.updates.map((upd) => {
                              const isApproved = upd.status?.toLowerCase() === 'approved';
                              const liveUrl = isApproved ? getToolLiveUrl(upd.tool_url) : null;
                              return (
                                <TableRow key={`upd-row-${upd.id}`}>
                                  <TableCell className="text-xs font-medium">
                                    <div className="flex items-center gap-2.5">
                                      <ToolFavicon src={upd.favicon_url} alt={upd.tool_name} />
                                      <div>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                                          {upd.tool_name}
                                        </span>
                                        {upd.tool_id && (
                                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                                            Tool ID: #{upd.tool_id}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs uppercase font-semibold text-zinc-500 dark:text-zinc-400">
                                    {upd.submission_tier || (upd.is_paid ? 'Paid' : 'Free')}
                                  </TableCell>
                                  <TableCell>{getStatusBadge(upd.status)}</TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {liveUrl && (
                                        <a
                                          href={liveUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]"
                                          title="View on directory"
                                        >
                                          Listing <ExternalLink size={9} />
                                        </a>
                                      )}
                                      {upd.tool_site_url && (
                                        <a
                                          href={upd.tool_site_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline inline-flex items-center gap-0.5 font-medium text-[11px]"
                                          title="Visit website"
                                        >
                                          Website <Globe size={9} />
                                        </a>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {formatDate(upd.created_at)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No tool updates submitted by this user.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 6. ADVERTISEMENTS TAB ─────────────────────────────────── */}
                {activeTab === 'ads' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Megaphone size={15} className="text-rose-500" />
                        Advertisements ({details.advertisements?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Active and past advertisement campaigns booked by this user.
                      </p>
                    </div>

                    {details.advertisements?.length ? (
                      <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-zinc-50/70 dark:bg-zinc-900/60">
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tool</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Placements</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Views</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Clicks</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Status</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Links</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {details.advertisements.map((ad) => {
                              const liveUrl = getToolLiveUrl(ad.tool_url);
                              return (
                                <TableRow key={`ad-row-${ad.id}`}>
                                  <TableCell className="text-xs font-medium">
                                    <div className="flex items-center gap-2.5">
                                      <ToolFavicon src={ad.favicon_url} alt={ad.tool_name} />
                                      <div>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                                          {ad.tool_name}
                                        </span>
                                        {ad.social_share_url && (
                                          <a
                                            href={ad.social_share_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:underline inline-flex items-center gap-1"
                                          >
                                            Social Link <ExternalLink size={9} />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex gap-1 flex-wrap">
                                      {ad.featured_type?.map((ft, i) => (
                                        <span
                                          key={`ft-${i}`}
                                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 capitalize"
                                        >
                                          {ft}
                                        </span>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                    {ad.impression_count.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                    {ad.click_count.toLocaleString()}
                                  </TableCell>
                                  <TableCell>{getStatusBadge(ad.status)}</TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {liveUrl && (
                                        <a
                                          href={liveUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]"
                                          title="View on directory"
                                        >
                                          Listing <ExternalLink size={9} />
                                        </a>
                                      )}
                                      {ad.tool_site_url && (
                                        <a
                                          href={ad.tool_site_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline inline-flex items-center gap-0.5 font-medium text-[11px]"
                                          title="Visit website"
                                        >
                                          Website <Globe size={9} />
                                        </a>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {formatDate(ad.start_date)} - {formatDate(ad.end_date)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No advertisements found.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 7. GUEST POSTS TAB ────────────────────────────────────── */}
                {activeTab === 'blog' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <FileText size={15} className="text-violet-500" />
                      Guest Articles ({details.blog_posts?.length || 0})
                    </h3>

                    {details.blog_posts?.length ? (
                      <div className="space-y-3">
                        {details.blog_posts.map((post) => (
                          <div
                            key={`blog-post-${post.id}`}
                            className="p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                  {post.title}
                                </h4>
                                {getStatusBadge(post.status)}
                                {post.submission_tier && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                    {post.submission_tier}
                                  </span>
                                )}
                              </div>
                              {post.description && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                  {post.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2.5 text-[11px] text-zinc-400 dark:text-zinc-500 pt-1">
                                <span>{post.view_count.toLocaleString()} views</span>
                                <span>•</span>
                                <span>{post.reading_time_minutes || 3} min read</span>
                                <span>•</span>
                                <span>{formatDate(post.created_at)}</span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {post.slug && (
                                <a
                                  href={`/blog/${post.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 transition-colors"
                                >
                                  Preview <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No guest posts published or submitted.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 8. ORDERS TAB (Separated) ─────────────────────────────── */}
                {activeTab === 'orders' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <CreditCard size={15} className="text-emerald-500" />
                        Orders ({details.orders?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Purchases and plan orders placed by this user.
                      </p>
                    </div>

                    {details.orders?.length ? (
                      <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-zinc-50/70 dark:bg-zinc-900/60">
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Order #</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Plan</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Amount</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Status</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Date</TableHead>
                              <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400 text-right">Invoice</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {details.orders.map((order) => (
                              <TableRow key={`order-row-${order.id}`}>
                                <TableCell className="text-xs">
                                  <div className="group/ord flex items-center gap-1.5 font-mono font-medium text-zinc-800 dark:text-zinc-200">
                                    <span>#{order.order_number}</span>
                                    <button
                                      onClick={() => handleCopyOrderNumber(order.order_number)}
                                      className="opacity-0 group-hover/ord:opacity-100 transition-opacity p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                                      title="Copy Order #"
                                    >
                                      {copiedOrderNum === order.order_number ? (
                                        <Check size={11} className="text-emerald-500" />
                                      ) : (
                                        <Copy size={11} />
                                      )}
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                  {formatPlanName(order.plan_id)}
                                </TableCell>
                                <TableCell className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  ${order.amount_usd} {order.currency || 'USD'}
                                </TableCell>
                                <TableCell>{getStatusBadge(order.status)}</TableCell>
                                <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {formatDate(order.created_at)}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {order.receipt_url || order.invoice_url ? (
                                    <a
                                      href={order.receipt_url || order.invoice_url!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                                    >
                                      Receipt <ExternalLink size={10} />
                                    </a>
                                  ) : (
                                    <span className="text-zinc-400 dark:text-zinc-600 text-[11px]">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No orders or transactions recorded.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 9. BILLING TAB (Only Paid Orders) ────────────────────── */}
                {activeTab === 'billing' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Receipt size={15} className="text-teal-500" />
                        Billing
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Payment records, lifetime spend, and receipts.
                      </p>
                    </div>

                    {/* Financial Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 block">
                            Lifetime Spend
                          </span>
                          <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                            ${Number(details.summary?.total_spend_usd || 0).toLocaleString()} USD
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 block">
                            Completed Transactions
                          </span>
                          <span className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
                            {details.orders?.filter((o) => o.status === 'completed').length || 0} Orders
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                          <ShieldCheck size={20} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 block">
                            Payment Gateway
                          </span>
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Dodo Payments
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Invoices List - only showing paid (completed) orders */}
                    {(() => {
                      const paidOrders = details.orders?.filter((o) => o.status === 'completed') || [];
                      return (
                        <div className="border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xs">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-zinc-50/70 dark:bg-zinc-900/60">
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Order #</TableHead>
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Description</TableHead>
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Paid Amount</TableHead>
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Payment Method</TableHead>
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Date</TableHead>
                                <TableHead className="text-xs font-bold text-zinc-500 dark:text-zinc-400 text-right">Invoice</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paidOrders.length ? (
                                paidOrders.map((order) => (
                                  <TableRow key={`billing-row-${order.id}`}>
                                    <TableCell className="text-xs">
                                      <div className="group/ord flex items-center gap-1.5 font-mono font-medium text-zinc-800 dark:text-zinc-200">
                                        <span>#{order.order_number}</span>
                                        <button
                                          onClick={() => handleCopyOrderNumber(order.order_number)}
                                          className="opacity-0 group-hover/ord:opacity-100 transition-opacity p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                                          title="Copy Order #"
                                        >
                                          {copiedOrderNum === order.order_number ? (
                                            <Check size={11} className="text-emerald-500" />
                                          ) : (
                                            <Copy size={11} />
                                          )}
                                        </button>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                      {formatPlanName(order.plan_id)}
                                    </TableCell>
                                    <TableCell className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                      ${order.amount_usd} {order.currency || 'USD'}
                                    </TableCell>
                                    <TableCell className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                                      {order.payment_method || 'Online Card'}
                                    </TableCell>
                                    <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {formatDate(order.created_at)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right">
                                      {order.receipt_url || order.invoice_url ? (
                                        <a
                                          href={order.receipt_url || order.invoice_url!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                                        >
                                          Receipt <ExternalLink size={10} />
                                        </a>
                                      ) : (
                                        <span className="text-zinc-400 dark:text-zinc-600 text-[11px]">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-8 text-center text-xs text-zinc-400">
                                    No paid billing records found.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── 10. TOOL REVIEWS TAB (Separated) ──────────────────────── */}
                {activeTab === 'reviews' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Star size={15} className="text-amber-500" />
                        Tool Reviews ({details.reviews?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Reviews and ratings left by this user on tools.
                      </p>
                    </div>

                    {details.reviews?.length ? (
                      <div className="space-y-3">
                        {details.reviews.map((rev) => {
                          const liveUrl = getToolLiveUrl(rev.tool_url);
                          return (
                            <div
                              key={`rev-${rev.review_id}`}
                              className="p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <ToolFavicon src={rev.favicon_url} alt={rev.tool_name} />
                                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {rev.tool_name}
                                  </span>
                                  <div className="flex items-center gap-0.5 text-amber-500">
                                    {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                                      <Star key={`star-${i}`} size={11} fill="currentColor" />
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {liveUrl && (
                                    <a
                                      href={liveUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]"
                                      title="Live Listing"
                                    >
                                      Listing <ExternalLink size={9} />
                                    </a>
                                  )}
                                  {rev.tool_site_url && (
                                    <a
                                      href={rev.tool_site_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline inline-flex items-center gap-0.5 font-medium text-[11px]"
                                      title="Website"
                                    >
                                      Website <Globe size={9} />
                                    </a>
                                  )}
                                  {getStatusBadge(rev.status)}
                                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                    {formatDate(rev.review_date)}
                                  </span>
                                </div>
                              </div>
                              {rev.review_text && (
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 italic pl-8">
                                  &ldquo;{rev.review_text}&rdquo;
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No reviews submitted by this user.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 11. TOOL REPORTS TAB (Separated) ──────────────────────── */}
                {activeTab === 'reports' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <AlertTriangle size={15} className="text-rose-500" />
                        Tool Reports ({details.tool_reports?.length || 0})
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Bug and issue reports flagged on tools by this user.
                      </p>
                    </div>

                    {details.tool_reports?.length ? (
                      <div className="space-y-3">
                        {details.tool_reports.map((rep) => {
                          const liveUrl = getToolLiveUrl(rep.tool_url);
                          return (
                            <div
                              key={`rep-${rep.id}`}
                              className="p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <ToolFavicon src={rep.favicon_url} alt={rep.tool_name} />
                                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {rep.tool_name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    {rep.report_type}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {liveUrl && (
                                    <a
                                      href={liveUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]"
                                      title="Live Listing"
                                    >
                                      Listing <ExternalLink size={9} />
                                    </a>
                                  )}
                                  {rep.tool_site_url && (
                                    <a
                                      href={rep.tool_site_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline inline-flex items-center gap-0.5 font-medium text-[11px]"
                                      title="Website"
                                    >
                                      Website <Globe size={9} />
                                    </a>
                                  )}
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                    {formatDate(rep.created_at)}
                                  </span>
                                </div>
                              </div>
                              {rep.description && (
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 pl-8">
                                  {rep.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                          No bug or issue reports submitted.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
