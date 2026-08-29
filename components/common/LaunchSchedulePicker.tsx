'use client';

import * as React from 'react';
import { CheckCircle2, Calendar as CalendarIcon, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateField } from '@/components/ui/date-field';

export interface LaunchSchedulePickerProps {
  /**
   * The selected launch date in 'YYYY-MM-DD' format, or null/empty for instant launch.
   */
  value: string | null;
  /**
   * Callback fired when launch date or mode changes.
   * @param dateStr The date in 'YYYY-MM-DD' format, or null if instant launch.
   * @param mode 'instant' | 'schedule'
   */
  onChange: (dateStr: string | null, mode: 'instant' | 'schedule') => void;
  /**
   * Optional explicit mode control ('instant' | 'schedule').
   */
  mode?: 'instant' | 'schedule';
  /**
   * Whether dates <= today should be treated as instant launch.
   * Defaults to false (any non-null date value indicates scheduled launch).
   */
  treatPastAsInstant?: boolean;
  /**
   * Minimum selectable date string ('YYYY-MM-DD'). Defaults to tomorrow.
   */
  minDateStr?: string;
  /**
   * Maximum selectable date string ('YYYY-MM-DD'). Defaults to 1 month from today.
   */
  maxDateStr?: string;
  /**
   * Title for the Instant Launch option. Defaults to "Instant Launch".
   */
  instantLabel?: string;
  /**
   * Description for the Instant Launch option.
   */
  instantDescription?: string;
  /**
   * Title for the Schedule Launch option. Defaults to "Schedule Launch".
   */
  scheduleLabel?: string;
  /**
   * Description for the Schedule Launch option.
   */
  scheduleDescription?: string;
  /**
   * Whether the control is disabled.
   */
  disabled?: boolean;
  /**
   * Optional error message.
   */
  error?: string;
  /**
   * Additional container class name.
   */
  className?: string;
  /**
   * Optional section title override (e.g. "Launch Schedule").
   */
  label?: string;
}

function formatDateToIsoString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function LaunchSchedulePicker({
  value,
  onChange,
  mode,
  treatPastAsInstant = false,
  minDateStr,
  maxDateStr,
  instantLabel = 'Instant Launch',
  instantDescription = "Publish immediately upon approval / today's date.",
  scheduleLabel = 'Schedule Launch',
  scheduleDescription = 'Select a custom date from tomorrow up to 1 month ahead.',
  disabled = false,
  error,
  className,
  label = 'Launch Schedule',
}: LaunchSchedulePickerProps) {
  // Compute default dynamic dates based on current system time
  const { todayStr, defaultTomorrowStr, defaultMaxDateStr } = React.useMemo(() => {
    const now = new Date();
    const today = formatDateToIsoString(now);

    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = formatDateToIsoString(tomorrowDate);

    const maxDate = new Date(now);
    maxDate.setMonth(maxDate.getMonth() + 1);
    const max = formatDateToIsoString(maxDate);

    return {
      todayStr: today,
      defaultTomorrowStr: tomorrow,
      defaultMaxDateStr: max,
    };
  }, []);

  const effectiveMinDate = minDateStr || defaultTomorrowStr;
  const effectiveMaxDate = maxDateStr || defaultMaxDateStr;

  // Derive mode from explicit mode prop or current value
  const isScheduled = React.useMemo(() => {
    if (mode !== undefined) {
      return mode === 'schedule';
    }
    if (!value || !value.trim()) return false;
    if (treatPastAsInstant) {
      return value.trim() > todayStr;
    }
    return true;
  }, [mode, value, treatPastAsInstant, todayStr]);

  const [selectedScheduleDate, setSelectedScheduleDate] = React.useState<string>(() => {
    if (value && value.trim()) return value.trim();
    return effectiveMinDate;
  });

  // Sync internal schedule date state if prop value updates
  React.useEffect(() => {
    if (value && value.trim()) {
      setSelectedScheduleDate(value.trim());
    }
  }, [value]);

  const handleInstantClick = () => {
    if (disabled) return;
    onChange(null, 'instant');
  };

  const handleScheduleClick = () => {
    if (disabled) return;
    const targetDate = selectedScheduleDate && selectedScheduleDate >= effectiveMinDate && selectedScheduleDate <= effectiveMaxDate
      ? selectedScheduleDate
      : effectiveMinDate;
    setSelectedScheduleDate(targetDate);
    onChange(targetDate, 'schedule');
  };

  const handleDateChange = (newDateStr: string) => {
    if (disabled) return;
    if (!newDateStr) {
      // Fallback to min date if cleared
      setSelectedScheduleDate(effectiveMinDate);
      onChange(effectiveMinDate, 'schedule');
      return;
    }

    // Clamp between min and max
    let clamped = newDateStr;
    if (clamped < effectiveMinDate) clamped = effectiveMinDate;
    if (clamped > effectiveMaxDate) clamped = effectiveMaxDate;

    setSelectedScheduleDate(clamped);
    onChange(clamped, 'schedule');
  };

  return (
    <div className={cn('space-y-4 w-full', className)}>
      {label && (
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-[var(--text-secondary)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            {label}
          </span>
        </div>
      )}

      {/* 2 Options: Instant vs. Schedule */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Option 1: Instant Launch */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleInstantClick}
          className={cn(
            'flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none space-y-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
            !isScheduled
              ? 'bg-zinc-900/5 dark:bg-zinc-100/5 border-zinc-900 dark:border-zinc-100 shadow-2xs'
              : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-zinc-400 dark:hover:border-zinc-600',
            disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {instantLabel}
            </span>
            {!isScheduled ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-zinc-900 dark:text-zinc-50 shrink-0" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-[var(--border-color)] shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {instantDescription}
          </p>
        </button>

        {/* Option 2: Schedule Launch */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleScheduleClick}
          className={cn(
            'flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none space-y-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
            isScheduled
              ? 'bg-zinc-900/5 dark:bg-zinc-100/5 border-zinc-900 dark:border-zinc-100 shadow-2xs'
              : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-zinc-400 dark:hover:border-zinc-600',
            disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {scheduleLabel}
            </span>
            {isScheduled ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-zinc-900 dark:text-zinc-50 shrink-0" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-[var(--border-color)] shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {scheduleDescription}
          </p>
        </button>
      </div>

      {/* Calendar Picker when Schedule Launch is selected */}
      {isScheduled && (
        <div className="pt-2 max-w-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Select Launch Date <span className="text-rose-500 font-bold">*</span>
            </label>
            <DateField
              value={selectedScheduleDate}
              onChange={handleDateChange}
              minDate={effectiveMinDate}
              maxDate={effectiveMaxDate}
              disabled={disabled}
              placeholder="Pick a future launch date"
              className="h-10"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Clock size={12} className="shrink-0 text-zinc-500" />
            <span>
              Selectable from{' '}
              <strong className="text-[var(--text-primary)] font-semibold">
                {effectiveMinDate}
              </strong>{' '}
              to{' '}
              <strong className="text-[var(--text-primary)] font-semibold">
                {effectiveMaxDate}
              </strong>
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="saas-error-message flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

export default LaunchSchedulePicker;
