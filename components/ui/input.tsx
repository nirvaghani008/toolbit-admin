import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-primary)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--text-muted)] outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus:border-zinc-400 dark:focus:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-2xs',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
