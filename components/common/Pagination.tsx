'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PaginationProps {
  totalCount: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  totalCount,
  pageSize,
  currentPage,
  onPageChange
}: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const [windowStart, setWindowStart] = useState(() => {
    let start = Math.floor((currentPage - 1) / 2) * 2 + 1;
    if (start > totalPages - 2 && totalPages > 3) start = totalPages - 2;
    return Math.max(1, start);
  });

  useEffect(() => {
    // If currentPage is the 'end' of current window, shift forward
    if (currentPage === windowStart + 2 && currentPage < totalPages) {
      setWindowStart(currentPage);
    }
    // If currentPage is the 'start' of current window, shift backward (except for page 1)
    else if (currentPage === windowStart && windowStart > 1) {
      setWindowStart(Math.max(1, currentPage - 2));
    }
    // If currentPage is totally outside (e.g. jumped via last/first), reset
    else if (currentPage < windowStart || currentPage > windowStart + 2) {
      let start = Math.floor((currentPage - 1) / 2) * 2 + 1;
      if (start > totalPages - 2 && totalPages > 3) start = totalPages - 2;
      setWindowStart(Math.max(1, start));
    }
  }, [currentPage, totalPages]);

  const renderPageButtons = () => {
    const pages = [];

    const renderButton = (page: number) => (
      <Button
        key={page}
        variant={currentPage === page ? 'default' : 'ghost'}
        size="icon"
        onClick={() => onPageChange(page)}
        className={`w-9 h-9 text-xs font-bold rounded-lg ${
          currentPage === page
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 scale-105'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
        }`}
      >
        {page}
      </Button>
    );

    const renderEllipsis = (key: string) => (
      <span key={key} className="px-2 text-[var(--text-muted)] font-bold text-xs select-none">
        ...
      </span>
    );

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(renderButton(i));
      }
    } else {
      // Sliding Window of 3 Logic (Stateful)
      // Show first page and ellipsis if window starts late
      if (windowStart > 1) {
        pages.push(renderButton(1));
        if (windowStart > 2) pages.push(renderEllipsis('start-ellipsis'));
      }

      // Render the 3-page window
      for (let i = windowStart; i < windowStart + 3 && i <= totalPages; i++) {
        if (i === 1 && windowStart > 1) continue; // Already added
        pages.push(renderButton(i));
      }

      // Always show ellipsis and last page if we are not at the very end
      if (windowStart + 2 < totalPages) {
        if (windowStart + 3 < totalPages) pages.push(renderEllipsis('end-ellipsis'));
        pages.push(renderButton(totalPages));
      }
    }
    return pages;
  };

  const [jumpPage, setJumpPage] = useState('');

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onPageChange(p);
      setJumpPage('');
    }
  };

  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="px-6 py-4 bg-[var(--bg-elevated)]/20 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-xs font-medium text-[var(--text-muted)]">
        Showing <span className="text-[var(--text-primary)] font-bold">{start}</span> to <span className="text-[var(--text-primary)] font-bold">{end}</span> of <span className="text-[var(--text-primary)] font-bold">{totalCount}</span>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Jump to Page Search */}
        <form onSubmit={handleJump} className="flex items-center gap-1.5 mr-2">
          <Input
            type="text"
            placeholder="Page#"
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            className="w-16 h-9 px-2 text-xs font-bold text-center placeholder:font-medium placeholder:text-[var(--text-muted)]/50"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-600/20"
          >
            Go
          </Button>
        </form>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="w-9 h-9 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </Button>
          
          <div className="flex items-center gap-1">
            {renderPageButtons()}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="w-9 h-9 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
