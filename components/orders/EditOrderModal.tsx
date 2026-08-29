'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  RotateCcw,
  DollarSign,
  CreditCard,
  AlertCircle,
  Layers,
  Lock,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Order, formatPlanLabel } from '@/components/orders/OrderDetailsModal';
import { supabase } from '@/lib/supabase';
import { updateOrderAction } from '@/app/admin/submissions/orders/actions';

interface EditOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updatedOrder: Order) => void;
  onRefund?: (order: Order) => void;
}

export default function EditOrderModal({
  order,
  isOpen,
  onClose,
  onSaveSuccess,
  onRefund,
}: EditOrderModalProps) {
  const [status, setStatus] = useState<string>('pending');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state whenever active order changes
  useEffect(() => {
    if (order) {
      setStatus(order.status || 'pending');
      setAdminNotes(order.metadata?.admin_notes || '');
      setErrorMessage(null);
      setCopiedField(null);
    }
  }, [order]);

  if (!order) return null;

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const currentStatus = (order.status || 'pending').toLowerCase();

  // Determine state machine transition rules based on current order status
  const isRefunded = currentStatus === 'refunded';
  const isCancelled = currentStatus === 'cancelled';
  const isFailed = currentStatus === 'failed';
  const isCompleted = currentStatus === 'completed' || currentStatus === 'paid' || currentStatus === 'succeeded';
  const isPending = currentStatus === 'pending';
  const isProcessing = currentStatus === 'processing';

  // Terminal states cannot be transitioned to anything else
  const isTerminalState = isRefunded || isCancelled || isFailed;

  // Build allowable target status options for the select dropdown
  let statusOptions: { value: string; label: string }[] = [];
  let isStatusSelectDisabled = false;

  if (isTerminalState) {
    isStatusSelectDisabled = true;
    if (isRefunded) {
      statusOptions = [{ value: 'refunded', label: 'Refunded (Finalized)' }];
    } else if (isCancelled) {
      statusOptions = [{ value: 'cancelled', label: 'Cancelled (Finalized)' }];
    } else if (isFailed) {
      statusOptions = [{ value: 'failed', label: 'Failed (Finalized)' }];
    }
  } else if (isCompleted) {
    // Completed orders are active & paid. Arbitrary status change to pending/cancelled is blocked.
    // Transition to refunded must be handled via the verified Dodo refund flow.
    isStatusSelectDisabled = true;
    statusOptions = [{ value: 'completed', label: 'Completed (Paid & Active)' }];
  } else if (isPending) {
    statusOptions = [
      { value: 'pending', label: 'Pending (Awaiting Payment)' },
      { value: 'completed', label: 'Completed (Mark as Paid & Verified)' },
      { value: 'cancelled', label: 'Cancelled (Void Order)' },
      { value: 'failed', label: 'Failed (Payment Declined)' },
    ];
  } else if (isProcessing) {
    statusOptions = [
      { value: 'processing', label: 'Processing (Fulfilling)' },
      { value: 'completed', label: 'Completed (Fulfillment Done)' },
      { value: 'cancelled', label: 'Cancelled (Void Order)' },
      { value: 'failed', label: 'Failed (Declined)' },
    ];
  } else {
    // Fallback for any non-standard status
    statusOptions = [
      { value: currentStatus, label: currentStatus.toUpperCase() },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ];
  }

  const isPaidOrder =
    Number(order.amount_usd) > 0 &&
    !order.plan_id?.toLowerCase().startsWith('free_') &&
    (order as any).is_paid !== false;

  const totalPaid = (
    Number(order.amount_usd || 0) + (order.tax_amount ? Number(order.tax_amount) : 0)
  ).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    // Check if anything actually changed
    const hasStatusChanged = status !== order.status;
    const existingNotes = (order.metadata?.admin_notes || '').trim();
    const newNotes = adminNotes.trim();
    const hasNotesChanged = existingNotes !== newNotes;

    if (!hasStatusChanged && !hasNotesChanged) {
      onClose();
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const nowIso = new Date().toISOString();

      // Retrieve current admin session for audit trail
      let adminEmail = 'admin';
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        adminEmail = sessionData?.session?.user?.email || 'admin';
      } catch {}

      // Maintain structured status history in metadata
      const prevHistory = Array.isArray(order.metadata?.status_history)
        ? order.metadata.status_history
        : [];

      const newHistory = hasStatusChanged
        ? [
            ...prevHistory,
            {
              from_status: order.status,
              to_status: status,
              changed_by: adminEmail,
              changed_at: nowIso,
              notes: newNotes || undefined,
            },
          ]
        : prevHistory;

      const updatedMetadata = {
        ...(order.metadata || {}),
        admin_notes: newNotes || undefined,
        last_edited_by_admin: adminEmail,
        last_edited_by_admin_at: nowIso,
        status_history: newHistory.length > 0 ? newHistory : undefined,
      };

      // SECURE & OPTIMIZED: Update only status, metadata, and updated_at.
      // Immutable financial & gateway ledger fields are never overwritten.
      const payload = {
        status,
        metadata: updatedMetadata,
        updated_at: nowIso,
      };

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) {
        throw new Error('Authentication required. Please refresh and try again.');
      }

      const res = await updateOrderAction(order.id, payload, token);
      if (!res.success) {
        throw new Error(res.error || 'Failed to update order.');
      }

      const mergedOrder: Order = {
        ...order,
        ...(res.data || payload),
        submitter: order.submitter,
      };

      onSaveSuccess(mergedOrder);
      onClose();
    } catch (err: any) {
      console.error('Error updating order:', err);
      setErrorMessage(err?.message || 'Failed to update order. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toolName =
    order.metadata?.tool_name ||
    order.metadata?.tool_url ||
    order.metadata?.title ||
    'Tool Submission';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh] overflow-hidden">
          {/* Fixed Header */}
          <div className="p-6 pb-4 border-b border-[var(--border-color)]/60 pr-14 shrink-0 bg-[var(--bg-surface)]">
            <DialogHeader className="text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                    #{order.order_number}
                  </span>
                  <Badge variant="slate" className="font-semibold text-[10px]">
                    {formatPlanLabel(order.plan_id)}
                  </Badge>
                </div>
                <span className="text-xs text-[var(--text-muted)] font-medium truncate max-w-[220px]">
                  Target: <strong className="text-[var(--text-primary)]">{toolName}</strong>
                </span>
              </div>
              <DialogTitle className="text-base font-bold text-[var(--text-primary)] mt-2">
                Edit Order & Status
              </DialogTitle>
              <DialogDescription className="text-xs">
                Manage order status transitions and maintain internal operational audit notes.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 py-4 space-y-5">
            {errorMessage && (
              <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Status Transition State Machine Card */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <Layers className="h-4 w-4 text-zinc-500" />
                  Order Status Transition
                </div>
                {isTerminalState && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-bold border-zinc-300 dark:border-zinc-700 bg-[var(--bg-elevated)]">
                    <Lock className="h-2.5 w-2.5" />
                    Finalized / Locked State
                  </Badge>
                )}
                {isCompleted && (
                  <Badge variant="success" className="gap-1 text-[10px] font-bold">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Active & Fulfilled
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-1">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Order Status
                  </label>
                  <Select
                    value={status}
                    onChange={(val) => setStatus(val)}
                    options={statusOptions}
                    disabled={isStatusSelectDisabled || isSaving}
                    className="h-10 text-xs font-semibold"
                  />
                  {isStatusSelectDisabled && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                      <Lock className="h-3 w-3 shrink-0" />
                      Status changes are locked for this state.
                    </p>
                  )}
                </div>

                {/* Status Guidance / Explanatory Alert */}
                <div className="text-xs p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/50 space-y-1.5">
                  {isRefunded && (
                    <div className="text-rose-600 dark:text-rose-400 font-medium space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Refund Finalized
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        This order was refunded. Per accounting standards, refunded transactions cannot be reopened.
                      </p>
                    </div>
                  )}

                  {isCancelled && (
                    <div className="text-zinc-600 dark:text-zinc-400 font-medium space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <XCircle className="h-3.5 w-3.5" />
                        Order Cancelled
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        This order was voided prior to payment capture. Cancelled records are finalized.
                      </p>
                    </div>
                  )}

                  {isFailed && (
                    <div className="text-rose-600 dark:text-rose-400 font-medium space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Payment Failed
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        The customer payment was declined. The customer should submit a fresh checkout.
                      </p>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-medium space-y-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Payment Verified & Active
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        Entitlements are active. To issue a refund and automatically revoke access, use the dedicated refund workflow.
                      </p>
                      {onRefund && Boolean(order.dodo_payment_id) && isPaidOrder && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onClose();
                            onRefund(order);
                          }}
                          className="w-full h-7 text-[11px] font-bold text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-1 cursor-pointer mt-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Issue Refund via Dodo Payments
                        </Button>
                      )}
                    </div>
                  )}

                  {isPending && (
                    <div className="text-amber-600 dark:text-amber-400 font-medium space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Clock className="h-3.5 w-3.5" />
                        Awaiting Payment
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        Select <strong>Completed</strong> if manual offline payment was verified, or <strong>Cancelled</strong> if abandoned.
                      </p>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="text-blue-600 dark:text-blue-400 font-medium space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Clock className="h-3.5 w-3.5" />
                        In Processing
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        Select <strong>Completed</strong> once manual deliverable / review is fulfilled.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Read-Only Financial Ledger & Transaction Details */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <DollarSign className="h-4 w-4 text-zinc-500" />
                  Financial & Transaction Summary (Immutable)
                </div>
                <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 font-medium">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Ledger Protected
                </span>
              </div>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-[var(--bg-elevated)]/60 p-2.5 rounded-lg border border-[var(--border-color)]/50">
                  <div className="text-[10px] text-[var(--text-muted)] font-medium">Subtotal</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    ${Number(order.amount_usd || 0).toFixed(2)}
                  </div>
                </div>

                <div className="bg-[var(--bg-elevated)]/60 p-2.5 rounded-lg border border-[var(--border-color)]/50">
                  <div className="text-[10px] text-[var(--text-muted)] font-medium">Tax Amount</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {order.tax_amount != null && Number(order.tax_amount) > 0
                      ? `$${Number(order.tax_amount).toFixed(2)}`
                      : '$0.00'}
                  </div>
                </div>

                <div className="bg-[var(--bg-elevated)]/60 p-2.5 rounded-lg border border-[var(--border-color)]/50">
                  <div className="text-[10px] text-[var(--text-muted)] font-medium">Currency</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {order.currency || 'USD'}
                  </div>
                </div>

                <div className="bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">
                    Total Paid
                  </div>
                  <div className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    ${totalPaid}
                  </div>
                </div>
              </div>

              {/* Payment & Location Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]/40 border border-[var(--border-color)]/40 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Payment Method & Region
                  </div>
                  <div className="font-semibold text-[var(--text-primary)] capitalize">
                    {order.payment_method || 'Online Payment'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Billing Country: {order.billing_country || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]/40 border border-[var(--border-color)]/40 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Payment Reference
                  </div>
                  {order.dodo_payment_id ? (
                    <div className="flex items-center justify-between gap-1 font-mono text-[11px] text-[var(--text-primary)]">
                      <span className="truncate">{order.dodo_payment_id}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.dodo_payment_id!, 'payment_id')}
                        className="p-1 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                        title="Copy Payment ID"
                        aria-label="Copy Payment Reference ID"
                      >
                        {copiedField === 'payment_id' ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">No reference ID</span>
                  )}
                  {order.user_id && (
                    <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                      User: {order.submitter?.email || order.user_id}
                    </div>
                  )}
                </div>
              </div>

              {/* Invoices and Receipts */}
              {(order.invoice_url || order.receipt_url) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {order.invoice_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-7 text-xs font-semibold gap-1.5 border-zinc-200 dark:border-zinc-700"
                    >
                      <a
                        href={order.invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="h-3 w-3" />
                        View Invoice
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    </Button>
                  )}

                  {order.receipt_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-7 text-xs font-semibold gap-1.5 border-zinc-200 dark:border-zinc-700"
                    >
                      <a
                        href={order.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="h-3 w-3" />
                        View Receipt
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Refund Information Banner (if refunded) */}
            {isRefunded && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 dark:bg-rose-500/10 p-3.5 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Refund Record
                  </div>
                  {order.refund_amount != null && (
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      -${Number(order.refund_amount).toFixed(2)} USD
                    </span>
                  )}
                </div>

                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  {order.refund_reason && (
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">Reason: </span>
                      <span>{order.refund_reason}</span>
                    </div>
                  )}
                  {order.refund_id && (
                    <div className="font-mono text-[11px] text-[var(--text-muted)]">
                      Refund Ref: {order.refund_id}
                    </div>
                  )}
                  {order.refunded_at && (
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Processed: {new Date(order.refunded_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Admin Notes Section (Fully Editable) */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Internal Admin Notes
                </label>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Visible to admins only
                </span>
              </div>
              <Textarea
                placeholder="Optional internal notes for tracking customer requests, verification rationale, manual fulfillment, or support tickets..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                disabled={isSaving}
                className="text-xs min-h-[85px] resize-y"
              />
              {order.metadata?.last_edited_by_admin_at && (
                <p className="text-[10px] text-[var(--text-muted)] pt-0.5">
                  Last updated by {order.metadata?.last_edited_by_admin || 'admin'} on{' '}
                  {new Date(order.metadata.last_edited_by_admin_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="p-6 pt-4 border-t border-[var(--border-color)]/60 shrink-0 bg-[var(--bg-surface)]">
            <DialogFooter className="flex items-center justify-end gap-3 p-0 m-0 border-none">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={onClose}
                className="border-zinc-200 dark:border-zinc-700 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs min-w-[120px] cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Spinner size={14} className="mr-1.5" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
