'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogContextType {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined);

function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog');
  }
  return context;
}

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open: controlledOpen, onOpenChange, children }) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
};

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, onClick, ...props }, ref) => {
  const { onOpenChange } = useDialog();

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          onOpenChange(true);
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
});
DialogTrigger.displayName = 'DialogTrigger';

const emptySubscribe = () => () => {};

const DialogPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { open } = useDialog();
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted || !open || typeof document === 'undefined') return null;
  return createPortal(<>{children}</>, document.body);
};

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { onOpenChange } = useDialog();

  return (
    <div
      ref={ref}
      onClick={() => onOpenChange(false)}
      className={cn(
        'fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in',
        className
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = 'DialogOverlay';

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  hideCloseButton?: boolean;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClose, hideCloseButton = false, ...props }, ref) => {
    const { onOpenChange } = useDialog();
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onOpenChange(false);
          onClose?.();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }, [onOpenChange, onClose]);

    return (
      <DialogPortal>
        <DialogOverlay />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
          <div
            ref={ref || contentRef}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'pointer-events-auto relative w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 shadow-2xl transition-all animate-fade-in-up duration-200 focus:outline-none',
              className
            )}
            {...props}
          >
            {!hideCloseButton && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onClose?.();
                }}
                className="absolute top-4 right-4 rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {children}
          </div>
        </div>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 border-t border-[var(--border-color)]/60 pt-4 mt-6',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-bold leading-none tracking-tight text-[var(--text-primary)]',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-[var(--text-muted)] font-medium mt-1', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, children, ...props }, ref) => {
  const { onOpenChange } = useDialog();

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </button>
  );
});
DialogClose.displayName = 'DialogClose';

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
  DialogPortal,
};
