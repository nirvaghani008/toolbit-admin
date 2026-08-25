import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-2xl border p-4 text-xs transition-all [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-color)] [&>svg]:text-[var(--text-primary)]',
        destructive:
          'bg-rose-50 text-rose-800 border-rose-200/70 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 [&>svg]:text-rose-600 dark:[&>svg]:text-rose-400',
        warning:
          'bg-amber-50 text-amber-800 border-amber-200/70 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400',
        info:
          'bg-zinc-100/90 text-zinc-900 border-zinc-200/80 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400 [&>svg]:text-zinc-700 dark:[&>svg]:text-sky-400',
        success:
          'bg-emerald-50 text-emerald-800 border-emerald-200/70 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1.5 font-bold leading-none tracking-tight text-sm flex items-center gap-2', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-xs font-medium leading-relaxed opacity-90', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };
