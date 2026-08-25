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

export interface Contact {
  contact_id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  visibility: string;
  reply_message?: string;
  created_at: string;
  replied_at?: string;
}

interface ContactTableProps {
  contacts: Contact[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSelectContact: (contact: Contact) => void;
  onDelete: (id: number) => void;
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

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden animate-fade-in relative">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)]/40">
            <TableHead className="w-[28%]">Contact Info</TableHead>
            <TableHead className="w-[22%]">Subject</TableHead>
            <TableHead className="w-[30%]">Message</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
            <TableHead className="w-[10%] text-center">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <TableRow key={`skeleton-${idx}`} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-2.5 w-36 rounded" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-36 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-52 rounded" />
                </TableCell>
                <TableCell className="text-center">
                  <Skeleton className="h-5 w-16 mx-auto rounded-md" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <Skeleton className="w-8 h-8 rounded-lg" />
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
                    ? 'border-l-zinc-900 bg-zinc-100/70 dark:bg-indigo-500/[0.04] dark:border-l-[var(--primary)]'
                    : 'border-l-transparent hover:bg-zinc-50/80 dark:hover:bg-indigo-500/[0.02]'
                }`}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      {contact.name?.substring(0, 1).toUpperCase() || 'C'}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[170px]">
                        {contact.name || 'Anonymous'}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] font-medium truncate max-w-[170px]">
                        {contact.email || '—'}
                      </span>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="text-xs font-semibold text-[var(--text-primary)] max-w-[200px] truncate">
                    {contact.subject || 'No Subject'}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="max-w-[280px]">
                    <p className="text-xs text-[var(--text-secondary)] truncate font-serif italic text-opacity-90">
                      &quot;{contact.message}&quot;
                    </p>
                  </div>
                </TableCell>

                <TableCell className="text-center">
                  <ContactStatusBadge status={contact.status} />
                </TableCell>

                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSelectContact(contact)}
                      className="w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                      title="View & Reply Inquiry"
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(contact.contact_id)}
                      className="w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Delete Inquiry"
                    >
                      <Trash2 size={14} />
                    </Button>
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
