'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  hasErrors?: boolean;
  defaultOpen?: boolean;
  headerActions?: React.ReactNode;
  className?: string;
  hideChevron?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export default function CollapsibleSection({
  id,
  title,
  description,
  children,
  hasErrors = false,
  defaultOpen = true,
  headerActions,
  className = '',
  hideChevron = false,
  isOpen: controlledIsOpen,
  onToggle
}: CollapsibleSectionProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleToggle = () => {
    const nextState = !isOpen;
    if (!isControlled) {
      setInternalIsOpen(nextState);
    }
    if (onToggle) {
      onToggle(nextState);
    }
  };

  // Automatically expand if errors occur in this section
  useEffect(() => {
    if (hasErrors) {
      if (!isControlled) {
        setInternalIsOpen(true);
      }
      if (onToggle) {
        onToggle(true);
      }
    }
  }, [hasErrors, isControlled, onToggle]);

  return (
    <div
      id={id}
      className={`saas-card transition-all duration-300 ${
        hasErrors ? 'border-rose-500 ring-2 ring-rose-500/10' : ''
      } ${className}`}
    >
      <div
        onClick={handleToggle}
        className="saas-card-header cursor-pointer select-none group flex items-center justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          <h2 className="saas-card-title flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {hasErrors && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                Error
              </span>
            )}
          </h2>
          {description && <p className="saas-card-desc">{description}</p>}
        </div>
        <div 
          className="flex items-center gap-3 shrink-0" 
          onClick={(e) => e.stopPropagation()}
        >
          {headerActions}
          {!hideChevron && (
            <button
              type="button"
              onClick={handleToggle}
              className="p-1.5 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors cursor-pointer"
              aria-label={isOpen ? "Collapse section" : "Expand section"}
            >
              <ChevronDown
                size={18}
                className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-300 group-hover:scale-110 ${
                  isOpen && Boolean(children) ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {isOpen && Boolean(children) && (
        <div className="saas-card-body animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}
