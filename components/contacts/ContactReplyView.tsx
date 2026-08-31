'use client';

import React, { useState } from 'react';
import { Send, Mail, User, Calendar, MessageSquare, AlertCircle, Eye } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import StickyFormBackButton from '@/components/common/StickyFormBackButton';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { generateContactReplyEmail } from '@/lib/email/templates/contact-reply';
import { Contact, getReplyHistoryList } from '@/lib/contacts';
import { ContactStatusBadge } from './ContactTable';

interface ContactReplyViewProps {
  contact: Contact;
  replyText: string;
  setReplyText: (text: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  onSaveReply: () => void;
  onClose: () => void;
  isActionLoading: boolean;
  replyError?: string | null;
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
  replyError,
}: ContactReplyViewProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
    { value: 'replied', label: 'Replied (Sends Email)' },
    { value: 'hide', label: 'Hide (Archived / No Email)' },
  ];

  // Render preview email on demand
  const previewEmail = generateContactReplyEmail({
    userName: contact.name,
    userEmail: contact.email || '',
    originalSubject: contact.subject || 'Support Inquiry',
    originalMessage: contact.message || '',
    replyMessage: replyText.trim() || 'Type your message above to see how it will appear in the recipient\'s inbox...',
    submittedAt: contact.created_at,
  });

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <StickyFormBackButton
          label="Back to Inquiries"
          onClick={onClose}
          isLoading={isActionLoading}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] font-medium">Current Status:</span>
          <ContactStatusBadge status={contact.status} />
        </div>
      </div>

      {/* Two Column Detail & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Inquiry Detail */}
        <Card className="shadow-sm border-[var(--border-color)] bg-[var(--bg-surface)]">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Inquiry Detail
              </span>
              {formattedDate && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-medium">
                  <Calendar size={12} className="text-zinc-600 dark:text-zinc-200" />
                  <span>{formattedDate}</span>
                </div>
              )}
            </div>

            <CardTitle className="text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
              {contact.subject || 'No Subject'}
            </CardTitle>

            <div className="flex items-center gap-2.5 pt-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <User size={13} className="text-zinc-500" />
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

            {/* Conversation History Timeline */}
            {(() => {
              const replies = getReplyHistoryList(contact.reply_message, contact.replied_at);
              return (
                <div className="mt-6 pt-5 border-t border-[var(--border-color)]/60">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      <MessageSquare size={13} className="text-emerald-600 dark:text-emerald-400" />
                      <span>Conversation History</span>
                    </div>
                    {replies.length > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {replies.length} {replies.length === 1 ? 'Response' : 'Responses'}
                      </span>
                    )}
                  </div>

                  {replies.length > 0 ? (
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {replies.map((item, idx) => {
                        const formattedSentAt = item.sent_at
                          ? new Date(item.sent_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : null;

                        return (
                          <div
                            key={item.id || `reply-${idx}`}
                            className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                              <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                                <span className="w-5 h-5 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[10px] font-extrabold shrink-0">
                                  {(item.admin_name || item.admin_email || 'A').charAt(0).toUpperCase()}
                                </span>
                                <span>{item.admin_name || 'Admin'}</span>
                              </div>
                              {formattedSentAt && (
                                <span className="text-[10px] text-[var(--text-muted)] font-medium">
                                  {formattedSentAt}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-medium">
                              {item.message}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-[var(--bg-elevated)]/40 border border-dashed border-[var(--border-color)] text-center text-xs text-[var(--text-muted)]">
                      No responses sent yet. Compose and dispatch your response on the right.
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Right Column: Platform Response */}
        <Card className="shadow-sm border-[var(--border-color)] bg-[var(--bg-surface)] flex flex-col">
          <CardHeader className="pb-3">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Platform Response
            </span>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">
              Reply to User
            </CardTitle>
            <CardDescription>
              Compose your response message. When marked as Replied, an official email is delivered directly to the user.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-1 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <label htmlFor="replyText" className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                  Response Message
                </label>
                {selectedStatus === 'replied' && (
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Eye size={13} />
                    Preview Email
                  </button>
                )}
              </div>

              <Textarea
                name="replyText"
                id="replyText"
                placeholder="Draft your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={isActionLoading}
                className={`flex-1 min-h-[190px] p-4 text-sm font-medium leading-relaxed bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none ${
                  replyError ? 'saas-input-error' : 'border-[var(--border-color)]'
                }`}
                suppressHydrationWarning
              />
              {replyError && (
                <p className="saas-error-message">
                  <AlertCircle size={13} className="shrink-0" /> {replyError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block px-0.5">
                Visibility & Action Status
              </label>
              <Select
                name="selectedStatus"
                value={selectedStatus}
                onChange={(value) => setSelectedStatus(value)}
                options={statusOptions}
                disabled={isActionLoading}
                className="bg-[var(--bg-elevated)]"
              />
            </div>

            <div className="pt-1">
              <Button
                onClick={onSaveReply}
                disabled={isActionLoading}
                className="w-full h-11 text-xs font-bold shadow-xs bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 gap-2 transition-all rounded-xl active:scale-95 cursor-pointer"
                suppressHydrationWarning
              >
                {isActionLoading ? (
                  <>
                    <Spinner size={14} className="text-current shrink-0" />
                    {selectedStatus === 'replied' ? 'Sending Email & Saving...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    {selectedStatus === 'replied' ? 'Dispatch & Send Email' : 'Save & Hide Inquiry'}
                  </>
                )}
              </Button>

              <p className="text-[11px] text-[var(--text-muted)] text-center mt-2">
                {selectedStatus === 'replied' ? (
                  <>
                    Delivering response to <span className="font-semibold text-[var(--text-primary)]">{contact.email || 'user'}</span> via Hostinger SMTP.
                  </>
                ) : (
                  'Inquiry will be marked as hidden. No email will be dispatched.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branded Email Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b border-[var(--border-color)]">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <img
                src="https://www.toolbit.ai/logo-icon.png"
                alt="Toolbit"
                width={20}
                height={20}
                className="w-5 h-5 rounded-sm inline-block shrink-0"
              />
              <span>Toolbit.ai Email Preview</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              This preview reflects the exact responsive email that will be delivered to <span className="font-semibold text-[var(--text-primary)]">{contact.email}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-1.5 text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)]/60 p-3 rounded-lg border border-[var(--border-color)]">
            <div><strong className="text-[var(--text-primary)]">From:</strong> Contact - Toolbit.ai &lt;contact@toolbit.ai&gt;</div>
            <div><strong className="text-[var(--text-primary)]">To:</strong> {contact.name || 'Anonymous'} &lt;{contact.email}&gt;</div>
            <div><strong className="text-[var(--text-primary)]">Subject:</strong> {previewEmail.subject}</div>
          </div>

          <div className="flex-1 min-h-[420px] rounded-xl border border-[var(--border-color)] overflow-hidden bg-white mt-3">
            <iframe
              srcDoc={previewEmail.html}
              title="Email Preview"
              className="w-full h-full min-h-[420px] border-0"
              sandbox="allow-same-origin"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-[var(--border-color)] mt-4">
            <Button
              variant="outline"
              onClick={() => setIsPreviewOpen(false)}
              className="text-xs"
            >
              Close Preview
            </Button>
            <Button
              onClick={() => {
                setIsPreviewOpen(false);
                onSaveReply();
              }}
              disabled={isActionLoading || !replyText.trim()}
              className="text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 gap-1.5"
            >
              <Send size={13} />
              Send Email Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

