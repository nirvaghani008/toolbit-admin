import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-zinc-200/80 bg-zinc-100 text-zinc-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-500',
        secondary:
          'border-zinc-200/80 bg-zinc-100/80 text-zinc-700 dark:border-[var(--border-color)] dark:bg-[var(--bg-elevated)] dark:text-[var(--text-secondary)]',
        destructive:
          'border-rose-200/60 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400',
        outline:
          'border-zinc-200/80 text-zinc-800 bg-transparent dark:border-[var(--border-color)] dark:text-[var(--text-primary)] dark:bg-transparent',
        success:
          'border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400',
        warning:
          'border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400',
        info:
          'border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-500',
        violet:
          'border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400',
        slate:
          'border-zinc-200/80 bg-zinc-100/80 text-zinc-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
