'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface CustomSelectProps {
  name?: string;
  value?: string | number;
  onChange?: (e: any) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  'data-field'?: string;
  children: React.ReactNode;
}

export default function CustomSelect({
  name = '',
  value,
  onChange,
  className = '',
  disabled = false,
  id,
  'data-field': dataField,
  children
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse children options
  const options: { value: string; label: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<any>;
      if (element.type === 'option') {
        const val = element.props.value !== undefined ? String(element.props.value) : '';
        const label = element.props.children ? String(element.props.children) : val;
        options.push({ value: val, label });
      } else if (element.type === React.Fragment) {
        // Handle React.Fragment if nested
        React.Children.forEach(element.props.children, (nestedChild) => {
          if (React.isValidElement(nestedChild)) {
            const nestedElement = nestedChild as React.ReactElement<any>;
            if (nestedElement.type === 'option') {
              const val = nestedElement.props.value !== undefined ? String(nestedElement.props.value) : '';
              const label = nestedElement.props.children ? String(nestedElement.props.children) : val;
              options.push({ value: val, label });
            }
          }
        });
      }
    }
  });

  const selectedOption = options.find((opt) => opt.value === String(value)) || options[0];

  // Sync selected index when dropdown opens or value changes
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => opt.value === String(value));
      setSelectedIndex(idx >= 0 ? idx : 0);
    } else {
      setSelectedIndex(-1);
    }
  }, [isOpen, value, options.length]);

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (isOpen && selectedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-select-index="${selectedIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, isOpen]);

  // Close on outside click
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
    if (onChange) {
      // Simulate synthetic standard change event
      onChange({
        target: {
          name,
          value: val,
          type: 'select-one'
        }
      });
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (options.length > 0) {
        setSelectedIndex(prev => (prev + 1 < options.length ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (options.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (selectedIndex >= 0 && selectedIndex < options.length) {
          handleSelect(options[selectedIndex].value);
        } else {
          setIsOpen(false);
        }
      } else {
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        id={id}
        data-field={dataField || name}
        name={name}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left saas-input cursor-pointer ${
          isOpen ? 'border-zinc-400 ring-2 ring-zinc-400/20 dark:border-zinc-500 dark:ring-zinc-500/20' : ''
        } ${className}`}
        style={{ paddingRight: '1rem' }} // Keep spacing consistent
      >
        <span className="truncate">{selectedOption?.label || ''}</span>
        <ChevronDown
          size={16}
          className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div 
          ref={listRef}
          className="absolute z-[100] left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ transformOrigin: 'top center' }}
        >
          <div className="py-0">
            {options.map((opt, i) => {
              const isSelected = opt.value === String(value);
              const isHighlighted = selectedIndex === i;
              return (
                <button
                  key={i}
                  type="button"
                  data-select-index={i}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full flex items-center justify-between text-left p-3 px-4 text-xs font-semibold transition-colors ${
                    isHighlighted ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : isSelected ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100/70 dark:bg-zinc-800/70 font-bold' : 'text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="text-zinc-900 dark:text-zinc-100 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
