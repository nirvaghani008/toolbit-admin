'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'defaultValue'> {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, e?: any) => void;
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'data-field'?: string;
  children?: React.ReactNode;
  suppressHydrationWarning?: boolean;
}

export function SelectItem({ value, children, disabled, className }: { value: string; children: React.ReactNode; disabled?: boolean; className?: string }) {
  return null;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      value,
      defaultValue,
      onChange,
      options = [],
      placeholder,
      children,
      disabled = false,
      name = '',
      id,
      'data-field': dataField,
      suppressHydrationWarning,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalValue, setInternalValue] = useState<string>(value !== undefined ? value : defaultValue || '');
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value);
      }
    }, [value]);

    const parsedOptions: SelectOption[] = [...options];

    const extractOptions = (nodes: React.ReactNode) => {
      React.Children.forEach(nodes, (child) => {
        if (React.isValidElement(child)) {
          const el = child as React.ReactElement<any>;
          if (el.type === 'option' || el.type === SelectItem) {
            parsedOptions.push({
              value: el.props.value !== undefined ? String(el.props.value) : '',
              label: el.props.children ? String(el.props.children) : String(el.props.value || ''),
              disabled: el.props.disabled,
            });
          } else if (el.type === React.Fragment && el.props?.children) {
            extractOptions(el.props.children);
          }
        }
      });
    };

    extractOptions(children);

    const currentValue = value !== undefined ? value : internalValue;
    const selectedOption = parsedOptions.find((opt) => String(opt.value) === String(currentValue));

    useEffect(() => {
      if (isOpen) {
        const idx = parsedOptions.findIndex((opt) => String(opt.value) === String(currentValue));
        setSelectedIndex(idx >= 0 ? idx : 0);
      } else {
        setSelectedIndex(-1);
      }
    }, [isOpen, currentValue, parsedOptions.length]);

    useEffect(() => {
      if (isOpen && selectedIndex >= 0 && listRef.current) {
        const activeEl = listRef.current.querySelector(`[data-select-index="${selectedIndex}"]`) as HTMLElement;
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [selectedIndex, isOpen]);

    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      }
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    const handleSelect = (val: string) => {
      setInternalValue(val);
      if (onChange) {
        const syntheticEvent = {
          target: { name: name || '', value: val, type: 'select-one' },
          currentTarget: { name: name || '', value: val },
          preventDefault: () => {},
          stopPropagation: () => {},
        };
        (onChange as any)(val, syntheticEvent);
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (parsedOptions.length > 0) {
          setSelectedIndex((prev) => (prev + 1 < parsedOptions.length ? prev + 1 : 0));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (parsedOptions.length > 0) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : parsedOptions.length - 1));
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) {
          if (selectedIndex >= 0 && selectedIndex < parsedOptions.length) {
            const chosen = parsedOptions[selectedIndex];
            if (!chosen.disabled) {
              handleSelect(chosen.value);
            }
          } else {
            setIsOpen(false);
          }
        } else {
          setIsOpen(true);
        }
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    return (
      <div ref={containerRef} className="relative w-full inline-block" onKeyDown={handleKeyDown}>
        <button
          ref={ref || triggerRef}
          id={id}
          data-field={dataField || name}
          name={name}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            'flex h-10 w-full appearance-none items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] shadow-2xs transition-all outline-none cursor-pointer',
            'focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400/20 dark:focus-visible:border-zinc-500 dark:focus-visible:ring-zinc-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]',
            isOpen && 'border-zinc-400 ring-2 ring-zinc-400/20 dark:border-zinc-500 dark:ring-zinc-500/20',
            className
          )}
          {...props}
        >
          <span className={cn('truncate', !selectedOption && 'text-[var(--text-muted)]')}>
            {selectedOption ? selectedOption.label : placeholder || 'Select option...'}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ml-2',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div
            ref={listRef}
            role="listbox"
            className="absolute z-[100] left-0 right-0 mt-1.5 min-w-[8rem] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl max-h-60 overflow-y-auto p-1 animate-in fade-in slide-from-top-1 duration-150 custom-scrollbar"
            style={{ transformOrigin: 'top center' }}
          >
            {parsedOptions.length === 0 ? (
              <div className="py-2 px-3 text-xs text-[var(--text-muted)] italic">No options available</div>
            ) : (
              parsedOptions.map((opt, i) => {
                const isSelected = String(opt.value) === String(currentValue);
                const isHighlighted = selectedIndex === i;
                return (
                  <button
                    key={`${opt.value}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    type="button"
                    data-select-index={i}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                    className={cn(
                      'w-full flex items-center justify-between text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer',
                      opt.disabled && 'opacity-40 cursor-not-allowed',
                      isHighlighted && !opt.disabled
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                        : isSelected
                        ? 'bg-zinc-100/70 dark:bg-zinc-800/70 font-bold text-zinc-900 dark:text-zinc-100'
                        : 'text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };
