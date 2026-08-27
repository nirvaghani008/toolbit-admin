'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Check,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Order, formatPlanLabel } from './OrderDetailsModal';

interface RefundOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onRefundSuccess: (updatedOrder: Order) => void;
}

const COMMON_REASONS = [
  { value: 'customer_request', label: 'Customer Requested Refund' },
  { value: 'submission_rejected', label: 'Tool Submission / Post Rejected' },
  { value: 'accidental_duplicate', label: 'Duplicate Transaction' },
  { value: 'technical_delivery_issue', label: 'Deliverable Not Provided / Issue' },
  { value: 'fraudulent_or_unauthorized', label: 'Suspected Fraud / Unauthorized' },
  { value: 'other', label: 'Other (Specify Below)' },
];

export default function RefundOrderModal({
  order,
  isOpen,
  onClose,
  onRefundSuccess,
}: RefundOrderModalProps) {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [partialError, setPartialError] = useState<string | null>(null);
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>(COMMON_REASONS[0].value);
  const [customReason, setCustomReason] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [prevOrderId, setPrevOrderId] = useState<string | null>(null);

  if (order && order.id !== prevOrderId) {
    setPrevOrderId(order.id);
    setRefundType('full');
    setPartialAmount('');
    setPartialError(null);
    setSelectedReasonOption(COMMON_REASONS[0].value);
    setCustomReason('');
    setReasonError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  const totalPaid = Number(order?.amount_usd || 0);
  const planType = String(order?.plan_id || '').toLowerCase();
  const itemName =
    order?.metadata?.tool_name ||
    order?.metadata?.title ||
    order?.metadata?.tool_url ||
    order?.metadata?.tool_site_url ||
    'Submission';

  // Contextual item label based on plan type
  let contextualItemLabel = 'Tool Name';
  if (planType.includes('guest_post') || planType.includes('blog')) {
    contextualItemLabel = 'Article / Blog Post Title';
  } else if (planType.includes('advertise')) {
    contextualItemLabel = 'Advertisement Tool';
  } else if (planType.includes('update')) {
    contextualItemLabel = 'Tool Name (Update)';
  }

  // Calculate order age (Dodo Payments recommends refunding within 30 days)
  const [currentTimestamp] = useState(() => Date.now());
  const orderCreatedAt = order ? new Date(order.created_at).getTime() : 0;
  const daysSinceOrder = Math.floor((currentTimestamp - orderCreatedAt) / (1000 * 60 * 60 * 24));
  const isOlderThan30Days = daysSinceOrder > 30;

  if (!order) return null;

  const handlePartialAmountChange = (val: string) => {
    setPartialAmount(val);
    if (!val.trim()) {
      setPartialError('Partial refund amount is required.');
      return;
    }
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed <= 0) {
      setPartialError('Partial amount must be greater than $0.00.');
    } else if (parsed >= totalPaid) {
      setPartialError(
        `Partial refund must be strictly less than $${totalPaid.toFixed(2)}. For the full amount, please select Full Refund.`
      );
    } else {
      setPartialError(null);
    }
  };

  const handleReasonOptionChange = (val: string) => {
    setSelectedReasonOption(val);
    setReasonError(null);
  };

  const handleProcessRefund = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    let amountToRefund: number | null = null;

    // 1. Client-side Partial refund validation (return immediately, no API call)
    if (refundType === 'partial') {
      if (!partialAmount || !partialAmount.trim()) {
        setPartialError('Please enter a partial refund amount.');
        return;
      }
      const parsed = parseFloat(partialAmount);
      if (isNaN(parsed) || parsed <= 0) {
        setPartialError('Partial amount must be greater than $0.00.');
        return;
      }
      if (parsed >= totalPaid) {
        setPartialError(
          `Partial refund must be strictly less than the total paid amount ($${totalPaid.toFixed(2)}). Use Full Refund instead.`
        );
        return;
      }
      amountToRefund = parsed;
    }

    // 2. Client-side Custom reason validation when 'other' is selected (return immediately, no API call)
    if (selectedReasonOption === 'other' && !customReason.trim()) {
      setReasonError('Please specify the custom reason for this refund.');
      return;
    }

    if (!order.dodo_payment_id) {
      setErrorMessage('No Dodo payment ID is attached to this order. It cannot be refunded via the payment provider.');
      return;
    }

    // Only set processing to true after validation succeeds
    setIsProcessing(true);

    try {
      const effectiveReason =
        selectedReasonOption === 'other'
          ? customReason.trim()
          : customReason.trim()
            ? `${selectedReasonOption}: ${customReason.trim()}`
            : selectedReasonOption;

      // 3. Get current session token for admin authentication
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      // 4. Call backend refund API
      const res = await fetch('/api/orders/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: order.id,
          amount: amountToRefund,
          reason: effectiveReason,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to process refund. Please try again.');
      }

      setSuccessMessage(`Refund of $${(amountToRefund ?? totalPaid).toFixed(2)} processed successfully via Dodo Payments.`);

      const updatedOrder: Order = {
        ...order,
        status: 'refunded',
        refund_id: result.refundId || order.refund_id,
        refund_amount: result.refundAmount ?? amountToRefund ?? totalPaid,
        refund_reason: effectiveReason,
        refunded_at: result.refundedAt || new Date().toISOString(),
      };

      setTimeout(() => {
        onRefundSuccess(updatedOrder);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error processing refund:', err);
      setErrorMessage(err?.message || 'An unexpected error occurred while processing the refund.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isProcessing && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6">
        {/* Header with Amber Theme */}
        <DialogHeader className="border-b border-[var(--border-color)]/60 pb-4 text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-[var(--text-primary)]">
                Issue Refund via Dodo Payments
              </DialogTitle>
              <DialogDescription className="text-xs">
                Order #{order.order_number}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Order Snapshot Card */}
          <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-elevated)]/40 p-3.5 space-y-2.5 text-xs">
            {/* Plan Displayed First */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)] font-medium">Plan</span>
              <span className="font-bold text-[var(--text-primary)] px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)]">
                {formatPlanLabel(order.plan_id)}
              </span>
            </div>

            {/* Contextual Item Name */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)] font-medium">{contextualItemLabel}</span>
              <span className="font-semibold text-[var(--text-primary)] truncate max-w-[240px]">
                {itemName}
              </span>
            </div>

            {/* Customer Details */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)] font-medium">Customer</span>
              <span className="text-[var(--text-secondary)] truncate max-w-[240px]">
                {order.submitter?.full_name || 'Customer'}{' '}
                {order.submitter?.email ? `(${order.submitter.email})` : ''}
              </span>
            </div>

            {/* Payment Reference */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)] font-medium">Payment Reference</span>
              <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                {order.dodo_payment_id || 'N/A'}
              </span>
            </div>

            {/* Total Paid */}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/50">
              <span className="font-bold text-[var(--text-primary)]">Total Paid</span>
              <span className="font-extrabold text-sm text-[var(--text-primary)]">
                ${totalPaid.toFixed(2)} {order.currency || 'USD'}
              </span>
            </div>
          </div>

          {/* 30-Day Age Warning */}
          {isOlderThan30Days && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <span className="font-bold">Transaction is {daysSinceOrder} days old.</span> Dodo Payments typically enforces a 30-day window for refunds. If processing fails, you may need to issue the refund directly in your payment processor portal.
              </div>
            </div>
          )}

          {/* Refund Type Selection (Neutral with top-right check badge) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
              Refund Amount <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Full Refund Option */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setRefundType('full');
                  setPartialError(null);
                }}
                className={`relative p-3.5 rounded-xl border text-left transition-all ${isProcessing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${refundType === 'full'
                  ? 'border-zinc-400 dark:border-zinc-600 bg-zinc-100/90 dark:bg-zinc-800/90 shadow-2xs ring-1 ring-zinc-400/30 dark:ring-zinc-600/30'
                  : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/70 text-[var(--text-secondary)]'
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">Full Refund</div>
                    <div className="text-sm font-extrabold text-[var(--text-primary)] mt-1">
                      ${totalPaid.toFixed(2)}
                    </div>
                  </div>
                  {refundType === 'full' ? (
                    <div className="w-4 h-4 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shadow-2xs">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-[var(--border-color)]" />
                  )}
                </div>
              </button>

              {/* Partial Refund Option */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setRefundType('partial');
                  if (!partialAmount) setPartialAmount('');
                }}
                className={`relative p-3.5 rounded-xl border text-left transition-all ${isProcessing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${refundType === 'partial'
                  ? 'border-zinc-400 dark:border-zinc-600 bg-zinc-100/90 dark:bg-zinc-800/90 shadow-2xs ring-1 ring-zinc-400/30 dark:ring-zinc-600/30'
                  : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/70 text-[var(--text-secondary)]'
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">Partial Refund</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">Custom amount</div>
                  </div>
                  {refundType === 'partial' ? (
                    <div className="w-4 h-4 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shadow-2xs">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-[var(--border-color)]" />
                  )}
                </div>
              </button>
            </div>

            {/* Partial Amount Input with Real-time Validation */}
            {refundType === 'partial' && (
              <div className="pt-2 animate-fade-in space-y-1">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                  Partial Amount ($ USD) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={totalPaid - 0.01}
                    placeholder="0.00"
                    disabled={isProcessing}
                    value={partialAmount}
                    onChange={(e) => handlePartialAmountChange(e.target.value)}
                    className={`pl-8 text-sm h-9 ${partialError ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                  />
                </div>
                {partialError ? (
                  <p className="text-[11px] text-rose-500 font-medium animate-fade-in flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {partialError}
                  </p>
                ) : (
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    Must be strictly less than the total paid amount (${totalPaid.toFixed(2)}). Use Full Refund to refund 100%.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Refund Reason with Asterisk & Custom Validation */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
              Reason for Refund <span className="text-rose-500">*</span>
            </label>
            <Select
              value={selectedReasonOption}
              onChange={(val) => handleReasonOptionChange(val)}
              options={COMMON_REASONS}
              disabled={isProcessing}
              className="text-xs h-10"
            />

            {/* Custom Reason Field: Required when 'other' is selected */}
            {selectedReasonOption === 'other' ? (
              <div className="pt-1 animate-fade-in space-y-1">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                  Custom Reason Details <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  placeholder="Specify the reason for this refund (required)..."
                  value={customReason}
                  disabled={isProcessing}
                  onChange={(e) => {
                    setCustomReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(null);
                  }}
                  rows={2}
                  className={`text-xs resize-none ${reasonError ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                />
                {reasonError && (
                  <p className="text-[11px] text-rose-500 font-medium animate-fade-in flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {reasonError}
                  </p>
                )}
              </div>
            ) : (
              <div className="pt-1">
                <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">
                  Optional Notes (for internal records)
                </label>
                <Textarea
                  placeholder="Additional notes for customer or internal audit..."
                  value={customReason}
                  disabled={isProcessing}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            )}
          </div>

          {/* Automated Entitlement Revocation Notice (Neutral White / Charcoal) */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60 p-3.5 space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
              <ShieldAlert className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              Automated Entitlement Revocation
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {/* Advertisements */}
              {planType.includes('advertise') && (
                <>
                  <li>The advertisement in <span className="font-semibold text-zinc-900 dark:text-zinc-100">advertisement_tools</span> will be set to <span className="font-semibold text-zinc-900 dark:text-zinc-100">inactive</span> immediately, stop running on Homepage, Sidebar, and Banner.</li>
                  <li>Pending manual deliverables (Social Media X post, Newsletter mention) will be cancelled.</li>
                </>
              )}

              {/* Guest Posts */}
              {planType.includes('guest_post') && (
                <>
                  <li>The article in <span className="font-semibold text-zinc-900 dark:text-zinc-100">blog_posts</span> will be reverted to <span className="font-semibold text-zinc-900 dark:text-zinc-100">draft</span> and unlisted from the public blog.</li>
                  <li>Pending manual deliverables (Social Media X share, Newsletter mention) will be cancelled.</li>
                </>
              )}

              {/* Launch Tool (Includes 1-Day Sidebar Ad) */}
              {planType.includes('launch_tool') && (
                <>
                  <li>The submission tier in <span className="font-semibold text-zinc-900 dark:text-zinc-100">ai_tool_submissions</span> will revert to <span className="font-semibold text-zinc-900 dark:text-zinc-100">free_launch_tool</span> (<code className="text-[10px] text-zinc-700 dark:text-zinc-300 font-mono">is_paid = false</code>).</li>
                  <li>The complimentary 1-day sidebar ad in <span className="font-semibold text-zinc-900 dark:text-zinc-100">advertisement_tools</span> will be deactivated.</li>
                  {/* <li>Expedited 24-hour review priority and blue verified badge will be removed.</li> */}
                </>
              )}

              {/* Update Tool (NO Sidebar Ad Attached) */}
              {planType.includes('update_tool') && (
                <>
                  <li>The tool update tier in <span className="font-semibold text-zinc-900 dark:text-zinc-100">ai_tool_submissions</span> will revert to <span className="font-semibold text-zinc-900 dark:text-zinc-100">free_update_tool</span> (<code className="text-[10px] text-zinc-700 dark:text-zinc-300 font-mono">is_paid = false</code>).</li>
                  {/* <li>Expedited 24-hour review priority and blue verified badge will be removed. <em>(Note: No sidebar ad was attached to update plans)</em>.</li> */}
                </>
              )}

              <li>An audit log will be appended and a refund event notification will be dispatched to Telegram.</li>
            </ul>
          </div>

          {/* General Error Banner */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div>{successMessage}</div>
            </div>
          )}
        </div>

        {/* Footer with Amber Themed Action Button */}
        <DialogFooter className="flex items-center justify-between gap-2 border-t border-[var(--border-color)]/60 pt-4 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isProcessing}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleProcessRefund}
            disabled={isProcessing || Boolean(successMessage) || Boolean(partialError) || Boolean(reasonError)}
            className="gap-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
          >
            {isProcessing ? (
              <>
                <Spinner size={14} className="text-white" />
                Contacting Dodo Payments...
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Confirm & Issue Refund
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
