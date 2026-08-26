'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/ui/portal';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  title = 'Confirm Delete',
  message = 'Are you sure you want to delete this item? This action cannot be undone.',
  onConfirm,
  onCancel,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isLoading = false
}: DeleteConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    // Prevent body scrolling when modal is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity duration-150 animate-in fade-in"
        onClick={onCancel}
      >
        <div 
          ref={modalRef}
          className={`bg-[var(--bg-surface)] border border-[var(--border-color)] w-full max-w-[440px] rounded-2xl shadow-2xl overflow-hidden p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-150 transition-opacity ${isLoading ? 'opacity-50 pointer-events-none select-none' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Close button X */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 h-8 w-8 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
          aria-label="Close dialog"
        >
          <X size={16} />
        </Button>

        <div className="flex items-start gap-4 mt-2">
          {/* Warning Icon Container */}
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 border border-rose-500/20">
            <AlertTriangle size={22} className="animate-pulse" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1.5 font-medium">
              {message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 mt-2 border-t border-[var(--border-color)]/50 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="text-xs font-semibold cursor-pointer"
          >
            {cancelText}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            className="text-xs font-bold shadow-md shadow-rose-500/15 cursor-pointer flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <Spinner size={13} className="text-current shrink-0" />
                <span>Deleting...</span>
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </div>
    </div>
  </Portal>
);
}
