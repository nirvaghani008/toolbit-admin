'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Check, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/ui/portal';

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'info' | 'violet' | 'slate' | 'default';

export interface StatusOption {
  value: string;
  label: string;
}

interface StatusChangeControlProps {
  /** Identifier of the row/item passed back to onStatusChange */
  itemId: number | string;
  /** Current status value of the item */
  currentStatus: string;
  /** Selectable status options */
  options: readonly StatusOption[];
  /** Human readable label shown inside the confirmation popup */
  itemLabel?: string;
  /** Called when the user confirms a status change */
  onStatusChange?: (itemId: number | string, newStatus: string) => Promise<void> | void;
  /** Maps a status value to a Badge variant */
  getVariant: (status: string) => BadgeVariant;
  /** Formats a raw status value into a display label */
  formatStatus: (status: string) => string;
  /** Optional override for the colored dot next to each option */
  getDotColor?: (value: string) => string;
  disabled?: boolean;
}

const defaultDotColor = (value: string): string => {
  const v = (value || '').toLowerCase();
  if (v === 'show' || v === 'active' || v === 'approved' || v === 'published') return 'bg-emerald-500';
  if (v.startsWith('show:')) return 'bg-amber-500';
  if (v === 'archived') return 'bg-violet-500';
  if (v === 'error' || v === 'delete' || v === 'rejected') return 'bg-rose-500';
  return 'bg-zinc-400';
};

/**
 * Interactive status control for data tables: renders a status badge that opens
 * a dropdown of statuses and asks for confirmation (via a portal dialog) before
 * applying the change. Shared across the Tools and Models tables.
 */
export default function StatusChangeControl({
  itemId,
  currentStatus,
  options,
  itemLabel,
  onStatusChange,
  getVariant,
  formatStatus,
  getDotColor = defaultDotColor,
  disabled = false,
}: StatusChangeControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        if (!isChanging) setPendingStatus(null);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isChanging]);

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer group/status focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        title="Click to change status"
      >
        <Badge
          variant={getVariant(currentStatus)}
          className="text-[9px] px-2 py-0.5 font-bold tracking-wider uppercase cursor-pointer"
        >
          {formatStatus(currentStatus)}
        </Badge>
        <ChevronDown
          size={11}
          className={`text-[var(--text-muted)] group-hover/status:text-[var(--text-primary)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 mt-1.5 w-38 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-150 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase px-2.5 py-1 tracking-wider border-b border-[var(--border-color)]/60 mb-1">
            Change Status
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-0.5">
            {options.map((opt) => {
              const isCurrent = (currentStatus || '').toLowerCase() === opt.value.toLowerCase();
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    if (!isCurrent) {
                      setPendingStatus(opt.value);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-900 dark:text-zinc-100'
                      : 'text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getDotColor(opt.value)}`} />
                    <span className="text-[11px] truncate">{opt.label}</span>
                  </span>
                  {isCurrent && <Check size={12} className="text-zinc-900 dark:text-zinc-100 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Status Change wrapped in Portal */}
      {pendingStatus && (
        <Portal>
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => !isChanging && setPendingStatus(null)}
          >
            <div
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200 shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                  <AlertCircle size={20} />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Confirm Status Change
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 leading-relaxed">
                    Are you sure you want to update the status of{' '}
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {itemLabel || 'this item'}
                    </span>
                    ?
                  </p>
                </div>
              </div>

              {/* Visual Status Transition */}
              <div className="flex items-center justify-center gap-3 p-3 bg-zinc-50 dark:bg-slate-900/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">Current</span>
                  <Badge variant={getVariant(currentStatus)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                    {formatStatus(currentStatus)}
                  </Badge>
                </div>
                <span className="text-zinc-400 dark:text-slate-600 font-bold text-lg px-2">→</span>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-zinc-400 dark:text-slate-500 tracking-wider">New Status</span>
                  <Badge variant={getVariant(pendingStatus)} className="text-[9px] px-2.5 py-0.5 font-bold tracking-wider uppercase">
                    {formatStatus(pendingStatus)}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isChanging}
                  onClick={() => setPendingStatus(null)}
                  className="font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isChanging}
                  onClick={async () => {
                    if (!pendingStatus) return;
                    setIsChanging(true);
                    try {
                      if (onStatusChange) {
                        await onStatusChange(itemId, pendingStatus);
                      }
                      setPendingStatus(null);
                    } catch (err: any) {
                      console.error('Failed to change status:', err?.message || err);
                    } finally {
                      setIsChanging(false);
                    }
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs min-w-[130px] cursor-pointer"
                >
                  {isChanging ? 'Updating...' : 'Confirm Change'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
