'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  ShieldCheck,
  Ban,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Portal } from '@/components/ui/portal';
import type {
  EmailDeliverabilityStatus,
  EmailRecord,
  ResendDeliveryStatus,
} from '@/lib/marketing/business-emails';

export interface EmailDeliverabilityBadgeProps {
  email?: string;
  status?: EmailDeliverabilityStatus;
  record?: EmailRecord | null;
  resendStatus?: ResendDeliveryStatus;
  bounceReason?: string;
  isPrimary?: boolean;
  size?: 'sm' | 'md';
  onStatusChange?: (status: EmailDeliverabilityStatus) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  showEmail?: boolean;
  showPrimaryBadge?: boolean;
}

const STATUS_CONFIG: Record<
  EmailDeliverabilityStatus,
  {
    label: string;
    description: string;
    dotColor: string;
    badgeStyle: string;
    textStyle: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
  }
> = {
  deliverable: {
    label: 'Deliverable',
    description: 'Verified valid & safe to send',
    dotColor: 'bg-emerald-500',
    badgeStyle:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    textStyle: 'text-emerald-700 dark:text-emerald-300 font-medium',
    icon: ShieldCheck,
  },
  unverified: {
    label: 'Unverified',
    description: 'Found, deliverability not tested yet',
    dotColor: 'bg-zinc-400 dark:bg-zinc-500',
    badgeStyle:
      'bg-zinc-100 text-zinc-600 border-zinc-200/90 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/60',
    textStyle: 'text-zinc-600 dark:text-zinc-400 font-medium',
    icon: Clock,
  },
  undeliverable: {
    label: 'Undeliverable',
    description: 'Dead or bounced email (sending blocked)',
    dotColor: 'bg-rose-500',
    badgeStyle:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    textStyle: 'text-rose-700 dark:text-rose-300 font-medium',
    icon: Ban,
  },
};

