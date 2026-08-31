'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, Inbox } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmin } from '@/contexts/AdminContext';
import {
  Contact,
  ContactReplyItem,
  getReplyHistoryList,
  getLatestReplyMessage,
} from '@/lib/contacts';

export type { Contact, ContactReplyItem };
export { getReplyHistoryList, getLatestReplyMessage };

interface ContactTableProps {
  contacts: Contact[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSelectContact: (contact: Contact) => void;
  onDelete: (id: number, name?: string) => void;
  isLoading?: boolean;
}

export function ContactStatusBadge({
  status,
  onClick,
  isClickable = false,
}: {
  status: string;
  onClick?: () => void;
  isClickable?: boolean;
}) {
  const s = (status || '').toLowerCase().trim();
  const isReplied = s === 'replied';
  const isHidden = s === 'hide' || s === 'hidden';

  const variant = isReplied ? 'success' : isHidden ? 'destructive' : 'warning';
  const label = isReplied ? 'Replied' : isHidden ? 'Hide' : 'New';

  if (isClickable && onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="inline-flex cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
        title={`Status: ${label}`}
        suppressHydrationWarning
      >
        <Badge variant={variant} className="cursor-pointer shadow-2xs">
          {label}
        </Badge>
      </button>
    );
  }

  return <Badge variant={variant}>{label}</Badge>;
}

export default function ContactTable({
  contacts,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onSelectContact,
  onDelete,
  isLoading = false,
}: ContactTableProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const { hasPermission, isSuperAdmin } = useAdmin();
  const canUpdate = isSuperAdmin || hasPermission('contacts', 'update');
  const canDelete = isSuperAdmin || hasPermission('contacts', 'delete');

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[28%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Contact Info</TableHead>
            <TableHead className="w-[22%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Subject</TableHead>
            <TableHead className="w-[30%] px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Message</TableHead>
            <TableHead className="w-[10%] px-2 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</TableHead>
            <TableHead className="w-[10%] px-4 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-2.5 w-36 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-36 rounded" />
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Skeleton className="h-3.5 w-52 rounded" />
                </TableCell>
                <TableCell className="px-2 py-4 text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <Skeleton className="w-7 h-7 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : contacts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-48 text-center py-10">
                <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-muted)]">
                    <Inbox size={24} />
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">No inquiries found</div>
                  <p className="text-xs text-[var(--text-muted)] font-medium max-w-sm">
                    No support inquiries match your search criteria or selected filter.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            contacts.map((contact) => (
              <TableRow
                key={contact.contact_id}
                onClick={() => onSelectContact(contact)}
                onMouseEnter={() => setHoveredId(contact.contact_id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`transition-all duration-200 group cursor-pointer border-l-2 relative ${
                  hoveredId === contact.contact_id
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:border-l-zinc-300 dark:bg-zinc-800/40'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                }`}
              >
                <TableCell className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs group-hover:scale-105 transition-all">
                      {contact.name?.substring(0, 1).toUpperCase() || 'C'}
                    </div>
                    <div className="flex flex-col min-w-0 max-w-[200px]">
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {contact.name || 'Anonymous'}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium truncate">
                        {contact.email || '—'}
                      </span>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="px-4 py-4">
                  <div className="text-xs font-semibold text-[var(--text-primary)] max-w-[200px] truncate">
                    {contact.subject || 'No Subject'}
                  </div>
                </TableCell>

                <TableCell className="px-4 py-4">
                  <div className="max-w-[280px]">
                    <p className="text-xs text-[var(--text-secondary)] truncate font-serif italic text-opacity-90">
                      &quot;{contact.message}&quot;
                    </p>
                  </div>
                </TableCell>

                <TableCell className="px-2 py-4 text-center">
                  <ContactStatusBadge status={contact.status} />
                </TableCell>

                <TableCell className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSelectContact(contact)}
                      className="h-7 w-7 rounded-lg text-[var(--text-secondary)] hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
                      title="View & Reply Inquiry"
                    >
                      <Edit2 size={13} />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(contact.contact_id, contact.name || contact.email || `Inquiry #${contact.contact_id}`)}
                        className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-500/20 shadow-2xs cursor-pointer"
                        title="Delete Inquiry"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
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

