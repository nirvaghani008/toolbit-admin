'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { cn } from '@/lib/utils';

const CalendarChevron = ({
  orientation = 'down',
  className,
  size = 16,
}: {
  orientation?: 'up' | 'down' | 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
  size?: number;
  disabled?: boolean;
}) => {
  const Icon = orientation === 'left'
    ? ChevronLeft
    : orientation === 'right'
      ? ChevronRight
      : ChevronDown;

  return <Icon aria-hidden="true" className={cn('size-4', className)} size={size} />;
};

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      {...props}
      showOutsideDays={showOutsideDays}
      className={cn('p-3 w-fit select-none text-[var(--text-primary)]', className)}
      classNames={{
        root: 'relative w-fit',
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center px-8 relative',
        caption_label: 'text-sm font-bold tracking-tight text-[var(--text-primary)]',
        dropdowns: 'flex items-center gap-1',
        dropdown_root: 'relative inline-flex items-center',
        dropdown: 'absolute inset-0 z-10 cursor-pointer opacity-0',
        nav: 'flex items-center justify-between absolute inset-x-0 top-0 h-8 z-10 px-0.5 pointer-events-none',
        button_previous: cn(
          'pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]',
          'text-[var(--text-secondary)] shadow-2xs transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
          'disabled:pointer-events-none disabled:opacity-30'
        ),
        button_next: cn(
          'pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]',
          'text-[var(--text-secondary)] shadow-2xs transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
          'disabled:pointer-events-none disabled:opacity-30'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex justify-between mb-1',
        weekday: 'w-9 h-7 flex items-center justify-center text-center text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)] select-none',
        weeks: 'flex flex-col gap-1',
        week: 'flex w-full justify-between',
        day: 'relative h-9 w-9 p-0 text-center text-sm flex items-center justify-center focus-within:relative focus-within:z-20',
        day_button: cn(
          'h-9 w-9 p-0 font-medium rounded-lg flex items-center justify-center text-sm transition-all duration-150',
          'text-[var(--text-primary)] bg-transparent hover:bg-zinc-100 hover:text-zinc-950 active:scale-95',
          'dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500'
        ),
        selected: cn(
          '[&>button]:!bg-zinc-900 [&>button]:!text-white [&>button]:font-semibold [&>button]:shadow-xs [&>button]:!border-transparent',
          '[&>button]:hover:!bg-zinc-800 [&>button]:hover:!text-white',
          'dark:[&>button]:!bg-zinc-100 dark:[&>button]:!text-zinc-900 dark:[&>button]:hover:!bg-zinc-200 dark:[&>button]:hover:!text-zinc-900'
        ),
        today: cn(
          '[&>button]:font-bold [&>button]:border [&>button]:border-zinc-400 [&>button]:text-zinc-900',
          'dark:[&>button]:border-zinc-500 dark:[&>button]:text-zinc-100',
          '[&>button]:bg-zinc-100/70 dark:[&>button]:bg-zinc-800/70'
        ),
        outside: 'opacity-35 text-[var(--text-muted)] [&>button]:text-[var(--text-muted)]',
        disabled: 'opacity-25 text-[var(--text-muted)] [&>button]:text-[var(--text-muted)] [&>button]:cursor-not-allowed [&>button]:pointer-events-none',
        hidden: 'invisible',
        focused: '[&>button]:ring-2 [&>button]:ring-zinc-400 dark:[&>button]:ring-zinc-500',
        range_start: '[&>button]:rounded-l-lg [&>button]:bg-zinc-900 [&>button]:text-white dark:[&>button]:bg-zinc-100 dark:[&>button]:text-zinc-900',
        range_middle: '[&>button]:rounded-none [&>button]:bg-[var(--bg-elevated)] [&>button]:text-[var(--text-primary)]',
        range_end: '[&>button]:rounded-r-lg [&>button]:bg-zinc-900 [&>button]:text-white dark:[&>button]:bg-zinc-100 dark:[&>button]:text-zinc-900',
        week_number: 'w-9 text-center text-xs text-[var(--text-muted)]',
        week_number_header: 'w-9 text-center text-[0.7rem] font-bold uppercase text-[var(--text-muted)]',
        footer: 'mt-2 text-xs text-[var(--text-muted)]',
        chevron: 'fill-current text-[var(--text-secondary)]',
        months_dropdown: 'text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-md px-1.5 py-0.5 text-xs',
        years_dropdown: 'text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-md px-1.5 py-0.5 text-xs',
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
        ...components,
      }}
    />
  );
}

export { Calendar };
