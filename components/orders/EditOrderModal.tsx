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
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import { Order, formatPlanLabel } from '@/components/orders/OrderDetailsModal';
import { supabase } from '@/lib/supabase';

interface EditOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updatedOrder: Order) => void;
}

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function EditOrderModal({
  order,
  isOpen,
  onClose,
  onSaveSuccess,
}: EditOrderModalProps) {
  const [status, setStatus] = useState<string>('pending');
  const [amountUsd, setAmountUsd] = useState<string>('');
  const [taxAmount, setTaxAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [billingCountry, setBillingCountry] = useState<string>('');
  const [invoiceUrl, setInvoiceUrl] = useState<string>('');
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  
  // Refund fields
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundId, setRefundId] = useState<string>('');
  const [refundedAt, setRefundedAt] = useState<string>('');
  
  // Admin Notes
  const [adminNotes, setAdminNotes] = useState<string>('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state whenever order changes
  useEffect(() => {
    if (order) {
      setStatus(order.status || 'pending');
      setAmountUsd(order.amount_usd != null ? String(order.amount_usd) : '0');
      setTaxAmount(order.tax_amount != null ? String(order.tax_amount) : '');
      setCurrency(order.currency || 'USD');
      setPaymentMethod(order.payment_method || '');
      setBillingCountry(order.billing_country || '');
      setInvoiceUrl(order.invoice_url || '');
      setReceiptUrl(order.receipt_url || '');
      
      setRefundAmount(order.refund_amount != null ? String(order.refund_amount) : '');
      setRefundReason(order.refund_reason || '');
      setRefundId(order.refund_id || '');
      setRefundedAt(
        order.refunded_at
          ? new Date(order.refunded_at).toISOString().slice(0, 16)
          : ''
      );
      setAdminNotes(order.metadata?.admin_notes || '');
      setErrorMessage(null);
    }
  }, [order]);

  if (!order) return null;

  // Automatically suggest refund defaults when status is switched to refunded
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    if (newStatus === 'refunded') {
      if (!refundAmount || Number(refundAmount) === 0) {
        setRefundAmount(amountUsd || String(order.amount_usd || '0'));
      }
      if (!refundedAt) {
        setRefundedAt(new Date().toISOString().slice(0, 16));
      }
    }
  };

  const handleSetFullRefund = () => {
    setRefundAmount(amountUsd || String(order.amount_usd || '0'));
    if (!refundedAt) {
      setRefundedAt(new Date().toISOString().slice(0, 16));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const parsedAmount = parseFloat(amountUsd);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error('Please enter a valid amount.');
      }

      const parsedTax = taxAmount ? parseFloat(taxAmount) : null;
      if (taxAmount && (isNaN(parsedTax!) || parsedTax! < 0)) {
        throw new Error('Please enter a valid tax amount.');
      }

      let parsedRefundAmount: number | null = null;
      if (status === 'refunded' || refundAmount) {
        parsedRefundAmount = refundAmount ? parseFloat(refundAmount) : parsedAmount;
        if (isNaN(parsedRefundAmount) || parsedRefundAmount < 0) {
          throw new Error('Please enter a valid refund amount.');
        }
      }

      let formattedRefundedAt: string | null = null;
      if (refundedAt) {
        formattedRefundedAt = new Date(refundedAt).toISOString();
      } else if (status === 'refunded') {
        formattedRefundedAt = new Date().toISOString();
      }

      const updatedMetadata = {
        ...(order.metadata || {}),
        admin_notes: adminNotes.trim() || undefined,
        last_edited_by_admin_at: new Date().toISOString(),
      };

      const payload = {
        status,
        amount_usd: parsedAmount,
        tax_amount: parsedTax,
        currency: currency.trim().toUpperCase() || 'USD',
        payment_method: paymentMethod.trim() || null,
        billing_country: billingCountry.trim().toUpperCase() || null,
        invoice_url: invoiceUrl.trim() || null,
        receipt_url: receiptUrl.trim() || null,
        refund_amount: parsedRefundAmount,
        refund_reason: refundReason.trim() || null,
        refund_id: refundId.trim() || null,
        refunded_at: formattedRefundedAt,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', order.id)
        .select()
        .single();

      if (error) throw error;

      const mergedOrder: Order = {
        ...order,
        ...(data || payload),
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-[var(--border-color)]/60 pb-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                  {order.order_number}
                </span>
                <Badge variant="slate" className="font-semibold text-[10px]">
                  {formatPlanLabel(order.plan_id)}
                </Badge>
              </div>
              <span className="text-xs text-[var(--text-muted)] font-medium truncate max-w-[200px]">
                Target: <strong className="text-[var(--text-primary)]">{toolName}</strong>
              </span>
            </div>
            <DialogTitle className="text-base font-bold text-[var(--text-primary)] mt-2">
              Edit Order Details
            </DialogTitle>
            <DialogDescription>
              Update the order status, record refunds, or adjust financial and billing information.
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-6 py-5">
            {/* Status Section */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                <Layers className="h-4 w-4 text-zinc-500" />
                Order Status
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                    Current Status
                  </label>
                  <Select
                    value={status}
                    onChange={(val) => handleStatusChange(val)}
                    options={STATUS_OPTIONS}
                    className="h-10 text-xs font-semibold"
                  />
                </div>
                <div className="text-xs text-[var(--text-muted)] p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/50">
                  {status === 'completed' && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Order is marked as completed/paid and active.
                    </span>
                  )}
                  {status === 'pending' && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Order payment or verification is pending.
                    </span>
                  )}
                  {status === 'refunded' && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      Order is refunded. Please ensure refund details below are filled.
                    </span>
                  )}
                  {status === 'failed' && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      Order payment failed or was declined.
                    </span>
                  )}
                  {status === 'cancelled' && (
                    <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                      Order was cancelled prior to fulfillment.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Refund Section */}
            <div
              className={`rounded-xl border p-4 transition-all duration-200 ${
                status === 'refunded'
                  ? 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10'
                  : 'border-[var(--border-color)]/80 bg-[var(--bg-surface)]'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  <RotateCcw className="h-4 w-4" />
                  Refund Information
                </div>
                {status === 'refunded' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSetFullRefund}
                    className="h-7 px-2.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    Set Full Refund (${Number(amountUsd || order.amount_usd || 0).toFixed(2)})
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Refund Amount ($ USD)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Refund Reference / ID
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. ref_12345 or Dodo refund ID"
                    value={refundId}
                    onChange={(e) => setRefundId(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Refund Reason
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Customer request, duplicate charge, dissatisfied"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Refunded Date & Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={refundedAt}
                    onChange={(e) => setRefundedAt(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Financial Details */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                <DollarSign className="h-4 w-4 text-zinc-500" />
                Financials
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Amount ($ USD) *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    className="h-9 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Tax Amount ($ USD)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Currency
                  </label>
                  <Input
                    type="text"
                    maxLength={5}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className="h-9 text-xs font-semibold uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Payment & Billing */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                <CreditCard className="h-4 w-4 text-zinc-500" />
                Payment & Billing Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Payment Method
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Card, Online, Manual, Free"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Billing Country Code
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. US, IN, GB"
                    maxLength={3}
                    value={billingCountry}
                    onChange={(e) => setBillingCountry(e.target.value.toUpperCase())}
                    className="h-9 text-xs uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Invoice URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={invoiceUrl}
                    onChange={(e) => setInvoiceUrl(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Receipt URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Admin Notes */}
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-2">
              <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Internal Admin Notes
              </label>
              <Textarea
                placeholder="Optional internal notes for tracking customer requests, status decisions, or billing adjustments..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="text-xs min-h-[70px]"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-3 border-t border-[var(--border-color)]/60 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={onClose}
              className="border-zinc-200 dark:border-zinc-700"
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
