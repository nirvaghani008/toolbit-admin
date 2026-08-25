'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export const PLAN_COLORS = {
  free: {
    light: {
      text: '#047857',
      bg: 'rgba(16, 185, 129, 0.06)',
      border: 'rgba(16, 185, 129, 0.15)',
      dot: '#10b981',
    },
    dark: {
      text: '#34d399',
      bg: 'rgba(16, 185, 129, 0.04)',
      border: 'rgba(16, 185, 129, 0.10)',
      dot: '#34d399',
    },
  },
  freemium: {
    light: {
      text: '#0369a1',
      bg: 'rgba(14, 165, 233, 0.06)',
      border: 'rgba(14, 165, 233, 0.15)',
      dot: '#0ea5e9',
    },
    dark: {
      text: '#38bdf8',
      bg: 'rgba(14, 165, 233, 0.04)',
      border: 'rgba(14, 165, 233, 0.10)',
      dot: '#38bdf8',
    },
  },
  paid: {
    light: {
      text: '#6d28d9',
      bg: 'rgba(139, 92, 246, 0.06)',
      border: 'rgba(139, 92, 246, 0.15)',
      dot: '#8b5cf6',
    },
    dark: {
      text: '#a78bfa',
      bg: 'rgba(139, 92, 246, 0.04)',
      border: 'rgba(139, 92, 246, 0.10)',
      dot: '#a78bfa',
    },
  },
} as const;

export type PlanCategory = 'free' | 'freemium' | 'paid';

export function getPlanCategory(val: any): PlanCategory {
  if (!val) return 'free';
  
  if (typeof val === 'object') {
    if (val.hasFreePlan && (val.hasPricing || val.pricing)) return 'freemium';
    if (val.hasFreePlan) return 'free';
    if (val.hasPricing) return 'paid';
    const candidate = val.pricingModel || val.pricing_type || val.plan || val.name || val.type || val.model || '';
    if (typeof candidate === 'string') {
      return getPlanCategory(candidate);
    }
  }

  const str = String(val).toLowerCase().trim();
  if (str.includes('freemium') || str.includes('free trial') || str.includes('trial')) {
    return 'freemium';
  }
  if (str.includes('paid') || str.includes('premium') || str.includes('subscription') || str.includes('pricing') || str.includes('one-time') || str.includes('contact')) {
    return 'paid';
  }
  if (str.includes('free') || str.includes('open source') || str.includes('community')) {
    return 'free';
  }

  return 'free';
}

export function formatPlanLabel(val: any): string {
  if (!val) return 'Free';
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return 'Free';
    // capitalize properly
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.pricingModel === 'string' && val.pricingModel) return val.pricingModel;
    if (typeof val.pricing_type === 'string' && val.pricing_type) return val.pricing_type;
    if (typeof val.plan === 'string' && val.plan) return val.plan;
    if (typeof val.name === 'string' && val.name) return val.name;
    if (typeof val.type === 'string' && val.type) return val.type;
    if (val.hasFreePlan && val.hasPricing) return 'Freemium';
    if (val.hasFreePlan) return 'Free';
    if (val.hasPricing) return 'Paid';
  }
  return 'Free';
}

export interface PlanBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  plan?: any;
  category?: PlanCategory;
  label?: string;
  showDot?: boolean;
  className?: string;
}

export default function PlanBadge({
  plan,
  category: explicitCategory,
  label: explicitLabel,
  showDot = true,
  className,
  ...props
}: PlanBadgeProps) {
  const category = explicitCategory || getPlanCategory(plan);
  const displayLabel = explicitLabel || formatPlanLabel(plan);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border transition-colors whitespace-nowrap shadow-2xs',
        category === 'free' &&
          'text-[#047857] bg-[rgba(16,185,129,0.06)] border-[rgba(16,185,129,0.15)] dark:text-[#34d399] dark:bg-[rgba(16,185,129,0.04)] dark:border-[rgba(16,185,129,0.10)]',
        category === 'freemium' &&
          'text-[#0369a1] bg-[rgba(14,165,233,0.06)] border-[rgba(14,165,233,0.15)] dark:text-[#38bdf8] dark:bg-[rgba(14,165,233,0.04)] dark:border-[rgba(14,165,233,0.10)]',
        category === 'paid' &&
          'text-[#6d28d9] bg-[rgba(139,92,246,0.06)] border-[rgba(139,92,246,0.15)] dark:text-[#a78bfa] dark:bg-[rgba(139,92,246,0.04)] dark:border-[rgba(139,92,246,0.10)]',
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            category === 'free' && 'bg-[#10b981] dark:bg-[#34d399]',
            category === 'freemium' && 'bg-[#0ea5e9] dark:bg-[#38bdf8]',
            category === 'paid' && 'bg-[#8b5cf6] dark:bg-[#a78bfa]'
          )}
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
