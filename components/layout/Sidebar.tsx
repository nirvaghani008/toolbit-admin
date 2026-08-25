'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import {
  ChevronLeft, ChevronDown,
  LayoutDashboard, Wrench, FileText, Inbox,
  Mail, User, LogOut, RefreshCw,
  Users, ShieldCheck
} from 'lucide-react';

interface SubItem {
  label: string;
  href: string;
  module?: string;
  superAdminOnly?: boolean;
}

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  module?: string;
  superAdminOnly?: boolean;
  sub?: SubItem[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  {
    label: 'Tool Management',
    icon: Wrench,
    module: 'tools',
    sub: [
      { label: 'Tools', href: '/admin/tools', module: 'tools' },
      { label: 'Categories', href: '/admin/tools/categories', module: 'categories' },
      { label: 'Hashtags', href: '/admin/tools/hashtags', module: 'hashtags' },
      { label: 'Reviews', href: '/admin/tools/reviews', module: 'reviews' },
      { label: 'Tool Reports', href: '/admin/tools/reports', module: 'reports' },
    ],
  },
  { label: 'Blog Posts', href: '/admin/content/blog-posts', icon: FileText, module: 'blog_posts' },
  {
    label: 'Updates Management',
    icon: RefreshCw,
    module: 'updates',
    sub: [
      { label: 'Models', href: '/admin/updates/models', module: 'models' },
      { label: 'News', href: '/admin/updates/news', module: 'news' },
      { label: 'Socials', href: '/admin/updates/socials', module: 'socials' },
    ],
  },
  {
    label: 'Submissions',
    icon: Inbox,
    module: 'submissions',
    sub: [
      { label: 'Tool Submissions', href: '/admin/submissions/tools', module: 'submissions' },
      { label: 'Advertise Tools', href: '/admin/submissions/advertise', module: 'submissions' },
      { label: 'Orders', href: '/admin/submissions/orders', module: 'orders' },
    ],
  },
  {
    label: 'Users & Community',
    icon: Users,
    module: 'users',
    sub: [
      { label: 'Users', href: '/admin/users', module: 'users' },
      { label: 'Newsletter Subs', href: '/admin/newsletter', module: 'newsletter' },
    ],
  },
  { label: 'Contacts', href: '/admin/contacts', icon: Mail, module: 'contacts' },
  {
    label: 'Manage Admins',
    href: '/admin/manage-admins',
    icon: ShieldCheck,
    superAdminOnly: true,
    module: 'manage_admins',
  },
  { label: 'My Profile', href: '/admin/profiles', icon: User, module: 'profiles' },
];

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onCloseMobile
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const { adminData, signOut, isSuperAdmin, hasPermission } = useAdmin();
  const [openMenus, setOpenMenus] = useState<string[]>([]);

  const visibleNavItems = useMemo(() => {
    return navItems
      .filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.module && !hasPermission(item.module, 'view')) {
          if (item.sub) {
            return item.sub.some((sub) => {
              if (sub.superAdminOnly && !isSuperAdmin) return false;
              return !sub.module || hasPermission(sub.module, 'view');
            });
          }
          return false;
        }
        return true;
      })
      .map((item) => {
        if (!item.sub) return item;
        const filteredSub = item.sub.filter((sub) => {
          if (sub.superAdminOnly && !isSuperAdmin) return false;
          return !sub.module || hasPermission(sub.module, 'view');
        });
        return { ...item, sub: filteredSub };
      });
  }, [isSuperAdmin, hasPermission]);

  function toggleMenu(label: string) {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  function isActive(href: string) {
    return pathname === href;
  }

  function isGroupActive(sub: SubItem[]) {
    return sub.some((s) => isActive(s.href));
  }

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname === href) {
      e.preventDefault();
      window.location.reload();
    }
  };

  return (
    <aside
      className={`fixed top-0 bottom-0 z-50 flex flex-col transition-all duration-300 ease-in-out bg-white dark:bg-[var(--bg-sidebar)] border-r border-[#e5e3df] dark:border-[var(--border-color)] shadow-2xs overflow-x-hidden
        ${collapsed ? 'w-[72px]' : 'w-[260px]'}
        lg:left-0 lg:translate-x-0
        ${mobileOpen ? 'left-0 translate-x-0' : 'left-[-260px] -translate-x-full lg:translate-x-0 lg:left-0'}
        max-lg:w-[260px]
      `}
      style={{ height: '100vh' }}
    >
      {/* Logo Header */}
      <div className={`relative flex items-center min-h-[72px] border-b border-[#e5e3df] dark:border-[var(--border-color)] overflow-hidden ${collapsed ? 'justify-center p-3' : 'justify-between px-4'
        }`}>
        {collapsed ? (
          <div
            onClick={onToggle}
            className="flex items-center justify-center cursor-pointer group"
            title="Open Sidebar"
          >
            <div className="flex items-center justify-center shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-xs transition-transform group-hover:scale-105">
              <img
                src="/images/logo.png"
                alt="Toolbit Logo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '🤖';
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-xs">
                <img
                  src="/images/logo.png"
                  alt="Toolbit Logo"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '🤖';
                  }}
                />
              </div>
              <div className="whitespace-nowrap">
                <div className="text-[14px] font-bold text-zinc-950 dark:text-[var(--text-primary)] leading-tight tracking-tight">
                  Toolbit
                </div>
                <div className="text-[9px] text-zinc-400 dark:text-[var(--text-muted)] font-bold tracking-wider uppercase">
                  ADMIN PANEL
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (mobileOpen && onCloseMobile) {
                  onCloseMobile();
                } else {
                  onToggle();
                }
              }}
              className="flex items-center justify-center shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] dark:hover:bg-[var(--bg-elevated)] transition-all duration-200 cursor-pointer"
              title={mobileOpen ? "Close Mobile Menu" : "Collapse Sidebar"}
              suppressHydrationWarning
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {/* Admin Profile */}
      <div className={`flex items-center gap-3 border-b border-[#e5e3df] dark:border-[var(--border-color)] ${collapsed ? 'p-3 justify-center' : 'p-4 px-5'}`}>
        <div className="shrink-0 w-10 h-10 rounded-full border-2 border-zinc-200/80 dark:border-indigo-500/20 p-0.5 overflow-hidden bg-zinc-900 dark:bg-gradient-to-br dark:from-[#6366f1]/10 dark:to-[#8b5cf6]/10 flex items-center justify-center">
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
          <div className={`avatar-fallback w-full h-full rounded-full bg-zinc-900 dark:bg-gradient-to-br dark:from-[#6366f1] dark:to-[#8b5cf6] flex items-center justify-center text-[11px] font-bold text-white ${adminData?.avatar_url ? 'hidden' : 'flex'}`}>
            {adminData?.full_name?.substring(0, 2).toUpperCase() || 'SA'}
          </div>
        </div>
        {!collapsed && (
          <div className="flex-1 overflow-hidden whitespace-nowrap">
            <div className="text-[13px] font-bold text-zinc-950 dark:text-[var(--text-primary)] truncate tracking-tight">
              {adminData?.full_name || 'Super Admin'}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-[var(--text-muted)] font-semibold truncate opacity-70">
              {adminData?.email || 'admin@toolbit.ai'}
            </div>
          </div>
        )}
        {!collapsed && (
          <span
            className={`ml-auto text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded border uppercase shrink-0 ${
              isSuperAdmin
                ? 'bg-zinc-100 text-zinc-800 border-zinc-200/80 dark:bg-indigo-500/10 dark:text-[#818cf8] dark:border-indigo-500/20'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
            }`}
          >
            {isSuperAdmin ? 'Admin' : 'Sub-Admin'}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 px-2 overflow-y-auto space-y-1">
        {visibleNavItems.map((item) => {
          if (item.sub) {
            const isOpen = openMenus.includes(item.label);
            const groupActive = isGroupActive(item.sub);
            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  onClick={() => {
                    if (collapsed) {
                      onToggle();
                      if (!openMenus.includes(item.label)) {
                        setOpenMenus((prev) => [...prev, item.label]);
                      }
                    } else {
                      toggleMenu(item.label);
                    }
                  }}
                  title={item.label}
                  className={`group relative w-full flex items-center gap-2.5 rounded-lg transition-all duration-200 p-2 cursor-pointer ${collapsed ? 'justify-center' : 'pl-3.5 pr-3'
                    } ${groupActive
                      ? 'bg-zinc-100/90 text-zinc-950 font-semibold hover:bg-zinc-100 dark:bg-indigo-500/15 dark:text-[#818cf8] dark:hover:bg-indigo-500/25'
                      : 'text-zinc-600 font-medium hover:bg-zinc-50/90 hover:text-zinc-950 dark:text-[var(--text-secondary)] dark:hover:bg-[var(--bg-elevated)] dark:hover:text-[var(--text-primary)]'
                    }`}
                  suppressHydrationWarning
                >
                  {/* Active/Hover Indicator Pill */}
                  <div className={`absolute left-1 top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-full bg-zinc-900 dark:bg-[#818cf8] transition-all duration-200 origin-center ${groupActive
                    ? 'scale-y-100 opacity-100'
                    : 'scale-y-0 opacity-0 group-hover:opacity-60 group-hover:scale-y-100'
                    }`} />

                  <item.icon size={18} className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${groupActive
                    ? 'text-zinc-950 dark:text-[#818cf8] scale-105'
                    : 'text-zinc-500 group-hover:text-zinc-950 dark:text-[var(--text-secondary)] dark:group-hover:text-[#818cf8]'
                    }`} />
                  <span className={`flex-1 text-[13px] text-left whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[150px] opacity-100'
                    }`}>
                    {item.label}
                  </span>
                  {!collapsed && (
                    <ChevronDown size={14} className={`transition-transform duration-200 shrink-0 group-hover:translate-y-[1px] ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-[22px] pl-[14px] border-l border-[#e5e3df] dark:border-[var(--border-color)]/70 mt-1 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {item.sub.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={(e) => handleNavClick(e, sub.href)}
                        className={`group/sub flex items-center gap-2 p-1.5 px-3 rounded-lg text-[13px] transition-all duration-200 outline-none hover:translate-x-1.5 ${isActive(sub.href)
                          ? 'font-semibold text-zinc-950 bg-zinc-100 hover:bg-zinc-100/90 dark:text-[#818cf8] dark:bg-indigo-500/15 dark:hover:bg-indigo-500/20'
                          : 'text-zinc-600 font-medium hover:text-zinc-950 hover:bg-zinc-50 dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] dark:hover:bg-[var(--bg-elevated)]'
                          }`}
                      >
                        {/* Active/Hover mini dot */}
                        <span className={`w-1.5 h-1.5 rounded-full transition-all duration-200 shrink-0 ${isActive(sub.href)
                          ? 'bg-zinc-900 dark:bg-[#818cf8] scale-100 opacity-100'
                          : 'bg-zinc-400/60 dark:bg-[#818cf8]/40 scale-0 opacity-0 group-hover/sub:scale-100 group-hover/sub:opacity-100'
                          }`} />
                        <span className="whitespace-nowrap overflow-hidden">{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              onClick={(e) => handleNavClick(e, item.href!)}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center gap-2.5 rounded-lg transition-all duration-200 p-2 cursor-pointer ${collapsed ? 'justify-center' : 'pl-3.5 pr-3'
                } ${isActive(item.href!)
                  ? 'bg-zinc-100/90 text-zinc-950 font-semibold hover:bg-zinc-100 dark:bg-indigo-500/15 dark:text-[#818cf8] dark:hover:bg-indigo-500/20'
                  : 'text-zinc-600 font-medium hover:bg-zinc-50/90 hover:text-zinc-950 dark:text-[var(--text-secondary)] dark:hover:bg-[var(--bg-elevated)] dark:hover:text-[var(--text-primary)]'
                }`}
            >
              {/* Active/Hover Indicator Pill */}
              <div className={`absolute left-1 top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-full bg-zinc-900 dark:bg-[#818cf8] transition-all duration-200 origin-center ${isActive(item.href!)
                ? 'scale-y-100 opacity-100'
                : 'scale-y-0 opacity-0 group-hover:opacity-60 group-hover:scale-y-100'
                }`} />

              <item.icon size={18} className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${isActive(item.href!)
                ? 'text-zinc-950 dark:text-[#818cf8] scale-105'
                : 'text-zinc-500 group-hover:text-zinc-950 dark:text-[var(--text-secondary)] dark:group-hover:text-[#818cf8]'
                }`} />
              <span className={`text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[150px] opacity-100'
                }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Logout */}
      <div className="border-t border-[#e5e3df] dark:border-[var(--border-color)] p-2 pb-3 space-y-1">
        {/* Logout */}
        <button
          onClick={signOut}
          title={collapsed ? 'Logout' : undefined}
          className={`group relative w-full flex items-center gap-2.5 rounded-lg transition-all duration-200 p-2 cursor-pointer ${collapsed ? 'justify-center' : 'pl-3.5 pr-3'
            } text-rose-600 font-medium hover:bg-rose-50/80 hover:text-rose-700 dark:text-red-500 dark:hover:bg-red-500/[12%] dark:hover:text-red-400`}
          suppressHydrationWarning
        >
          {/* Logout Hover Indicator Pill */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-[3.5px] h-5 rounded-full bg-rose-600 dark:bg-red-400 transition-all duration-200 origin-center scale-y-0 opacity-0 group-hover:opacity-70 group-hover:scale-y-100" />

          <LogOut size={18} className="shrink-0 transition-all duration-200 group-hover:scale-110 group-hover:translate-x-0.5" />
          {!collapsed && <span className="text-[13px]">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
