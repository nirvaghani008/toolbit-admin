'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Globe, Tag, CheckCircle2, HelpCircle, Layout, Share2, ThumbsUp, ThumbsDown, XCircle, Bookmark, ChevronDown } from 'lucide-react';
import PlanBadge from '@/components/common/PlanBadge';

interface ToolPreviewModalProps {
  tool: any;
  onClose: () => void;
}

const formatToolMarkdownToHTML = (text: string) => {
  if (!text) return '';

  // If text is already pure HTML block markup (<p>, <h3>, etc.), return as-is
  if (/^<(p|div|h[1-6]|ul|ol)/i.test(text.trim())) {
    return text;
  }

  let formatted = text.replace(/\r\n/g, '\n');

  // Headers: ###, ##, #
  formatted = formatted.replace(/^### (.*$)/gm, '<h3 class="text-lg font-extrabold text-slate-900 dark:text-zinc-100 mt-6 mb-2">$1</h3>');
  formatted = formatted.replace(/^## (.*$)/gm, '<h2 class="text-xl font-black text-slate-900 dark:text-zinc-100 mt-8 mb-3">$1</h2>');
  formatted = formatted.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-black text-slate-900 dark:text-zinc-100 mt-8 mb-4">$1</h1>');

  // Bold & Italic
  formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-slate-100">$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Process lists and paragraphs line by line
  const lines = formatted.split('\n');
  const output: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (inList) {
        output.push('</ul>');
        inList = false;
      }
      continue;
    }

    const listMatch = line.match(/^[-*•]\s+(.*)/);
    const isHtml = /^<(h[1-6]|ul|ol|p|div)/i.test(line);

    if (listMatch) {
      if (!inList) {
        output.push('<ul class="list-disc pl-5 space-y-2 my-4">');
        inList = true;
      }
      output.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) {
        output.push('</ul>');
        inList = false;
      }
      if (isHtml) {
        output.push(line);
      } else {
        output.push(`<p class="mb-4 leading-relaxed">${line}</p>`);
      }
    }
  }

  if (inList) {
    output.push('</ul>');
  }

  return output.join('\n');
};

import ToolLogo from '@/components/common/ToolLogo';


