'use client';

import React, { useState, useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Copy,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  type MarketingOutreachLead,
  addOutreachLeadEmailAction,
  updateOutreachLeadEmailAction,
  updateOutreachLeadEmailStatusAction,
  deleteOutreachLeadEmailAction,
  verifyOutreachLeadEmailAction,
} from '@/app/admin/marketing/actions';
import {
  type BusinessEmailsMap,
  type EmailDeliverabilityStatus,
  type EmailRecord,
  normalizeBusinessEmails,
} from '@/lib/marketing/business-emails';
import EmailDeliverabilityBadge from './EmailDeliverabilityBadge';

interface ManageLeadEmailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: MarketingOutreachLead | null;
  token: string;
  onEmailsUpdated: (leadId: string, updatedEmails: BusinessEmailsMap) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ManageLeadEmailsModal({
  open,
  onOpenChange,
  lead,
  token,
  onEmailsUpdated,
}: ManageLeadEmailsModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const [prevLead, setPrevLead] = useState(lead);
  const [emails, setEmails] = useState<BusinessEmailsMap>(normalizeBusinessEmails(lead?.business_emails));
  const [newEmail, setNewEmail] = useState('');
  const [newEmailStatus, setNewEmailStatus] = useState<EmailDeliverabilityStatus>('unverified');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [editStatus, setEditStatus] = useState<EmailDeliverabilityStatus>('unverified');
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Sync state when lead changes
  if (lead !== prevLead) {
    setPrevLead(lead);
    setEmails(normalizeBusinessEmails(lead?.business_emails));
    setNewEmail('');
    setNewEmailStatus('unverified');
    setEditingEmail(null);
    setEditInput('');
    setEditStatus('unverified');
    setDeletingEmail(null);
    setVerifyingEmail(null);
    setError(null);
    setSuccess(null);
  }

  if (!lead) return null;

  const emailEntries = Object.entries(emails);

  const handleCopy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 1800);
    } catch {
      // Ignore clipboard write failures
    }
  };

  // On-demand No2Bounce email deliverability verification
  const handleVerifyEmail = async (email: string) => {
    setError(null);
    setSuccess(null);

    try {
      setVerifyingEmail(email);
      const res = await verifyOutreachLeadEmailAction(token, lead.id, email);

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to verify email deliverability.');
        return;
      }

      const updated = res.data.business_emails;
      setEmails(updated);
      onEmailsUpdated(lead.id, updated);
      const scoreText = res.data.score !== null ? ` (Score: ${res.data.score}/100)` : '';
      const statusText = res.data.scoreStatus ? ` [${res.data.scoreStatus}]` : '';
      setSuccess(`Verified "${email}" via No2Bounce: ${res.data.status}${scoreText}${statusText}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during email verification.');
    } finally {
      setVerifyingEmail(null);
    }
  };

  // Add a new email address
  const handleAddEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter an email address.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address (e.g. contact@example.com).');
      return;
    }
    if (emails[trimmed] !== undefined) {
      setError(`Email "${trimmed}" is already listed for this tool.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setActionTarget('add');
      const res = await addOutreachLeadEmailAction(token, lead.id, trimmed, newEmailStatus);

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to add email address.');
        return;
      }

      const updated = res.data.business_emails;
      setEmails(updated);
      onEmailsUpdated(lead.id, updated);
      setNewEmail('');
      setNewEmailStatus('unverified');
      setSuccess(`Added "${trimmed}" (${newEmailStatus}) successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while adding email.');
    } finally {
      setIsSubmitting(false);
      setActionTarget(null);
    }
  };

  // Quick deliverability status switcher
  const handleStatusChange = async (email: string, newStatus: EmailDeliverabilityStatus) => {
    setError(null);
    setSuccess(null);

    try {
      setIsSubmitting(true);
      setActionTarget(email);
      const res = await updateOutreachLeadEmailStatusAction(token, lead.id, email, newStatus);

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to update email deliverability status.');
        return;
      }

      const updated = res.data.business_emails;
      setEmails(updated);
      onEmailsUpdated(lead.id, updated);
      setSuccess(`Updated "${email}" to ${newStatus}.`);
      setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while updating status.');
    } finally {
      setIsSubmitting(false);
      setActionTarget(null);
    }
  };

  // Start editing an email
  const handleStartEdit = (email: string, currentStatus: EmailDeliverabilityStatus) => {
    setError(null);
    setSuccess(null);
    setDeletingEmail(null);
    setEditingEmail(email);
    setEditInput(email);
    setEditStatus(currentStatus);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingEmail(null);
    setEditInput('');
  };

  // Save updated email address
  const handleSaveEdit = async (oldEmail: string) => {
    setError(null);
    setSuccess(null);

    const trimmed = editInput.trim().toLowerCase();
    if (!trimmed) {
      setError('Email address cannot be empty.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address format.');
      return;
    }

    if (trimmed === oldEmail.toLowerCase() && editStatus === emails[oldEmail]?.status) {
      handleCancelEdit();
      return;
    }

    // Check if new email is already another entry in the list
    if (trimmed !== oldEmail.toLowerCase() && emails[trimmed] !== undefined) {
      setError(`Email "${trimmed}" already exists in the list.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setActionTarget(oldEmail);
      const res = await updateOutreachLeadEmailAction(token, lead.id, oldEmail, trimmed, editStatus);

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to update email address.');
        return;
      }

      const updated = res.data.business_emails;
      setEmails(updated);
      onEmailsUpdated(lead.id, updated);
      setEditingEmail(null);
      setEditInput('');
      setSuccess(`Updated to "${trimmed}".`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while updating email.');
    } finally {
      setIsSubmitting(false);
      setActionTarget(null);
    }
  };

  // Delete an email address
  const handleConfirmDelete = async (email: string) => {
    setError(null);
    setSuccess(null);

    try {
      setIsSubmitting(true);
      setActionTarget(email);
      const res = await deleteOutreachLeadEmailAction(token, lead.id, email);

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to remove email address.');
        return;
      }

      const updated = res.data.business_emails;
      setEmails(updated);
      onEmailsUpdated(lead.id, updated);
      setDeletingEmail(null);
      setSuccess(`Removed "${email}".`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while deleting email.');
    } finally {
      setIsSubmitting(false);
      setActionTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800 text-left">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="space-y-1">
              <DialogTitle
                id={titleId}
                className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
              >
                <div className="size-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                  <Mail size={16} />
                </div>
                <span>Manage Business Emails</span>
              </DialogTitle>
              <DialogDescription id={descriptionId} className="text-xs text-zinc-500 dark:text-zinc-400">
                Add, edit, or delete outreach email addresses for <strong>{lead.tool_name}</strong>.
              </DialogDescription>
            </div>

            <Badge
              variant="outline"
              className={`text-xs font-semibold px-2.5 py-1 shrink-0 ${
                emailEntries.length > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
              }`}
            >
              {emailEntries.length} {emailEntries.length === 1 ? 'email' : 'emails'}
            </Badge>
          </div>

          {/* Lead metadata preview */}
          {lead.tool_site_url && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
              <span className="text-[11px] text-zinc-400">Website:</span>
              <a
                href={lead.tool_site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-zinc-600 dark:text-zinc-300 hover:underline font-mono truncate max-w-[280px] inline-flex items-center gap-1"
              >
                {lead.tool_site_url.replace(/^https?:\/\//, '')}
                <ExternalLink size={10} className="shrink-0 text-zinc-400" />
              </a>
            </div>
          )}
        </DialogHeader>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Notifications */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="break-words">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="break-words font-medium">{success}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Existing Emails List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Configured Addresses ({emailEntries.length})
              </h3>
              {emailEntries.length === 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <AlertCircle size={12} /> Outreach disabled (no email)
                </span>
              )}
            </div>

            {emailEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-1.5 bg-zinc-50/50 dark:bg-zinc-800/20">
                <Mail size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  No business emails found
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                  Add a verified business email below so you can send outreach campaigns to this tool.
                </p>
              </div>
            ) : (
              <ul className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900/50">
                {emailEntries.map(([email, rawRecord], index) => {
                  const record: EmailRecord =
                    typeof rawRecord === 'object' && rawRecord !== null
                      ? (rawRecord as EmailRecord)
                      : { status: (rawRecord as any) || 'unverified' };
                  const isEditing = editingEmail === email;
                  const isDeleting = deletingEmail === email;
                  const isLoadingThis = isSubmitting && actionTarget === email;

                  return (
                    <li
                      key={email}
                      className="p-3 transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
                    >
                      {isEditing ? (
                        /* Inline Edit Form */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="email"
                              value={editInput}
                              onChange={(e) => setEditInput(e.target.value)}
                              placeholder="email@example.com"
                              className="h-8 text-xs font-mono flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(email);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              disabled={isLoadingThis}
                            />
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as EmailDeliverabilityStatus)}
                              disabled={isLoadingThis}
                              className="h-8 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
                              title="Deliverability status"
                            >
                              <option value="unverified">Unverified</option>
                              <option value="deliverable">Deliverable</option>
                              <option value="undeliverable">Undeliverable</option>
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveEdit(email)}
                              disabled={isLoadingThis || !editInput.trim()}
                              className="h-8 text-xs px-3 font-semibold gap-1 shrink-0"
                            >
                              {isLoadingThis ? <Spinner size={12} /> : <Check size={13} />}
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleCancelEdit}
                              disabled={isLoadingThis}
                              className="h-8 text-xs px-2.5 shrink-0"
                            >
                              <X size={13} />
                            </Button>
                          </div>
                          <p className="text-[10px] text-zinc-400 pl-1">
                            Press Enter to save or Escape to cancel.
                          </p>
                        </div>
                      ) : isDeleting ? (
                        /* Inline Delete Confirmation */
                        <div className="flex items-center justify-between gap-3 p-1 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
                          <span className="text-xs text-rose-700 dark:text-rose-300 font-medium pl-2 truncate">
                            Remove <strong>{email}</strong>?
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleConfirmDelete(email)}
                              disabled={isLoadingThis}
                              className="h-7 text-xs px-2.5 font-semibold gap-1 bg-rose-600 hover:bg-rose-700 text-white"
                            >
                              {isLoadingThis ? <Spinner size={11} /> : <Trash2 size={12} />}
                              Confirm Delete
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingEmail(null)}
                              disabled={isLoadingThis}
                              className="h-7 text-xs px-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Standard Email Row */
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="size-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
                                <Mail size={13} />
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span
                                  className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate select-all"
                                  title={email}
                                >
                                  {email}
                                </span>

                                <EmailDeliverabilityBadge
                                  email={email}
                                  record={record}
                                  size="sm"
                                  showEmail={false}
                                  showPrimaryBadge={false}
                                  onStatusChange={(newStatus) => handleStatusChange(email, newStatus)}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleVerifyEmail(email)}
                                disabled={isSubmitting || verifyingEmail !== null}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                title={
                                  record.verification_score !== undefined
                                    ? `Re-verify deliverability via No2Bounce (current score: ${record.verification_score}/100)`
                                    : 'Verify deliverability via No2Bounce'
                                }
                                aria-label={`Verify deliverability for ${email}`}
                              >
                                {verifyingEmail === email ? (
                                  <Spinner size={12} />
                                ) : (
                                  <ShieldCheck
                                    size={13}
                                    className={record.verification_provider ? 'text-emerald-600 dark:text-emerald-400' : ''}
                                  />
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopy(email)}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                title={copiedEmail === email ? 'Copied!' : 'Copy email'}
                                aria-label={`Copy ${email}`}
                              >
                                {copiedEmail === email ? (
                                  <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Copy size={13} />
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEdit(email, record.status)}
                                disabled={isSubmitting}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                title="Edit email"
                                aria-label={`Edit ${email}`}
                              >
                                <Edit2 size={13} />
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingEmail(email)}
                                disabled={isSubmitting}
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400"
                                title="Delete email"
                                aria-label={`Delete ${email}`}
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </div>

                          {record.resend_status === 'bounced' && record.bounce_reason && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 pl-8.5 font-medium">
                              <AlertCircle size={11} className="shrink-0" />
                              <span>Bounced in Resend: {record.bounce_reason}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Add New Email Section */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Plus size={13} /> Add Business Email
            </h3>

            <form onSubmit={handleAddEmail} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. founder@domain.ai, team@domain.com"
                  className="h-9 text-xs pl-8 font-mono"
                  disabled={isSubmitting && actionTarget === 'add'}
                />
                <Mail
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
              </div>

              <select
                value={newEmailStatus}
                onChange={(e) => setNewEmailStatus(e.target.value as EmailDeliverabilityStatus)}
                disabled={isSubmitting && actionTarget === 'add'}
                className="h-9 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
                title="Deliverability status"
              >
                <option value="unverified">Unverified</option>
                <option value="deliverable">Deliverable</option>
                <option value="undeliverable">Undeliverable</option>
              </select>

              <Button
                type="submit"
                size="sm"
                disabled={!newEmail.trim() || (isSubmitting && actionTarget === 'add')}
                className="h-9 text-xs px-4 font-semibold gap-1.5 shrink-0"
              >
                {isSubmitting && actionTarget === 'add' ? (
                  <Spinner size={13} />
                ) : (
                  <Plus size={14} />
                )}
                Add Email
              </Button>
            </form>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 pl-1">
              <Info size={12} className="shrink-0" />
              <span>Emails are automatically normalized to lowercase and trimmed.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            Changes update the database immediately.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs px-4"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