export default function EmailDeliverabilityBadge({
  email,
  status: statusProp,
  record,
  resendStatus: resendStatusProp,
  bounceReason: bounceReasonProp,
  isPrimary = false,
  size = 'md',
  onStatusChange,
  disabled = false,
  className,
  showEmail = false,
  showPrimaryBadge = false,
}: EmailDeliverabilityBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    placement: 'bottom' | 'top';
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);

  const effectiveStatus: EmailDeliverabilityStatus =
    statusProp || record?.status || 'unverified';
  const effectiveResendStatus = resendStatusProp || record?.resend_status;
  const effectiveBounceReason = bounceReasonProp || record?.bounce_reason;
  const isBounced =
    effectiveResendStatus === 'bounced' ||
    (effectiveStatus === 'undeliverable' && Boolean(effectiveBounceReason));

  const currentConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.unverified;
  const isInteractive = Boolean(onStatusChange && !disabled && !isUpdating);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 220;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceBelow < menuHeight && rect.top > menuHeight ? 'top' : 'bottom';

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }

    setDropdownPos({
      top: placement === 'bottom' ? rect.bottom + 4 : rect.top - 4,
      left,
      placement,
    });
  }, []);

  const toggleDropdown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!isInteractive) return;

      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    },
    [isInteractive, isOpen, updatePosition]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleSelectStatus = async (newStatus: EmailDeliverabilityStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (newStatus === effectiveStatus || !onStatusChange) {
      setIsOpen(false);
      return;
    }

    try {
      setIsUpdating(true);
      await onStatusChange(newStatus);
    } finally {
      setIsUpdating(false);
      setIsOpen(false);
    }
  };

  const isSmall = size === 'sm';

  // Informative hover tooltip
  const badgeTitle = isBounced
    ? `Bounced in Resend: ${effectiveBounceReason || 'Mailbox delivery failed'}. Sending is blocked.`
    : record?.verification_provider
    ? `Verified via ${record.verification_provider.toUpperCase()}: ${record.verification_status || currentConfig.label}${record.verification_score !== undefined ? ` (${record.verification_score}/100)` : ''}${record.verified_at ? ` on ${new Date(record.verified_at).toLocaleDateString()}` : ''}`
    : effectiveResendStatus === 'delivered'
    ? `Verified delivered via Resend${record?.last_delivered_at ? ` (${new Date(record.last_delivered_at).toLocaleDateString()})` : ''}`
    : `Deliverability: ${currentConfig.label} (${currentConfig.description})${isInteractive ? ' — click to change.' : ''}`;

  // Deliverability Status Button
  const statusButton = (
    <button
      ref={triggerRef}
      type="button"
      data-no-row-click
      disabled={disabled || isUpdating}
      onClick={toggleDropdown}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border transition-all select-none',
        isSmall ? 'text-[10px] px-2 py-0.5 font-medium' : 'text-[11px] px-2.5 py-0.5 font-medium',
        isBounced
          ? 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
          : currentConfig.badgeStyle,
        isInteractive
          ? 'cursor-pointer hover:opacity-85 hover:shadow-2xs active:scale-98'
          : 'cursor-default'
      )}
      title={badgeTitle}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      {isUpdating ? (
        <Loader2 size={10} className="animate-spin shrink-0" />
      ) : isBounced ? (
        <AlertTriangle size={10} className="shrink-0 text-rose-600 dark:text-rose-400" />
      ) : (
        <span className={cn('size-1.5 rounded-full shrink-0', currentConfig.dotColor)} />
      )}

      <span>{isBounced ? 'Bounced' : currentConfig.label}</span>

      {record?.verification_score !== undefined && record.verification_score !== null && !isBounced && (
        <span
          className={cn(
            'text-[9px] font-mono px-1 py-0 rounded font-semibold',
            record.verification_score >= 70
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
              : record.verification_score < 30
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
          )}
          title={`Deliverability score: ${record.verification_score}/100`}
        >
          {record.verification_score}
        </span>
      )}

      {isInteractive && (
        <ChevronDown
          size={10}
          className={cn('shrink-0 opacity-50 transition-transform duration-150', isOpen && 'rotate-180')}
        />
      )}
    </button>
  );

  return (
    <>
      {showEmail ? (
        <div
          data-no-row-click
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/40 px-2.5 py-1 text-xs text-zinc-800 dark:text-zinc-200 max-w-full',
            className
          )}
        >
          <Mail size={12} className="shrink-0 text-zinc-400" />

          {email && (
            <span className="font-mono truncate select-all max-w-[200px]" title={email}>
              {email}
            </span>
          )}

          {statusButton}
        </div>
      ) : (
        <div data-no-row-click className={cn('inline-flex items-center', className)}>
          {statusButton}
        </div>
      )}

      {/* Floating Status Switcher Dropdown mounted via Portal to prevent any clipping */}
      {isOpen && dropdownPos && (
        <Portal>
          <div
            className="fixed inset-0 z-[99998] cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          <div
            data-no-row-click
            style={{
              top: dropdownPos.placement === 'bottom' ? dropdownPos.top : undefined,
              bottom: dropdownPos.placement === 'top' ? window.innerHeight - dropdownPos.top : undefined,
              left: dropdownPos.left,
            }}
            className="fixed z-[99999] w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-100 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {isBounced && effectiveBounceReason && (
              <div className="mx-1 my-1 p-2 rounded-lg bg-rose-50 border border-rose-200/80 text-[10px] text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Bounced in Resend</span>
                </div>
                <div className="text-[10px] mt-0.5 opacity-90 truncate max-w-[210px]" title={effectiveBounceReason}>
                  {effectiveBounceReason}
                </div>
              </div>
            )}

            {record?.verification_provider && (
              <div className="mx-1 my-1 p-2 rounded-lg bg-zinc-50 border border-zinc-200/80 text-[10px] text-zinc-700 dark:bg-zinc-800/50 dark:border-zinc-700/60 dark:text-zinc-300">
                <div className="font-semibold flex items-center justify-between gap-1">
                  <span>Verified by {record.verification_provider}</span>
                  {record.verification_score !== undefined && (
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {record.verification_score}/100
                    </span>
                  )}
                </div>
                {record.verification_status && (
                  <div className="text-[10px] mt-0.5 text-zinc-500 dark:text-zinc-400">
                    Status: <strong className="text-zinc-700 dark:text-zinc-200">{record.verification_status}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/60 mb-1">
              Deliverability Status
            </div>

            <div className="space-y-0.5">
              {(['deliverable', 'unverified', 'undeliverable'] as EmailDeliverabilityStatus[]).map((st) => {
                const opt = STATUS_CONFIG[st];
                const isSelected = st === effectiveStatus;

                return (
                  <button
                    key={st}
                    type="button"
                    data-no-row-click
                    onClick={(e) => handleSelectStatus(st, e)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn('size-2 rounded-full shrink-0', opt.dotColor)} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs leading-tight font-medium text-zinc-900 dark:text-zinc-100">
                          {opt.label}
                        </span>
                        <span className="text-[10px] leading-tight text-zinc-400 truncate max-w-[150px]">
                          {opt.description}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
