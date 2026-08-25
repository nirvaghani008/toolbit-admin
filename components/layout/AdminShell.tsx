'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthorized } = useAdmin();
  const pathname = usePathname();
  const sidebarWidth = collapsed ? 72 : 260;

  const [mounted, setMounted] = useState(false);

  // Auto-close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Set mounted state on client mount & restore sidebar state from localStorage
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('admin_sidebar_collapsed');
      if (savedState !== null) {
        setCollapsed(JSON.parse(savedState));
      }
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  const handleToggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_sidebar_collapsed', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Still verifying or during hydration — show a minimal skeleton that matches the shell layout
  // so there's no jarring full-screen white flash and no hydration mismatch
  if (!mounted || isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] animate-pulse">
        {/* Skeleton topbar */}
        <div
          className="fixed top-0 right-0 left-0 z-30 h-[72px] bg-[var(--bg-surface)] border-b border-[var(--border-color)]"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        />
        {/* Skeleton sidebar */}
        <div
          className="fixed top-0 left-0 h-full bg-[var(--bg-surface)] border-r border-[var(--border-color)] hidden lg:block"
          style={{ width: `${sidebarWidth}px` }}
        />
        {/* Skeleton content area */}
        <div
          className="min-h-screen"
          style={{ paddingTop: '72px', marginLeft: `${sidebarWidth}px` }}
        >
          <div className="p-4 sm:p-7 pb-10 space-y-4">
            <div className="h-8 bg-[var(--bg-elevated)] rounded-xl w-56" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded-lg w-96" />
            <div className="grid grid-cols-4 gap-4 mt-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-[var(--bg-elevated)] rounded-2xl" />
              ))}
            </div>
            <div className="h-64 bg-[var(--bg-elevated)] rounded-2xl mt-2" />
          </div>
        </div>
      </div>
    );
  }


  // Not authorized — context will redirect to /login
  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]" style={{ '--sidebar-width': `${sidebarWidth}px` } as any}>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <Topbar onToggleSidebar={() => setMobileOpen((v) => !v)} />
      <main
        className="min-h-screen transition-all duration-300 ease-in-out lg:ml-[var(--sidebar-width)] ml-0"
        style={{ paddingTop: '72px' }}
      >
        <div className="p-4 sm:p-7 pb-10">{children}</div>
      </main>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <ConfirmProvider>
        <AdminShellContent>{children}</AdminShellContent>
      </ConfirmProvider>
    </AdminProvider>
  );
}
