'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/contexts/AdminContext';
import { 
  Bell, ChevronDown, User, LogOut, Package, 
  Mail, Star, ExternalLink, Sun, Moon, Menu
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Notification {
  id: number;
  type: 'submission' | 'contact' | 'review' | 'user';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: 1, type: 'submission', title: 'New Tool Submitted', body: 'ChatPDF Pro was submitted for review', time: '2m ago', read: false },
  { id: 2, type: 'contact', title: 'New Contact Message', body: 'John Doe sent a partnership inquiry', time: '15m ago', read: false },
  { id: 3, type: 'review', title: 'Review Pending', body: 'Midjourney has a new 5★ review awaiting approval', time: '1h ago', read: false },
  { id: 4, type: 'user', title: 'New User Registered', body: 'sarah.dev@example.com just signed up', time: '3h ago', read: true },
  { id: 5, type: 'submission', title: 'New Tool Submitted', body: 'VoiceFlow AI submitted for review', time: '5h ago', read: true },
];

const typeIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  submission: Package,
  contact: Mail,
  review: Star,
  user: User,
};

const typeColors: Record<string, string> = {
  submission: 'bg-zinc-100 text-zinc-900 border border-zinc-200/80 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
  contact: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  review: 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  user: 'bg-zinc-100 text-zinc-700 border border-zinc-200/80 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
};

