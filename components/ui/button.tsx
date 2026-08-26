import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-zinc-900 text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
        destructive:
          'bg-rose-500 text-white shadow-xs hover:bg-rose-600',
        outline:
          'border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-2xs hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
        secondary:
          'border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] shadow-2xs hover:text-[var(--text-primary)] hover:border-zinc-400 dark:hover:border-zinc-700',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
        link:
          'text-zinc-600 dark:text-zinc-400 underline-offset-4 hover:underline hover:text-zinc-950 dark:hover:text-zinc-100 p-0 h-auto font-bold',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-sm',
        icon: 'h-9 w-9 p-0',
        xs: 'h-7 px-2.5 text-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
