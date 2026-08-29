'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

function inputValueToDate(value: string): Date | undefined {
  const parts = value.split('-').map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part))
  ) {
    return undefined;
  }

  const [year, month, day] = parts;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function dateToInputValue(date: Date | undefined): string {
  if (!date) return '';

  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DateFieldProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'value' | 'onChange' | 'name' | 'disabled'
> {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  placeholder?: string;
  minDate?: string | Date;
  maxDate?: string | Date;
}

export function DateField({
  value,
  onChange,
  name,
  id,
  disabled = false,
  required = false,
  error = false,
  placeholder = 'Select date',
  minDate,
  maxDate,
  className,
  ...buttonProps
}: DateFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties>({});
  
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  
  const calendarId = `${id || name || 'date-field'}-calendar`;
  const selectedDate = inputValueToDate(value);
  const displayValue = selectedDate
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(selectedDate)
    : '';

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 340;
    const popoverWidth = 280;

    let top: number;
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      top = rect.top - estimatedHeight - 8;
    } else {
      top = rect.bottom + 8;
    }

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - 16 - popoverWidth);
    }

    setPopoverStyle({
      position: 'fixed',
      top: `${Math.max(8, top)}px`,
      left: `${Math.max(8, left)}px`,
      zIndex: 9999,
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (date: Date | undefined) => {
    onChange(dateToInputValue(date));
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const disabledMatcher = React.useMemo(() => {
    const min = typeof minDate === 'string' ? inputValueToDate(minDate) : minDate;
    const max = typeof maxDate === 'string' ? inputValueToDate(maxDate) : maxDate;
    if (!min && !max) return undefined;
    const matchers: any[] = [];
    if (min) matchers.push({ before: min });
    if (max) matchers.push({ after: max });
    return matchers.length === 1 ? matchers[0] : matchers;
  }, [minDate, maxDate]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        {...buttonProps}
        ref={triggerRef}
        id={id}
        name={name}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? calendarId : undefined}
        aria-invalid={error || undefined}
        aria-required={required || undefined}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-left text-[var(--text-primary)] shadow-2xs transition-colors',
          'outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
          'hover:border-zinc-400 dark:hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50',
          isOpen && 'border-zinc-400 dark:border-zinc-300 ring-2 ring-zinc-400/20 dark:ring-zinc-500/20',
          error && 'saas-input-error',
          className
        )}
      >
        <span className={cn('truncate', !displayValue && 'text-[var(--text-muted)]')}>
          {displayValue || placeholder}
        </span>
        <CalendarDays
          aria-hidden="true"
          size={16}
          className="ml-3 shrink-0 text-zinc-600 dark:text-zinc-200"
        />
      </button>

      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {isOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={calendarId}
          role="dialog"
          aria-label="Choose date"
          style={popoverStyle}
          className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            defaultMonth={selectedDate || (typeof minDate === 'string' ? inputValueToDate(minDate) : minDate) || new Date()}
            autoFocus
          />
        </div>,
        document.body
      )}
    </div>
  );
}