export default function Topbar({ 
  onToggleSidebar
}: { 
  onToggleSidebar?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [showPanel, setShowPanel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { adminData, signOut } = useAdmin();
  const panelRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowPanel(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }



  return (
    <header
      className="fixed top-0 right-0 h-[72px] bg-white dark:bg-[var(--bg-topbar)] border-b border-[#e5e3df] dark:border-[var(--border-color)] flex items-center px-6 gap-4 z-40 shadow-2xs transition-all duration-300 ease-in-out lg:left-[var(--sidebar-width)] left-0"
    >
      {/* Menu Hamburger Toggle on Mobile */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-2 -ml-2 rounded-xl bg-zinc-100/80 hover:bg-zinc-200/70 text-zinc-700 hover:text-zinc-950 dark:bg-[var(--bg-elevated)] dark:hover:bg-[var(--border-color)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer flex items-center justify-center transition-colors duration-150 border border-zinc-200/60 dark:border-transparent"
        title="Open Sidebar"
        type="button"
      >
        <Menu size={18} />
      </button>

      {/* Visit Live Site Link */}
      <div className="flex-1 max-w-[420px] flex items-center">
        <a href="https://www.toolbit.ai/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
          <span className="text-[12px] font-bold uppercase tracking-wider text-zinc-800 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200/80 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-500 dark:to-violet-500 dark:border-indigo-500/20 dark:bg-indigo-500/5 px-3 py-1.5 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors">
            Visit Live Site 
            <ExternalLink size={12} className="text-zinc-700 dark:text-indigo-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </span>
        </a>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Theme Toggle Button */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="relative w-10 h-10 rounded-xl bg-zinc-100/80 hover:bg-zinc-200/70 text-zinc-700 hover:text-zinc-950 dark:bg-[var(--bg-elevated)] dark:hover:bg-[var(--border-color)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer flex items-center justify-center transition-colors duration-150 border border-zinc-200/60 dark:border-transparent shadow-2xs"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          suppressHydrationWarning
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notification Bell */}
        <div ref={panelRef} className="relative">
          <button
            onClick={() => { setShowPanel((v) => !v); setShowProfile(false); }}
            className={`relative w-10 h-10 rounded-xl border cursor-pointer flex items-center justify-center transition-colors duration-150 shadow-2xs ${
              showPanel ? 'bg-zinc-200/80 border-zinc-300 dark:bg-indigo-500/10 dark:border-transparent' : 'bg-zinc-100/80 hover:bg-zinc-200/70 border-zinc-200/60 dark:bg-[var(--bg-elevated)] dark:hover:bg-[var(--border-color)] dark:border-transparent'
            }`}
          >
            <Bell size={18} className={showPanel ? 'text-zinc-950 dark:text-indigo-500' : 'text-zinc-700 dark:text-[var(--text-secondary)]'} />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-zinc-950 text-white dark:bg-rose-500 dark:text-white text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-[var(--bg-topbar)] animate-pulse">
                {unread}
              </span>
            )}
          </button>

          {/* Notification Panel */}
          {showPanel && (
            <div className="absolute top-12 right-0 w-[360px] bg-white dark:bg-[var(--bg-surface)] border border-[#e5e3df] dark:border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden animate-fade-in-up z-50">
              <div className="p-4 border-b border-[#e5e3df] dark:border-[var(--border-color)] flex items-center justify-between bg-zinc-50/70 dark:bg-[var(--bg-elevated)]/30">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-sm text-zinc-950 dark:text-[var(--text-primary)]">Notifications</div>
                  {unread > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-zinc-200/80 dark:border-indigo-500/20">
                      {unread} new
                    </span>
                  )}
                </div>
                {unread > 0 && (
                  <button onClick={markAllRead} className="border-none bg-none text-zinc-700 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 text-xs font-semibold cursor-pointer hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 p-3 px-4 border-b border-[#e5e3df]/60 dark:border-[var(--border-color)] cursor-pointer transition-colors duration-150 ${
                      n.read ? 'bg-transparent' : 'bg-zinc-50/60 dark:bg-indigo-500/[0.02]'
                    } hover:bg-zinc-100/70 dark:hover:bg-indigo-500/5`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeColors[n.type]}`}>
                      {(() => {
                        const Icon = typeIcons[n.type] || Package;
                        return <Icon size={16} />;
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-[13px] text-zinc-950 dark:text-[var(--text-primary)]">{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-[#6366f1] shrink-0" />}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-[var(--text-secondary)] mb-1 truncate">{n.body}</div>
                      <div className="text-[11px] text-zinc-400 dark:text-[var(--text-muted)] font-medium">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 text-center border-t border-[#e5e3df] dark:border-[var(--border-color)] bg-zinc-50/50 dark:bg-transparent">
                <button className="border-none bg-none text-zinc-700 hover:text-zinc-950 dark:text-indigo-500 dark:hover:text-indigo-400 text-xs font-semibold cursor-pointer hover:underline">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* Avatar dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => { setShowProfile((v) => !v); setShowPanel(false); }}
            className={`flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border cursor-pointer transition-colors duration-150 shadow-2xs ${
              showProfile ? 'bg-zinc-200/80 border-zinc-300 dark:bg-indigo-500/10 dark:border-transparent' : 'bg-zinc-100/80 hover:bg-zinc-200/70 border-zinc-200/60 dark:bg-[var(--bg-elevated)] dark:hover:bg-[var(--border-color)] dark:border-transparent'
            }`}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-zinc-200/80 dark:border-indigo-500/20 p-0.5 bg-zinc-900 dark:bg-gradient-to-br dark:from-[#6366f1] dark:to-[#8b5cf6] flex items-center justify-center font-bold text-xs text-white">
              {adminData?.avatar_url ? (
                <img 
                  src={adminData.avatar_url} 
                  alt="" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-full" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-fallback') as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className={`avatar-fallback w-full h-full rounded-full flex items-center justify-center font-bold text-xs text-white ${adminData?.avatar_url ? 'hidden' : 'flex'}`}>
                {adminData?.full_name?.substring(0, 2).toUpperCase() || 'SA'}
              </div>
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-zinc-950 dark:text-[var(--text-primary)] leading-tight">{adminData?.full_name || 'Super Admin'}</div>
              <div className="text-[10px] text-zinc-500 dark:text-[var(--text-muted)] font-semibold mt-0.5 leading-none">{adminData?.email || 'admin@toolbit.ai'}</div>
            </div>
            <ChevronDown size={14} className="text-zinc-500 dark:text-[var(--text-muted)]" />
          </button>
          {showProfile && (
            <div className="absolute top-12 right-0 w-[200px] bg-white dark:bg-[var(--bg-surface)] border border-[#e5e3df] dark:border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden animate-fade-in-up z-50">
              <Link href="/admin/profiles" onClick={() => setShowProfile(false)} className="w-full flex items-center gap-2 p-3 px-4 text-zinc-700 dark:text-[var(--text-secondary)] text-[13px] text-left transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-[var(--bg-elevated)] hover:text-zinc-950 dark:hover:text-indigo-500">
                <User size={15} /> My Profile
              </Link>
              <div className="border-t border-[#e5e3df] dark:border-[var(--border-color)]">
                <button 
                  onClick={signOut}
                  className="w-full flex items-center gap-2 p-3 px-4 bg-transparent text-rose-600 dark:text-rose-500 cursor-pointer text-[13px] text-left transition-colors duration-150 hover:bg-rose-50/80 dark:hover:bg-rose-500/5"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
