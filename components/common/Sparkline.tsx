'use client';

import React from 'react';

interface SparklineProps {
  color?: string;
  points?: number[];
  id?: string;
  isSelected?: boolean;
}

export default function Sparkline({
  color = '',
  points = [],
  id = '',
  isSelected = false,
}: SparklineProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden rounded-2xl transition-all duration-300 ${color}`}
      aria-hidden="true"
    >
      {/* ─── Ultra-Subtle Ambient Radial Glow (Soft corner aura) ─── */}
      <div
        className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl transition-opacity duration-300 ${
          isSelected
            ? 'opacity-[0.14] dark:opacity-[0.16]'
            : 'opacity-[0.035] group-hover:opacity-[0.07] dark:opacity-[0.05] dark:group-hover:opacity-[0.09]'
        }`}
        style={{ background: 'currentColor' }}
      />

      {/* ─── Very Subtle Bottom Ambient Wash ─── */}
      <div
        className={`absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-current/[0.025] to-transparent transition-opacity duration-300 ${
          isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-75'
        }`}
      />

      {/* ─── Faint Geometric Micro-Dot Matrix Accent in Bottom-Right Corner ─── */}
      <div
        className={`absolute bottom-1 right-1.5 w-16 h-12 transition-opacity duration-300 ${
          isSelected
            ? 'opacity-[0.09] dark:opacity-[0.12]'
            : 'opacity-[0.025] group-hover:opacity-[0.05] dark:opacity-[0.035] dark:group-hover:opacity-[0.07]'
        }`}
      >
        <svg viewBox="0 0 64 48" fill="none" className="w-full h-full text-current">
          <circle cx="56" cy="40" r="1.5" fill="currentColor" />
          <circle cx="42" cy="40" r="1.5" fill="currentColor" />
          <circle cx="28" cy="40" r="1.5" fill="currentColor" />
          <circle cx="56" cy="26" r="1.5" fill="currentColor" />
          <circle cx="42" cy="26" r="1.5" fill="currentColor" />
          <circle cx="56" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
