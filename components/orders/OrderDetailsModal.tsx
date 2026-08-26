'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ExternalLink,
  User,
  CreditCard,
  DollarSign,
  Globe,
  FileText,
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  Database,
} from 'lucide-react';

export interface Submitter {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  plan_id: string;
  amount_usd: number;
  status: string;
  payment_method: string | null;
  dodo_payment_id: string | null;
  currency: string | null;
  billing_country: string | null;
  tax_amount: number | null;
  invoice_url: string | null;
  receipt_url: string | null;
  refund_id: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  refunded_at: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
  submitter?: Submitter | null;
}

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export function formatPlanLabel(planId: string): string {
  if (!planId) return '—';
  const p = planId.toLowerCase();

  if (p.includes('update')) return 'Tool Update';
  if (p.includes('launch')) return 'Tool Launch';
  if (p.includes('guest_post')) {
    return p.includes('free') ? 'Free Guest Post' : 'Guest Post';
  }
  if (p.includes('advertise')) {
    const match = p.match(/advertise_(\d+)/);
    const days = match ? match[1] : '';
    return days ? `Advertise (${days} Days)` : 'Advertise';
  }

  return planId.replace(/_/g, ' ');
}

export function getStatusBadge(status: string) {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'completed':
    case 'succeeded':
    case 'paid':
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {status}
        </Badge>
      );
    case 'pending':
    case 'processing':
      return (
        <Badge variant="warning" className="gap-1">
          <Clock className="h-3 w-3" />
          {status}
        </Badge>
      );
    case 'failed':
    case 'cancelled':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          {status}
        </Badge>
      );
    case 'refunded':
      return (
        <Badge variant="slate" className="gap-1">
          <RotateCcw className="h-3 w-3" />
          {status}
        </Badge>
      );
    default:
      return (
        <Badge variant="default" className="gap-1">
          {status}
        </Badge>
      );
  }
}

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
}: OrderDetailsModalProps) {
  if (!order) return null;

  const toolName =
    order.metadata?.tool_name ||
    order.metadata?.tool_url ||
    order.metadata?.title ||
    'Tool Submission';
  const siteUrl =
    order.metadata?.tool_site_url ||
    order.metadata?.external_url ||
    order.metadata?.website_url ||
    '';

  let domain = '';
  if (siteUrl) {
    try {
      const urlObj = new URL(
        siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
      );
      domain = urlObj.hostname;
    } catch {}
  }

  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6">
        <DialogHeader className="border-b border-[var(--border-color)]/60 pb-4 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                {order.order_number}
              </span>
              <Badge variant="slate" className="font-semibold">
                {formatPlanLabel(order.plan_id)}
              </Badge>
            </div>
            {getStatusBadge(order.status)}
          </div>
          <DialogTitle className="text-base font-bold text-[var(--text-primary)] mt-2">
            Order & Transaction Details
          </DialogTitle>
          <DialogDescription>
            Created on{' '}
            {new Date(order.created_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Associated Tool Info */}
          <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-elevated)]/40 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Target Tool / Submission
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt={toolName}
                    className="w-full h-full object-contain rounded-lg"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Database className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {toolName}
                </div>
                {siteUrl ? (
                  <a
                    href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 hover:underline mt-0.5 truncate max-w-full font-medium"
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    {domain || siteUrl}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">No URL provided</span>
                )}
              </div>
            </div>
          </div>

          {/* Submitter & Billing Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <User className="h-3.5 w-3.5 text-zinc-500" />
                Submitted By
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {order.submitter?.full_name || 'Anonymous User'}
              </div>
              <div className="text-xs text-[var(--text-secondary)] font-medium truncate">
                {order.submitter?.email || 'No email attached'}
              </div>
              {order.user_id && (
                <div className="text-[10px] text-[var(--text-muted)] font-mono truncate pt-1">
                  User ID: {order.user_id}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <CreditCard className="h-3.5 w-3.5 text-zinc-500" />
                Payment Method & Location
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="capitalize">{order.payment_method || 'Online Payment'}</span>
              </div>
              <div className="text-xs text-[var(--text-secondary)] font-medium">
                Billing Country: {order.billing_country || '—'}
              </div>
              {order.dodo_payment_id && (
                <div className="text-[10px] text-[var(--text-muted)] font-mono truncate pt-1">
                  Payment Ref: {order.dodo_payment_id}
                </div>
              )}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <DollarSign className="h-3.5 w-3.5 text-zinc-500" />
              Financial Breakdown
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[var(--bg-elevated)]/50 p-2.5 rounded-lg border border-[var(--border-color)]/50">
                <div className="text-[10px] text-[var(--text-muted)] font-medium">Subtotal</div>
                <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                  ${Number(order.amount_usd).toFixed(2)}
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)]/50 p-2.5 rounded-lg border border-[var(--border-color)]/50">
                <div className="text-[10px] text-[var(--text-muted)] font-medium">Tax Amount</div>
                <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                  {order.tax_amount != null && Number(order.tax_amount) > 0
                    ? `$${Number(order.tax_amount).toFixed(2)}`
                    : '$0.00'}
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)]/50 p-2.5 rounded-lg border border-[var(--border-color)]/50">
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
                  $
                  {(
                    Number(order.amount_usd) +
                    (order.tax_amount ? Number(order.tax_amount) : 0)
                  ).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Refund Details (if refunded) */}
          {(order.refund_amount != null || order.refund_reason || order.refunded_at) && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                <RotateCcw className="h-3.5 w-3.5" />
                Refund Information
              </div>
              <div className="text-xs text-[var(--text-secondary)] space-y-1">
                {order.refund_amount != null && (
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">Amount: </span>
                    ${Number(order.refund_amount).toFixed(2)}
                  </div>
                )}
                {order.refund_reason && (
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">Reason: </span>
                    {order.refund_reason}
                  </div>
                )}
                {order.refunded_at && (
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">Refunded At: </span>
                    {new Date(order.refunded_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Metadata Attributes */}
          {order.metadata && typeof order.metadata === 'object' && Object.keys(order.metadata).length > 0 && (
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Metadata Attributes
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(order.metadata).map(([key, val]) => {
                  if (
                    typeof val === 'object' ||
                    key === 'tool_name' ||
                    key === 'tool_site_url' ||
                    key === 'title' ||
                    key === 'tool_url'
                  ) {
                    return null;
                  }
                  return (
                    <div
                      key={key}
                      className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/60 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      <span className="font-bold text-[var(--text-primary)] capitalize">
                        {key.replace(/_/g, ' ')}:
                      </span>{' '}
                      {String(val)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)]/60 pt-4 mt-2">
          <div className="flex items-center gap-2">
            {order.invoice_url && (
              <Button variant="outline" size="sm" asChild className="border-zinc-200 dark:border-zinc-700">
                <a
                  href={order.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5 text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Invoice
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {order.receipt_url && (
              <Button variant="outline" size="sm" asChild className="border-zinc-200 dark:border-zinc-700">
                <a
                  href={order.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5 text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Receipt
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-200 dark:border-zinc-700">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

