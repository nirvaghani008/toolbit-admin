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
  Copy,
  Check,
  Pencil,
} from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

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
  onEdit?: (order: Order) => void;
  onRefund?: (order: Order) => void;
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
  onEdit,
  onRefund,
}: OrderDetailsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const { hasPermission, isSuperAdmin } = useAdmin();
  const canUpdate = isSuperAdmin || hasPermission('orders', 'update') || hasPermission('submissions', 'update');

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

  const isPaidOrder =
    Number(order.amount_usd) > 0 &&
    !order.plan_id?.toLowerCase().startsWith('free_') &&
    (order as any).is_paid !== false;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <div className="p-6 pb-4 border-b border-[var(--border-color)]/60 pr-14 shrink-0 bg-[var(--bg-surface)]">
          <DialogHeader className="text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-base font-bold text-[var(--text-primary)]">
                  Order & Transaction Details
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Order #{order.order_number} details and transaction history
                </DialogDescription>
                <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 bg-[var(--bg-elevated)] px-2 py-0.5 rounded-md border border-[var(--border-color)]/60 font-mono text-xs font-bold text-[var(--text-primary)]">
                    #{order.order_number}
                    <button
                      type="button"
                      onClick={() => handleCopy(order.order_number, 'order_number')}
                      className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      title={copiedField === 'order_number' ? 'Copied!' : 'Copy Order Number'}
                      aria-label="Copy Order Number"
                    >
                      {copiedField === 'order_number' ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </span>
                  <span>•</span>
                  <Badge variant="outline" className="font-semibold text-xs border-[var(--border-color)] bg-[var(--bg-surface)]">
                    {formatPlanLabel(order.plan_id)}
                  </Badge>
                  <span>•</span>
                  <span>
                    Created on{' '}
                    {new Date(order.created_at).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
              <div className="shrink-0 pt-0.5">
                {getStatusBadge(order.status)}
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 py-4 space-y-6">
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
              <div className="text-xs text-[var(--text-secondary)] font-medium">
                {order.submitter?.email ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="truncate">{order.submitter.email}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(order.submitter!.email!, 'email')}
                      className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
                      title={copiedField === 'email' ? 'Copied!' : 'Copy Email'}
                      aria-label="Copy Email"
                    >
                      {copiedField === 'email' ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-[var(--text-muted)]">No email attached</span>
                )}
              </div>
              {order.user_id && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono truncate pt-1">
                  <span className="truncate">User ID: {order.user_id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.user_id!, 'user_id')}
                    className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
                    title={copiedField === 'user_id' ? 'Copied!' : 'Copy User ID'}
                    aria-label="Copy User ID"
                  >
                    {copiedField === 'user_id' ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
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
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-mono truncate pt-1">
                  <span className="truncate">Payment Ref: {order.dodo_payment_id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.dodo_payment_id!, 'dodo_payment_id')}
                    className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
                    title={copiedField === 'dodo_payment_id' ? 'Copied!' : 'Copy Payment Reference'}
                    aria-label="Copy Payment Reference"
                  >
                    {copiedField === 'dodo_payment_id' ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
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

          {/* Refund Details (ONLY if order status is 'refunded') */}
          {order.status === 'refunded' && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 dark:bg-amber-500/10 p-4 space-y-2 animate-fade-in">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <RotateCcw className="h-3.5 w-3.5" />
                Refund Information
              </div>
              <div className="text-xs text-[var(--text-secondary)] space-y-1.5">
                {order.refund_amount != null && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">Refunded Amount:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">${Number(order.refund_amount).toFixed(2)}</span>
                  </div>
                )}
                {order.refund_reason && (
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">Reason: </span>
                    <span className="text-[var(--text-secondary)]">{order.refund_reason}</span>
                  </div>
                )}
                {order.refunded_at && (
                  <div className="text-[11px] text-[var(--text-muted)] pt-0.5">
                    Processed at: {new Date(order.refunded_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Metadata Attributes in Single Column */}
          {order.metadata && typeof order.metadata === 'object' && Object.keys(order.metadata).length > 0 && (
            <div className="rounded-xl border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Metadata Attributes
              </div>
              <div className="flex flex-col gap-2 pt-1">
                {Object.entries(order.metadata).map(([key, val]) => {
                  if (
                    key === 'tool_name' ||
                    key === 'tool_site_url' ||
                    key === 'title' ||
                    key === 'tool_url'
                  ) {
                    return null;
                  }

                  // Special rendering for Guest Post Content MDX with expand/collapse
                  if (key === 'content_mdx' || key === 'contentMdx') {
                    const contentStr = String(val || '');
                    return (
                      <div
                        key={key}
                        className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/60 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--text-primary)]">
                            Article Content (MDX)
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {contentStr.length} characters
                          </span>
                        </div>
                        <div
                          className={`text-xs text-[var(--text-secondary)] font-mono leading-relaxed whitespace-pre-wrap ${
                            !isContentExpanded
                              ? 'line-clamp-3'
                              : 'max-h-60 overflow-y-auto custom-scrollbar p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]/40'
                          }`}
                        >
                          {contentStr}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsContentExpanded(!isContentExpanded)}
                          className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline cursor-pointer pt-0.5 inline-block"
                        >
                          {isContentExpanded ? 'Show less' : 'Show more'}
                        </button>
                      </div>
                    );
                  }

                  if (typeof val === 'object' && val !== null) {
                    return (
                      <div
                        key={key}
                        className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/60 p-2.5 text-xs space-y-1"
                      >
                        <span className="font-bold text-[var(--text-primary)] capitalize block">
                          {key.replace(/_/g, ' ')}:
                        </span>
                        <pre className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap overflow-x-auto max-h-32 p-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]/30">
                          {JSON.stringify(val, null, 2)}
                        </pre>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]/60 text-xs"
                    >
                      <span className="font-bold text-[var(--text-primary)] capitalize shrink-0">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="font-medium text-[var(--text-secondary)] break-all text-right">
                        {String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-[var(--border-color)]/60 shrink-0 bg-[var(--bg-surface)]">
          <DialogFooter className="flex flex-wrap items-center justify-between gap-3 p-0 m-0 border-none">
            <div className="flex flex-wrap items-center gap-2">
              {order.invoice_url && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 shadow-2xs transition-colors cursor-pointer"
                  title="View Invoice"
                >
                  <a
                    href={order.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />
                    View Invoice
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </Button>
              )}

              {order.receipt_url && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 shadow-2xs transition-colors cursor-pointer"
                  title="View Receipt"
                >
                  <a
                    href={order.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />
                    View Receipt
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canUpdate && onRefund && order.status === 'completed' && Boolean(order.dodo_payment_id) && isPaidOrder && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onRefund(order);
                  }}
                  className="gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Issue Refund
                </Button>
              )}
              {canUpdate && onEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onEdit(order);
                  }}
                  className="gap-1.5 text-xs font-semibold border-zinc-200 dark:border-zinc-700 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {order.status === 'refunded' || order.status === 'cancelled' || order.status === 'failed'
                    ? 'Edit Notes'
                    : 'Edit Order'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-zinc-200 dark:border-zinc-700 cursor-pointer"
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