export default function ToolPreviewModal({ tool, onClose }: ToolPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'proscons' | 'faq'>('overview');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!tool || !mounted) return null;

  const info = tool.tool_info || {};
  const isNewModel = !!info.overview;
  
  const rawOverview = isNewModel ? (info.overview || '') : (info.shortDescription || '');
  const formattedOverview = formatToolMarkdownToHTML(rawOverview);
  
  const categories = info.categories || [];
  const tags = info.tags || info.hashtags || [];
  const pricing = info.pricing || {};
  const pricingType = info.pricingModel || pricing.model || pricing.pricingModel || tool.pricing_type || 'Free';
  const plans = pricing.plans || [];
  const faqs = info.faq || [];
  const pros = info.prosAndCons?.pros || [];
  const cons = info.prosAndCons?.cons || [];
  const integrations = info.integrations || tool.integrations || [];
  const isPaid = tool.is_paid === true || tool.is_paid === 'TRUE' || tool.isPaid === true || tool.isPaid === 'TRUE' || info.is_paid === true || info.is_paid === 'TRUE' || info.isPaid === true || info.isPaid === 'TRUE';

  // Dynamic social links extraction & deduplication
  const extractSocialLinks = () => {
    const socials: { platform: string; url: string }[] = [];
    const rawSocial = info.importantLinks?.socialMedia || info.socialMedia || info.social_media || info.social_links || tool.social_links || tool.socialMedia || {};

    if (Array.isArray(rawSocial)) {
      rawSocial.forEach((s: any) => {
        if (s && s.url && typeof s.url === 'string' && s.url.trim() !== '') {
          socials.push({ platform: (s.platform || 'website').toLowerCase(), url: s.url.trim() });
        }
      });
    } else if (typeof rawSocial === 'object' && rawSocial !== null) {
      Object.entries(rawSocial).forEach(([key, val]) => {
        if (typeof val === 'string' && val.trim() !== '') {
          socials.push({ platform: key.toLowerCase(), url: val.trim() });
        }
      });
    }

    const seen = new Set<string>();
    return socials.filter(s => {
      if (seen.has(s.platform)) return false;
      seen.add(s.platform);
      return true;
    });
  };

  const activeSocials = extractSocialLinks();

  const renderSocialIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('twitter') || p === 'x') {
      return (
        <svg className="w-4 h-4 text-slate-700 dark:text-zinc-200 hover:text-black dark:hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    }
    if (p.includes('linkedin')) {
      return (
        <svg className="w-4 h-4 text-slate-700 dark:text-zinc-200 hover:text-[#0a66c2] transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.72a1.47 1.47 0 1 0 0 2.94 1.47 1.47 0 0 0 0-2.94Z" />
        </svg>
      );
    }
    if (p.includes('youtube')) {
      return (
        <svg className="w-4 h-4 text-slate-700 dark:text-zinc-200 hover:text-[#ff0000] transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    }
    if (p.includes('instagram')) {
      return (
        <svg className="w-4 h-4 text-slate-700 dark:text-zinc-200 hover:text-[#e4405f] transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    }
    if (p.includes('facebook')) {
      return (
        <svg className="w-4 h-4 text-slate-700 dark:text-zinc-200 hover:text-[#1877f2] transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    }
    return <Globe size={16} className="text-slate-700 dark:text-zinc-200 hover:text-slate-900 transition-colors" />;
  };

  const getOriginalToolSiteUrl = (t: any): string => {
    if (!t) return '#';
    const info = t.tool_info || {};
    let raw =
      t.tool_site_url ||
      t.website_url ||
      t.tool_url ||
      info.tool_site_url ||
      info.website_url ||
      info.websiteUrl ||
      info.url ||
      info.platforms?.web;

    if (typeof raw === 'string' && raw.trim()) {
      const clean = raw.trim();
      return clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
    }
    return '#';
  };

  // Helper to extract & format plan price string from live DB data
  const getPlanPrice = (plan: any) => {
    if (!plan) return '$0 / free';
    if (plan.price) return typeof plan.price === 'string' && plan.price.includes('/') ? plan.price : `$${plan.price.toString().replace('$', '')} / monthly`;
    if (plan.amount) return `$${plan.amount.toString().replace('$', '')} / monthly`;
    if (plan.cost) return `$${plan.cost.toString().replace('$', '')} / monthly`;
    if (plan.price_amount || plan.priceAmount) return `$${plan.price_amount || plan.priceAmount} / monthly`;
    if (plan.priceText) return plan.priceText;
    if (plan.monthly_price) return `$${plan.monthly_price} / monthly`;
    if (plan.rate) return `$${plan.rate} / monthly`;
    return '$19.99 / monthly';
  };

  const modalJSX = (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#f9f8f6] dark:bg-zinc-950 w-full max-w-[1280px] max-h-[92vh] rounded-2xl md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="ml-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Live Website Tool Preview Mode</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 rounded-full transition-all cursor-pointer"
            title="Close Preview"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-8">
          
          {/* 1. Hero Header Banner */}
          <div className="relative overflow-hidden bg-gradient-to-r from-zinc-100/90 via-zinc-50/70 to-zinc-100/90 dark:from-zinc-900/60 dark:via-zinc-950 dark:to-zinc-900/60 rounded-3xl p-6 md:p-8 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs flex flex-col lg:flex-row gap-8 items-center justify-between">
            
            {/* Animated Constellation & Glow Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
              <style>{`
                @keyframes orbitTravel {
                  0% { stroke-dashoffset: 0; }
                  100% { stroke-dashoffset: -3000; }
                }
                @keyframes orbitRotate {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                .hero-orbit-spin {
                  transform-origin: 750px 200px;
                  animation: orbitRotate 30s linear infinite;
                }
                .hero-line-travel-1 {
                  stroke-dasharray: 400 1200;
                  animation: orbitTravel 16s linear infinite;
                }
                .hero-line-travel-2 {
                  stroke-dasharray: 500 1500;
                  animation: orbitTravel 22s linear infinite;
                }
                .hero-line-travel-3 {
                  stroke-dasharray: 600 1800;
                  animation: orbitTravel 28s linear infinite;
                }
              `}</style>
              <svg className="absolute w-full h-full opacity-60 dark:opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="none">
                {/* Intersecting Solid Diagonal Constellation Lines */}
                <line x1="-50" y1="40" x2="1050" y2="360" stroke="rgba(161, 161, 170, 0.35)" strokeWidth="1" />
                <line x1="-50" y1="40" x2="1050" y2="360" stroke="rgba(113, 113, 122, 0.5)" strokeWidth="1.5" className="hero-line-travel-1" />

                <line x1="-50" y1="280" x2="850" y2="-50" stroke="rgba(161, 161, 170, 0.3)" strokeWidth="1" />
                <line x1="-50" y1="280" x2="850" y2="-50" stroke="rgba(113, 113, 122, 0.45)" strokeWidth="1.5" className="hero-line-travel-2" />

                <line x1="180" y1="-50" x2="1050" y2="390" stroke="rgba(161, 161, 170, 0.25)" strokeWidth="1" />
                <line x1="80" y1="450" x2="950" y2="-50" stroke="rgba(161, 161, 170, 0.25)" strokeWidth="1" />

                {/* Rotating Orbital Circles Group (Rounding orbit animation) */}
                <g className="hero-orbit-spin">
                  {/* Base Track Circles */}
                  <circle cx="750" cy="200" r="260" fill="none" stroke="rgba(161, 161, 170, 0.3)" strokeWidth="1" />
                  <circle cx="750" cy="200" r="360" fill="none" stroke="rgba(161, 161, 170, 0.25)" strokeWidth="1" />
                  <circle cx="750" cy="200" r="460" fill="none" stroke="rgba(161, 161, 170, 0.2)" strokeWidth="1" />

                  {/* Traveling Glowing Rounding Orbit Lines */}
                  <circle cx="750" cy="200" r="260" fill="none" stroke="rgba(113, 113, 122, 0.6)" strokeWidth="1.5" className="hero-line-travel-1" />
                  <circle cx="750" cy="200" r="360" fill="none" stroke="rgba(113, 113, 122, 0.55)" strokeWidth="1.5" className="hero-line-travel-2" />
                  <circle cx="750" cy="200" r="460" fill="none" stroke="rgba(113, 113, 122, 0.5)" strokeWidth="1.5" className="hero-line-travel-3" />

                  {/* Vector 4-point Sparkle Star Accents Orbiting with the Rings */}
                  <g transform="translate(180, 110)">
                    <path d="M0,-8 Q0,0 8,0 Q0,0 0,8 Q0,0 -8,0 Q0,0 0,-8 Z" fill="#71717a" />
                  </g>
                  <g transform="translate(320, 220)">
                    <path d="M0,-5 Q0,0 5,0 Q0,0 0,5 Q0,0 -5,0 Q0,0 0,-5 Z" fill="#71717a" />
                  </g>
                  <g transform="translate(560, 310)">
                    <path d="M0,-6 Q0,0 6,0 Q0,0 0,6 Q0,0 -6,0 Q0,0 0,-6 Z" fill="#71717a" />
                  </g>
                  <g transform="translate(680, 70)">
                    <path d="M0,-7 Q0,0 7,0 Q0,0 0,7 Q0,0 -7,0 Q0,0 0,-7 Z" fill="#71717a" />
                  </g>
                </g>
              </svg>
              
              {/* Glowing Blur Orbs */}
              <div className="absolute -top-16 -left-16 w-64 h-64 bg-zinc-200/40 dark:bg-zinc-700/20 rounded-full blur-3xl animate-pulse" />
              <div className="absolute -bottom-16 right-1/3 w-64 h-64 bg-zinc-300/30 dark:bg-zinc-700/20 rounded-full blur-3xl animate-pulse delay-700" />
            </div>

            {/* Left Header Metadata */}
            <div className="relative z-10 flex-1 space-y-6 w-full">
              <div className="flex items-start gap-4">
                <ToolLogo
                  tool={tool}
                  toolName={info.toolName || tool.title || tool.name || 'Unnamed'}
                  className="w-14 h-14 bg-white dark:bg-zinc-800 rounded-2xl shadow-md border border-slate-100 dark:border-zinc-700 p-2 shrink-0"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-2">
                      <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none">{info.toolName || tool.title}</h1>
                      
                      {/* 12-Lobed Scalloped Blue Verified Badge */}
                      {isPaid && (
                        <span className="inline-flex items-center justify-center shrink-0 self-center" title="Verified Tool">
                          <svg className="w-5 h-5 md:w-5.5 md:h-5.5 shrink-0" viewBox="0 0 24 24" fill="none">
                            <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.79-4-4-4-.495 0-.965.084-1.4.238C14.55 2.475 13.18 1.6 11.6 1.6c-1.58 0-2.95.875-3.6 2.148-.435-.154-.905-.238-1.4-.238-2.21 0-4 1.79-4 4 0 .495.084.965.238 1.4C1.575 9.55.7 10.92.7 12.5c0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.79 4 4 4 .495 0 .965-.084 1.4-.238.65 1.273 2.02 2.148 3.6 2.148 1.58 0 2.95-.875 3.6-2.148.435.154.905.238 1.4.238 2.21 0 4-1.79 4-4 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6z" fill="#1d9bf0" />
                            <path d="M9.86 16.5a1 1 0 0 1-.707-.293l-3.36-3.36a1 1 0 1 1 1.414-1.414l2.653 2.653 6.84-6.84a1 1 0 1 1 1.414 1.414l-7.547 7.547a1 1 0 0 1-.707.293z" fill="#ffffff" />
                          </svg>
                        </span>
                      )}
                    </div>

                    <PlanBadge plan={pricingType} />
                  </div>
                  <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-300 font-normal leading-relaxed max-w-xl">
                    {info.tagline || tool.description}
                  </p>
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="text-zinc-400">📊</span> 204.3m monthly visits
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" /> free version available
                </span>
              </div>

              {/* Categories Row */}
              {categories.length > 0 && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Layout size={15} className="text-zinc-400 shrink-0" />
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat: string, cIdx: number) => (
                      <span key={cIdx} className="px-3.5 py-1 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a 
                  href={getOriginalToolSiteUrl(tool)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-full font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  Visit website <ExternalLink size={14} />
                </a>
                <button className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-all shadow-2xs cursor-pointer">
                  ▲ Upvote 2
                </button>
                <button className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-all shadow-2xs cursor-pointer">
                  <Bookmark size={14} /> Saved ▾
                </button>
                <button className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full font-semibold text-xs hover:bg-zinc-100 dark:hover:bg-slate-700 transition-all shadow-2xs cursor-pointer">
                  Compare
                </button>
                <button className="px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-all shadow-2xs cursor-pointer">
                  <Share2 size={14} /> Share
                </button>
              </div>

              {/* Social Links */}
              <div className="pt-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <span>OFFICIAL SOCIALS:</span>
                <div className="flex items-center gap-2">
                  {activeSocials.length > 0 ? (
                    activeSocials.map((soc, idx) => (
                      <a 
                        key={idx} 
                        href={soc.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        title={soc.platform.toUpperCase()}
                        className="p-1 hover:bg-zinc-200/60 dark:hover:bg-slate-800 rounded-lg transition-all"
                      >
                        {renderSocialIcon(soc.platform)}
                      </a>
                    ))
                  ) : (
                    <a 
                      href={getOriginalToolSiteUrl(tool)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      title="Official Website"
                      className="p-1 hover:bg-zinc-200/60 dark:hover:bg-slate-800 rounded-lg transition-all"
                    >
                      <Globe size={16} className="text-zinc-700 dark:text-zinc-200" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right Screen Screenshot Frame */}
            {tool.tool_screenshot_url && (
              <div className="relative z-10 w-full lg:w-[420px] shrink-0">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md overflow-hidden aspect-[16/10] relative group p-1">
                  <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 rounded-t-xl">
                    <div className="w-2 h-2 rounded-full bg-rose-400" />
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <img src={tool.tool_screenshot_url} className="w-full h-full object-cover rounded-b-xl" alt={info.toolName} />
                </div>
              </div>
            )}
          </div>

          {/* 2. Navigation Horizontal Tabs */}
          <div className="border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-8 text-sm">
            {(['overview', 'pricing', 'proscons', 'faq'] as const).map((tab) => {
              const labels: Record<string, string> = {
                overview: 'Overview',
                pricing: 'Pricing',
                proscons: 'Pros & cons',
                faq: 'Faq'
              };
              const isActive = activeTab === tab;
              return (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)} 
                  className={`pb-3 -mb-px transition-all font-semibold cursor-pointer ${
                    isActive 
                      ? 'border-b-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-zinc-100 font-bold' 
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-slate-500 dark:hover:text-slate-300 border-b-2 border-transparent'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* 3. Main Content & Sponsored Sidebar Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Content Area (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-6">
                  <div 
                    className="prose prose-zinc dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm md:text-base"
                    dangerouslySetInnerHTML={{ __html: formattedOverview }}
                  />

                  {/* Tags Section */}
                  {tags.length > 0 && (
                    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-400 flex items-center gap-1.5">
                        <Tag size={12} /> TAGS
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((t: string, i: number) => (
                          <span key={i} className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl underline underline-offset-2 decoration-zinc-400 dark:decoration-slate-500 cursor-pointer transition-all hover:bg-zinc-200/80">
                            {typeof t === 'string' ? t.replace(/^#/, '') : t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Integrations Section */}
                  {integrations.length > 0 && (
                    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-400 flex items-center gap-1.5">
                        <Share2 size={12} className="rotate-90" /> INTEGRATIONS
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {integrations.map((item: string, i: number) => (
                          <span key={i} className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700/60">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick AI Search */}
                  <div className="pt-4 space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-400">
                      ⚡ QUICK AI SEARCH (FOR MORE INFO)
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-slate-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 transition-all cursor-pointer">
                        • Ask ChatGPT ↗
                      </button>
                      <button className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-slate-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 transition-all cursor-pointer">
                        • Ask Perplexity ↗
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* PRICING TAB */}
              {activeTab === 'pricing' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {plans.length > 0 ? (
                      plans.map((plan: any, i: number) => {
                        const priceStr = getPlanPrice(plan);
                        const parts = priceStr.split('/');
                        const mainPrice = parts[0].trim();
                        const period = parts[1] ? `/ ${parts[1].trim()}` : '';

                        return (
                          <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
                            <div className="space-y-1 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                              <h4 className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white shrink-0" />
                                {plan.name || plan.title || 'Plan'}
                              </h4>
                              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 pt-1">
                                {mainPrice} <span className="text-xs text-zinc-400 font-normal">{period}</span>
                              </div>
                            </div>
                            <ul className="space-y-2 pt-1">
                              {(plan.features || plan.featureList || []).map((feat: string, j: number) => (
                                <li key={j} className="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
                                  <CheckCircle2 size={13} className="text-zinc-400 dark:text-zinc-400 shrink-0" /> {feat}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500 dark:text-zinc-400 text-sm col-span-2">
                        No pricing plans available. Visit official website for details.
                      </div>
                    )}
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <HelpCircle size={14} className="text-zinc-400" />
                    For the latest pricing details, please visit the official website ↗
                  </div>
                </div>
              )}

              {/* PROS & CONS TAB */}
              {activeTab === 'proscons' && (
                <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <ThumbsUp size={14} /> STRENGTHS ({pros.length})
                    </div>
                    <div className="space-y-3">
                      {pros.map((p: string, i: number) => (
                        <div key={i} className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-3">
                          <CheckCircle2 size={14} className="text-zinc-400 dark:text-zinc-400 shrink-0" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <ThumbsDown size={14} className="text-rose-500" /> WEAKNESSES ({cons.length})
                    </div>
                    <div className="space-y-3">
                      {cons.map((c: string, i: number) => (
                        <div key={i} className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-3">
                          <XCircle size={14} className="text-rose-500/80 shrink-0" />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* FAQ TAB */}
              {activeTab === 'faq' && (
                <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
                  {faqs.length > 0 ? (
                    faqs.map((faq: any, i: number) => {
                      const isOpen = openFaqIndex === i;
                      return (
                        <div key={i} className="bg-zinc-50/70 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60 overflow-hidden transition-all">
                          <button 
                            onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                            className="w-full p-5 flex items-center justify-between text-left font-bold text-zinc-900 dark:text-zinc-100 text-sm hover:bg-zinc-100/70 dark:hover:bg-zinc-800/80 transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-3 pr-4">
                              <span className="text-zinc-400 font-semibold">{i + 1}</span> 
                              <span>{faq.question || faq.q}</span>
                            </div>
                            <ChevronDown 
                              size={18} 
                              className={`text-zinc-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-zinc-700 dark:text-zinc-200' : ''}`} 
                            />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800/60 animate-in fade-in duration-150">
                              <p className="pl-6">{faq.answer || faq.a}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-zinc-500 dark:text-zinc-400 text-sm py-8">No FAQ items found.</div>
                  )}
                </div>
              )}

            </div>

            {/* Right Sponsored Sidebar (4 Cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-400 flex items-center gap-1.5">
                ⚡ SPONSORED
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500 text-white font-bold flex items-center justify-center text-xs">
                      .Ai
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">aidejuridique.ai</div>
                  </div>
                  <span className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-400"><ExternalLink size={14} /></span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  L&apos;aide juridique réinventée avec l&apos;IA
                </p>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-semibold rounded-md underline underline-offset-2 decoration-zinc-400 dark:decoration-slate-500">Chatbot</span>
                  <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-semibold rounded-md underline underline-offset-2 decoration-zinc-400 dark:decoration-slate-500">Legal</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}


