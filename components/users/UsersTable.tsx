'use client';

import { useState } from 'react';
import { Bookmark, ThumbsUp, Clock, Users } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  saved_count: number;
  upvoted_count: number;
}

interface UsersTableProps {
  users: UserRow[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export default function UsersTable({
  users,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  isLoading = false,
}: UsersTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[28%]">User</TableHead>
            <TableHead className="w-[26%]">Email</TableHead>
            <TableHead className="w-[12%] text-center">Saved Tools</TableHead>
            <TableHead className="w-[10%] text-center">Upvoted</TableHead>
            <TableHead className="w-[12%]">Last Sign In</TableHead>
            <TableHead className="w-[12%]">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`user-skeleton-${i}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-28 rounded" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-44 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-3.5 w-8 mx-auto rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-3.5 w-8 mx-auto rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-24 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-24 rounded" />
                </TableCell>
              </TableRow>
            ))
          ) : users.length > 0 ? (
            users.map((user) => (
              <TableRow
                key={user.id}
                onMouseEnter={() => setHoveredId(user.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`transition-colors duration-200 group cursor-pointer border-l-2 relative ${
                  hoveredId === user.id
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-indigo-600 dark:bg-indigo-500/[0.05]'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                }`}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.full_name || ''}
                        className="w-9 h-9 rounded-full object-cover border border-[var(--border-color)] shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-500 shrink-0">
                        {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[160px]">
                      {user.full_name || (
                        <span className="text-[var(--text-muted)] italic text-xs font-normal">
                          No name
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[220px] block">
                    {user.email}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Bookmark size={13} className="text-emerald-500" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {user.saved_count}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <ThumbsUp size={13} className="text-amber-500" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {user.upvoted_count}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Clock
                      size={12}
                      className={
                        user.last_sign_in_at
                          ? 'text-emerald-500'
                          : 'text-[var(--text-muted)]'
                      }
                    />
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      {formatDate(user.last_sign_in_at)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-[var(--text-muted)] font-medium">
                    {formatDate(user.created_at)}
                  </span>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center py-12">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)]">
                    <Users size={22} className="opacity-60" />
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    No users found
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    No registered user accounts match the current filter or search criteria.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Pagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>
  );
}
