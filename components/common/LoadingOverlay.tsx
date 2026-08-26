'use client';

import { Spinner } from '@/components/ui/spinner';

interface LoadingOverlayProps {
  className?: string;
  message?: string; // Kept for backwards-compatibility but deliberately omitted from render to prevent unnecessary text
}

export default function LoadingOverlay({ className }: LoadingOverlayProps) {
  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg-base)]/40 backdrop-blur-xs animate-fade-in ${className || ''}`}>
      <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-md flex items-center justify-center">
        <Spinner size={24} />
      </div>
    </div>
  );
}
