'use client';

import React from 'react';
import { ArrowLeft, Send, Mail, User, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Contact, ContactStatusBadge } from './ContactTable';

interface ContactReplyViewProps {
  contact: Contact;
  replyText: string;
  setReplyText: (text: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  onSaveReply: () => void;
  onClose: () => void;
  isActionLoading: boolean;
}

export default function ContactReplyView({
  contact,
  replyText,
  setReplyText,
  selectedStatus,
  setSelectedStatus,
  onSaveReply,
  onClose,
  isActionLoading,
}: ContactReplyViewProps) {
  const formattedDate = contact.created_at
    ? new Date(contact.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const statusOptions = [
    { value: 'replied', label: 'Replied' },
    { value: 'hide', label: 'Hide' },
  ];

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-sm font-semibold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-500/10 gap-2 pl-2"
        >
          <ArrowLeft size={16} />
          Back to Inbox
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] font-medium">Current Status:</span>
          <ContactStatusBadge status={contact.status} />
        </div>
      </div>

      {/* Two Column Detail & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Inquiry Detail */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
                Inquiry Detail
              </span>
              {formattedDate && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-medium">
                  <Calendar size={12} />
                  <span>{formattedDate}</span>
                </div>
              )}
            </div>

            <CardTitle className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
              {contact.subject || 'No Subject'}
            </CardTitle>

            <div className="flex items-center gap-2.5 pt-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <User size={13} className="text-indigo-500" />
                <span>{contact.name || 'Anonymous'}</span>
              </div>
              <span className="text-[var(--text-muted)]">•</span>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Mail size={13} />
                <span>{contact.email || 'No email provided'}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            <div className="rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-color)]/70 p-5 text-sm text-[var(--text-secondary)] leading-relaxed font-serif italic shadow-inner">
              &quot;{contact.message}&quot;
            </div>

            {contact.reply_message && (
              <div className="mt-5 pt-4 border-t border-[var(--border-color)]/60">
                <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  <MessageSquare size={13} className="text-emerald-500" />
                  <span>Previous Response</span>
                  {contact.replied_at && (
                    <span className="font-normal lowercase">
                      ({new Date(contact.replied_at).toLocaleDateString()})
                    </span>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-[var(--text-primary)] leading-relaxed font-medium">
                  {contact.reply_message}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Platform Response */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
              Platform Response
            </span>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">
              Reply to User
            </CardTitle>
            <CardDescription>
              Compose your response message and update visibility status.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-1 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <Textarea
                placeholder="Draft your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="flex-1 min-h-[190px] p-4 text-sm font-medium leading-relaxed bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none"
                suppressHydrationWarning
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block px-0.5">
                Visibility Status
              </label>
              <Select
                value={selectedStatus}
                onChange={(value) => setSelectedStatus(value)}
                options={statusOptions}
                className="bg-[var(--bg-elevated)]"
              />
            </div>

            <Button
              onClick={onSaveReply}
              disabled={isActionLoading}
              className="w-full h-11 text-xs font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 text-white gap-2 transition-all mt-2"
              suppressHydrationWarning
            >
              <Send size={14} />
              {isActionLoading ? 'Saving...' : 'Dispatch Response'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
