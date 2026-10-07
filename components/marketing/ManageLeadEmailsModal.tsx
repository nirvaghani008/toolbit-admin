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
  ArrowUpRight,
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
  const initial = (lead.tool_name || '?').trim().charAt(0).toUpperCase() || '?';

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
      <DialogContent className="w-full max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-zinc-800/80 shadow-2xl transition-all">
        {/* ── Header ── */}
        <DialogHeader className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-left space-y-0">
          <div className="flex items-center justify-between gap-4 pr-8">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                aria-hidden="true"
                className="size-11 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200/80 dark:from-zinc-800 dark:to-zinc-800/50 border border-zinc-200/90 dark:border-zinc-700/60 flex items-center justify-center text-base font-bold text-zinc-900 dark:text-zinc-100 shrink-0 shadow-2xs"
              >
                {initial}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle
                    id={titleId}
                    className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate"
                  >
                    Business Emails
                  </DialogTitle>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[200px] sm:max-w-xs">
                    {lead.tool_name}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <DialogDescription id={descriptionId} className="sr-only">
                    Add, edit, or delete outreach email addresses for {lead.tool_name}.
                  </DialogDescription>
                  {lead.tool_site_url ? (
                    <a
                      href={lead.tool_site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group truncate"
                    >
                      <span>{lead.tool_site_url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')}</span>
                      <ArrowUpRight size={11} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <span>Manage contact endpoints for marketing outreach</span>
                  )}
                </div>
              </div>
            </div>

            <Badge
              variant="outline"
              className={`text-xs font-semibold px-2.5 py-1 shrink-0 shadow-2xs ${
                emailEntries.length > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
              }`}
            >
              {emailEntries.length} {emailEntries.length === 1 ? 'address' : 'addresses'}
            </Badge>
          </div>
        </DialogHeader>

        {/* ── Content Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {/* Notifications */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="break-words font-medium">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="break-words font-medium">{success}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200 shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Existing Emails List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-zinc-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Configured Addresses ({emailEntries.length})
                </h3>
              </div>
              {emailEntries.length === 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <AlertCircle size={12} /> Outreach disabled (no email)
                </span>
              )}
            </div>

            {emailEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-2 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="size-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                  <Mail size={18} />
                </div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  No business emails found
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  Add a verified business email below to enable automated and manual outreach campaigns for this tool.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {emailEntries.map(([email, rawRecord]) => {
                  const record: EmailRecord =
                    typeof rawRecord === 'object' && rawRecord !== null
                      ? (rawRecord as EmailRecord)
                      : { status: (rawRecord as any) || 'unverified' };
                  const isEditing = editingEmail === email;
                  const isDeleting = deletingEmail === email;
                  const isLoadingThis = isSubmitting && actionTarget === email;

                  if (isEditing) {
                    return (
                      <div
                        key={email}
                        className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            type="email"
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            placeholder="email@example.com"
                            className="h-8 text-xs font-mono flex-1 bg-white dark:bg-zinc-900"
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
                            className="h-8 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
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
                            {isLoadingThis ? <Spinner size={11} /> : <Check size={12} />}
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
                            <X size={12} />
                          </Button>
                        </div>
                        <p className="text-[10px] text-zinc-400 pl-1">
                          Press Enter to save or Escape to cancel.
                        </p>
                      </div>
                    );
                  }

                  if (isDeleting) {
                    return (
                      <div
                        key={email}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 shadow-2xs"
                      >
                        <span className="text-xs text-rose-700 dark:text-rose-300 font-medium truncate">
                          Delete <strong>{email}</strong> from this lead?
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
                            Delete
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
                    );
                  }

                  return (
                    <div
                      key={email}
                      className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-colors shadow-2xs group"
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Email text & badges */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
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

                            {record.verification_score !== undefined && (
                              <span
                                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60"
                                title={`No2Bounce score: ${record.verification_score}/100`}
                              >
                                {record.verification_score}/100
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Verify */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVerifyEmail(email)}
                            disabled={isSubmitting || verifyingEmail !== null}
                            className="size-7 p-0 rounded-lg text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
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

                          {/* Copy */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(email)}
                            className="size-7 p-0 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title={copiedEmail === email ? 'Copied!' : 'Copy email'}
                            aria-label={`Copy ${email}`}
                          >
                            {copiedEmail === email ? (
                              <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </Button>

                          {/* Edit */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(email, record.status)}
                            disabled={isSubmitting}
                            className="size-7 p-0 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Edit email"
                            aria-label={`Edit ${email}`}
                          >
                            <Edit2 size={12} />
                          </Button>

                          {/* Delete */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingEmail(email)}
                            disabled={isSubmitting}
                            className="size-7 p-0 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                            title="Delete email"
                            aria-label={`Delete ${email}`}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>

                      {/* Resend Bounced Notice */}
                      {record.resend_status === 'bounced' && record.bounce_reason && (
                        <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 text-[11px] text-rose-700 dark:text-rose-300">
                          <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-500" />
                          <div className="min-w-0 flex-1 leading-snug">
                            <span className="font-semibold">Bounced in Resend: </span>
                            <span className="text-rose-600 dark:text-rose-400">{record.bounce_reason}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Add New Email Section ── */}
          <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <Plus size={13} />
              <span>Add Business Email</span>
            </div>

            <form onSubmit={handleAddEmail} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. founder@domain.ai, team@domain.com"
                  className="h-9 text-xs pl-8 font-mono bg-white dark:bg-zinc-900"
                  disabled={isSubmitting && actionTarget === 'add'}
                />
                <Mail
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={newEmailStatus}
                  onChange={(e) => setNewEmailStatus(e.target.value as EmailDeliverabilityStatus)}
                  disabled={isSubmitting && actionTarget === 'add'}
                  className="h-9 text-xs px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium cursor-pointer"
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
                  className="h-9 text-xs px-4 font-semibold gap-1.5 shadow-xs"
                >
                  {isSubmitting && actionTarget === 'add' ? (
                    <Spinner size={12} />
                  ) : (
                    <Plus size={13} />
                  )}
                  Add Email
                </Button>
              </div>
            </form>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 pl-0.5">
              <Info size={11} className="shrink-0" />
              <span>Addresses are automatically normalized to lowercase and trimmed.</span>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">
            Changes are saved to the database immediately.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs px-4 border-zinc-200 dark:border-zinc-800"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
