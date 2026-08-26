import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  className?: string;
}

export function Spinner({ size = 18, className, ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    >
      <Loader2
        size={size}
        className={cn('animate-spin text-zinc-700 dark:text-zinc-300', className)}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export default Spinner;
