'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/contexts/AdminContext';
import { 
  ChevronDown, User, LogOut, 
  ExternalLink, Sun, Moon, Menu
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function Topbar({ 
  onToggleSidebar
}: { 
  onToggleSidebar?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const { adminData, signOut } = useAdmin();
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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
          <span className="text-[12px] font-bold uppercase tracking-wider text-zinc-800 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200/80 dark:text-zinc-300 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 dark:border-zinc-700 px-3 py-1.5 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors">
            Visit Live Site 
            <ExternalLink size={12} className="text-zinc-700 dark:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
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

        {/* Avatar dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setShowProfile((v) => !v)}
            className={`flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border cursor-pointer transition-colors duration-150 shadow-2xs ${
              showProfile ? 'bg-zinc-200/80 border-zinc-300 dark:bg-zinc-700/60 dark:border-transparent' : 'bg-zinc-100/80 hover:bg-zinc-200/70 border-zinc-200/60 dark:bg-[var(--bg-elevated)] dark:hover:bg-[var(--border-color)] dark:border-transparent'
            }`}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-zinc-200/80 dark:border-zinc-700 p-0.5 bg-zinc-800 dark:bg-zinc-700 flex items-center justify-center font-bold text-xs text-white dark:text-zinc-200">
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
