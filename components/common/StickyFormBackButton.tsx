'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface StickyFormBackButtonProps {
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  className?: string;
}

export default function StickyFormBackButton({
  label,
  onClick,
  isLoading = false,
  className,
}: StickyFormBackButtonProps) {
  return (
    <div
      className={cn(
        'sticky top-[72px] z-20 -mx-2 mb-6 flex items-center bg-[var(--bg-base)]/95 py-2 backdrop-blur-sm',
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={isLoading}
        aria-busy={isLoading}
        className="text-sm font-bold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white p-2 h-auto gap-2 rounded-lg"
      >
        {isLoading ? (
          <Spinner size={16} className="text-current shrink-0" />
        ) : (
          <ArrowLeft size={16} />
        )}
        {label}
      </Button>
    </div>
  );
}
