'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ExternalLink, FileText, Calendar, ChevronDown, Award
} from 'lucide-react';
import { Model } from './ModelTable';
import { Button } from '@/components/ui/button';

// ── Lightweight Markdown Renderer ────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');

  const renderInline = (text: string): React.ReactNode[] => {
    // Bold: **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-900 dark:text-zinc-100">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-base font-extrabold text-slate-900 dark:text-zinc-100 mt-5 mb-2 first:mt-0">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++; continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-slate-800 dark:text-zinc-200 mt-4 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++; continue;
    }

    // H4
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-xs font-bold text-slate-700 dark:text-zinc-300 mt-3 mb-1">
          {renderInline(line.slice(5))}
        </h4>
      );
      i++; continue;
    }

    // Table: collect all consecutive | lines
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Parse cells — skip separator row (---|---)
      const rows = tableLines
        .filter(l => !/^\s*\|[\s|:-]+\|\s*$/.test(l))
        .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
      if (rows.length > 0) {
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-800">
                  {rows[0].map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 text-left font-bold text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/40'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-slate-200 dark:border-zinc-700 my-3" />);
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed mb-2">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}
// ─────────────────────────────────────────────────────────────────────────────


interface ModelPreviewModalProps {
  model: Model;
  onClose: () => void;
}

function ModelFavicon({ model }: { model: Model }) {
  const getFaviconUrl = () => {
    if (model.favicon_url) return model.favicon_url;

    let domain = '';
    if (model.site_url) {
      try {
        domain = new URL(model.site_url.startsWith('http') ? model.site_url : `https://${model.site_url}`).hostname.replace('www.', '');
      } catch {
        // fallback
      }
    }

    if (!domain && model.provider) {
      const p = model.provider.toLowerCase();
      if (p.includes('openai')) domain = 'openai.com';
      else if (p.includes('anthropic') || p.includes('claude')) domain = 'anthropic.com';
      else if (p.includes('google') || p.includes('gemini')) domain = 'google.com';
      else if (p.includes('meta') || p.includes('llama')) domain = 'meta.com';
      else if (p.includes('mistral')) domain = 'mistral.ai';
      else if (p.includes('deepseek')) domain = 'deepseek.com';
      else if (p.includes('cohere')) domain = 'cohere.com';
      else if (p.includes('xai') || p.includes('grok')) domain = 'x.ai';
      else if (p.includes('stability')) domain = 'stability.ai';
      else domain = `${p.replace(/\s+/g, '')}.com`;
    }

    if (domain) {
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }
    return null;
  };

  const faviconUrl = getFaviconUrl();
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-md p-2 flex items-center justify-center shrink-0 overflow-hidden">
      {!hasError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={model.provider || 'Provider'}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain rounded-xl"
        />
      ) : (
        <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center text-indigo-500 font-extrabold text-sm">
          {model.provider ? model.provider.substring(0, 2).toUpperCase() : 'AI'}
        </div>
      )}
    </div>
  );
}

export default function ModelPreviewModal({ model, onClose }: ModelPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  const siteUrl = model.site_url ? (model.site_url.startsWith('http') ? model.site_url : `https://${model.site_url}`) : '#';
  const newsUrl = model.news_url ? (model.news_url.startsWith('http') ? model.news_url : `https://${model.news_url}`) : '#';

  // Format context length (e.g. 1,000,000 -> 1M, 128,000 -> 128K)
  const formatContextWindow = (ctx?: number) => {
    if (!ctx) return '1M tokens';
    if (ctx >= 1000000) return `${(ctx / 1000000).toFixed(0)}M tokens`;
    if (ctx >= 1000) return `${(ctx / 1000).toFixed(0)}K tokens`;
    return `${ctx} tokens`;
  };

  const formattedReleaseDate = model.release_date
    ? new Date(model.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  // --- Overview text: prefer model_info.overview, then Review/review, else null ---
  const overviewText: string | null =
    (model.model_info as any)?.overview ||
    model.Review ||
    model.review ||
    null;

  // --- Architecture: input/output modalities from DB ---
  const inputModalities: string[] = (model.architecture as any)?.input_modalities ?? ['text'];
  const outputModalities: string[] = (model.architecture as any)?.output_modalities ?? ['text'];

  const modalityIcon = (m: string) => {
    const lower = m.toLowerCase();
    if (lower === 'text') return { icon: 'T', color: 'bg-emerald-500/10 text-emerald-600' };
    if (lower === 'image') return { icon: '🖼', color: 'bg-sky-500/10 text-sky-600' };
    if (lower === 'file') return { icon: '📄', color: 'bg-purple-500/10 text-purple-600' };
    if (lower === 'video') return { icon: '🎬', color: 'bg-rose-500/10 text-rose-600' };
    if (lower === 'audio') return { icon: '🎵', color: 'bg-amber-500/10 text-amber-600' };
    return { icon: m[0].toUpperCase(), color: 'bg-slate-500/10 text-slate-600' };
  };

  // --- Pricing from benchmarks[0].pricing ---
  const pricing = (model.benchmarks as any)?.[0]?.pricing ?? null;
  const inputPrice: number | null = pricing?.price_1m_input_tokens ?? null;
  const outputPrice: number | null = pricing?.price_1m_output_tokens ?? null;
  const cachedPrice: number | null = pricing?.price_1m_cache_hit_tokens ?? null;

  const fmtPrice = (v: number | null) => {
    if (v === null || v === undefined) return null;
    if (v === 0) return 'Free';
    return `$${v}`;
  };

  // --- Evaluations from benchmarks[0].evaluations ---
  const evals = (model.benchmarks as any)?.[0]?.evaluations ?? {};

  const intelligenceIndex: number | null = evals.artificial_analysis_intelligence_index ?? null;
  const codingIndex: number | null = evals.artificial_analysis_coding_index ?? null;
  const agenticIndex: number | null = evals.artificial_analysis_agentic_index ?? null;

  const benchmarkRows: { name: string; score: string; pct: number }[] = [
    { key: 'gpqa', label: 'GPQA — Graduate Science' },
    { key: 'hle', label: "Humanity's Last Exam" },
    { key: 'scicode', label: 'SciCode — Scientific Coding' },
    { key: 'ifbench', label: 'Instruction Following' },
    { key: 'lcr', label: 'Long Context Retrieval' },
    { key: 'tau2', label: 'T²-Bench — Agentic Tasks' },
    { key: 'terminalbench_v2_1', label: 'TerminalBench — System Control' },
    { key: 'livecodebench', label: 'LiveCodeBench' },
    { key: 'math_500', label: 'MATH-500' },
    { key: 'mmlu_pro', label: 'MMLU Pro' },
  ]
    .filter(r => evals[(r as any).key] !== null && evals[(r as any).key] !== undefined)
    .map(r => {
      const raw = evals[(r as any).key];
      const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
      return { name: r.label, score: `${pct}%`, pct };
    });

  // --- Key capabilities from top_scores ---
  const topScores: Record<string, number> = (model.top_scores as any) ?? {};
  const CAPABILITY_LABELS: Record<string, string> = {
    coding: 'Coding',
    frontend_development: 'Frontend Dev',
    multimodal: 'Multimodal Inputs',
    vision: 'Visual Reasoning',
    healthcare: 'Medical Reasoning',
    reasoning: 'Reasoning',
    agents: 'Agentic Tasks',
    search: 'Search & Retrieval',
    general: 'General Intelligence',
    finance: 'Finance',
    math: 'Mathematics',
    tool_calling: 'Tool Calling',
    structured_output: 'Structured Output',
    code: 'Code Generation',
  };
  const keyCapabilities = Object.entries(topScores)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({
      title: CAPABILITY_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      rating: Math.round((v as number) * 100),
    }))
    .sort((a, b) => b.rating - a.rating);


  const modalJSX = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#fcfcfd] dark:bg-zinc-950 w-full max-w-[1280px] max-h-[92vh] rounded-2xl md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-slate-200/80 dark:border-zinc-800 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="ml-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Live Website Model Preview Mode</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-full transition-all"
            title="Close Preview"
            aria-label="Close Preview"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-8">

          {/* 1. Hero Header Banner Card */}
          <div className="relative overflow-hidden bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-purple-100/50 dark:from-purple-950/30 dark:via-slate-900 dark:to-indigo-950/40 rounded-3xl p-6 md:p-8 border border-purple-100/80 dark:border-zinc-800 shadow-sm flex flex-col lg:flex-row gap-8 items-center justify-between">

            {/* Animated Constellation & Glow Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
              <style>{`
                @keyframes orbitTravel {
                  0% { stroke-dashoffset: 0; }
                  100% { stroke-dashoffset: -1600; }
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
                @keyframes flowBeam {
                  0% { stroke-dashoffset: 0; }
                  100% { stroke-dashoffset: -360; }
                }
                .flow-path-base {
                  stroke-width: 2;
                  fill: none;
                }
                .flow-path-anim-1 {
                  stroke-width: 3;
                  fill: none;
                  stroke-dasharray: 60 120;
                  animation: flowBeam 5s linear infinite 0s;
                }
                .flow-path-anim-2 {
                  stroke-width: 3;
                  fill: none;
                  stroke-dasharray: 60 120;
                  animation: flowBeam 5s linear infinite -1.66s;
                }
                .flow-path-anim-3 {
                  stroke-width: 3;
                  fill: none;
                  stroke-dasharray: 60 120;
                  animation: flowBeam 5s linear infinite -3.33s;
                }
              `}</style>
              <svg className="absolute w-full h-full opacity-70 dark:opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="none">
                {/* Intersecting Solid Diagonal Constellation Lines */}
                <line x1="-50" y1="40" x2="1050" y2="360" stroke="rgba(216, 180, 254, 0.4)" strokeWidth="1" />
                <line x1="-50" y1="40" x2="1050" y2="360" stroke="rgba(192, 132, 252, 0.8)" strokeWidth="1.5" className="hero-line-travel-1" />

                <line x1="-50" y1="280" x2="850" y2="-50" stroke="rgba(192, 132, 252, 0.35)" strokeWidth="1" />
                <line x1="-50" y1="280" x2="850" y2="-50" stroke="rgba(232, 121, 249, 0.7)" strokeWidth="1.5" className="hero-line-travel-2" />

                <line x1="180" y1="-50" x2="1050" y2="390" stroke="rgba(168, 85, 247, 0.3)" strokeWidth="1" />
                <line x1="80" y1="450" x2="950" y2="-50" stroke="rgba(232, 121, 249, 0.3)" strokeWidth="1" />

                {/* Rotating Orbital Circles Group */}
                <g className="hero-orbit-spin">
                  {/* Base Track Circles */}
                  <circle cx="750" cy="200" r="260" fill="none" stroke="rgba(216, 180, 254, 0.35)" strokeWidth="1" />
                  <circle cx="750" cy="200" r="360" fill="none" stroke="rgba(192, 132, 252, 0.3)" strokeWidth="1" />
                  <circle cx="750" cy="200" r="460" fill="none" stroke="rgba(168, 85, 247, 0.25)" strokeWidth="1" />

                  {/* Traveling Glowing Rounding Orbit Lines */}
                  <circle cx="750" cy="200" r="260" fill="none" stroke="rgba(192, 132, 252, 0.9)" strokeWidth="1.5" className="hero-line-travel-1" />
                  <circle cx="750" cy="200" r="360" fill="none" stroke="rgba(168, 85, 247, 0.85)" strokeWidth="1.5" className="hero-line-travel-2" />
                  <circle cx="750" cy="200" r="460" fill="none" stroke="rgba(232, 121, 249, 0.8)" strokeWidth="1.5" className="hero-line-travel-3" />

                  {/* Vector 4-point Sparkle Star Accents Orbiting with the Rings */}
                  <g transform="translate(180, 110)">
                    <path d="M0,-8 Q0,0 8,0 Q0,0 0,8 Q0,0 -8,0 Q0,0 0,-8 Z" fill="#c084fc" />
                  </g>
                  <g transform="translate(320, 220)">
                    <path d="M0,-5 Q0,0 5,0 Q0,0 0,5 Q0,0 -5,0 Q0,0 0,-5 Z" fill="#a855f7" />
                  </g>
                  <g transform="translate(560, 310)">
                    <path d="M0,-6 Q0,0 6,0 Q0,0 0,6 Q0,0 -6,0 Q0,0 0,-6 Z" fill="#e879f9" />
                  </g>
                  <g transform="translate(680, 70)">
                    <path d="M0,-7 Q0,0 7,0 Q0,0 0,7 Q0,0 -7,0 Q0,0 0,-7 Z" fill="#c084fc" />
                  </g>
                </g>
              </svg>

              {/* Glowing Blur Orbs */}
              <div className="absolute -top-16 -left-16 w-64 h-64 bg-purple-300/30 dark:bg-purple-600/20 rounded-full blur-3xl animate-pulse" />
              <div className="absolute -bottom-16 right-1/3 w-64 h-64 bg-indigo-300/30 dark:bg-zinc-700/20 rounded-full blur-3xl animate-pulse delay-700" />
            </div>

            {/* Left Header Content */}
            <div className="relative z-10 flex-1 space-y-5 w-full">
              <div className="flex items-center gap-3">
                <ModelFavicon model={model} />
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                    {model.provider || 'AI Provider'}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {formattedReleaseDate && (
                      <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-semibold rounded-md flex items-center gap-1 border border-slate-200 dark:border-zinc-700">
                        <Calendar size={11} className="text-slate-400" /> Released {formattedReleaseDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-zinc-100 tracking-tight leading-tight">
                {model.name}
              </h1>

              <p className="text-sm md:text-base text-slate-600 dark:text-zinc-300 leading-relaxed max-w-2xl font-normal">
                {overviewText
                  ? overviewText.split('\n')[0].replace(/^#+\s*/, '')
                  : `${model.name} by ${model.provider || 'AI Provider'} — a frontier AI model.`}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <ExternalLink size={14} /> Visit {model.provider || 'Provider'}
                </a>
                {model.news_url && (
                  <a
                    href={newsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-white/90 dark:bg-zinc-800 border border-slate-200/90 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-2xl font-bold text-xs flex items-center gap-1.5 hover:bg-white transition-all shadow-2xs"
                  >
                    <FileText size={14} /> Announcement
                  </a>
                )}
              </div>
            </div>

            {/* Right Flow Diagram Card (Inputs & Outputs) */}
            {(() => {
              // Shared Y-center lookup (same table used by SVG paths)
              const yTable: Record<number, number[]> = {
                1: [70],
                2: [42, 98],
                3: [22, 70, 118],
                4: [14, 51, 89, 126],
                5: [10, 38, 70, 102, 130],
              };
              const getYs = (total: number) =>
                yTable[total] ?? Array.from({ length: total }, (_, i) =>
                  total <= 1 ? 70 : 10 + (i * 120) / (total - 1)
                );

              const inYs  = getYs(inputModalities.length);
              const outYs = getYs(outputModalities.length);

              // Card height: viewBox 140 units → 160px container
              const cardH = 160; // px, matches viewBox aspect
              const scale = cardH / 140; // 1.14 px per SVG unit

              return (
                <div className="relative z-10 w-full lg:w-[420px] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-3xl p-5 md:p-6 border border-slate-200/80 dark:border-zinc-800 shadow-md">

                  {/* ── Label row ── */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">INPUTS</div>
                    <div className="w-24 shrink-0" />
                    <div className="flex-1 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">OUTPUTS</div>
                  </div>

                  {/* ── Badge + SVG row — all three share the same top origin ── */}
                  <div className="flex items-start" style={{ height: `${cardH}px` }}>

                    {/* Inputs badges */}
                    <div className="flex-1 relative h-full">
                      {inputModalities.map((m, i) => {
                        const { icon, color } = modalityIcon(m);
                        const topPx = inYs[i] * scale - 18;
                        return (
                          <div
                            key={m}
                            className="absolute left-0 right-0 px-3 py-2 bg-slate-50 dark:bg-zinc-800/80 rounded-xl border border-slate-200/80 dark:border-zinc-700 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-200 shadow-2xs"
                            style={{ top: `${topPx}px` }}
                          >
                            <span className={`w-5 h-5 rounded-md ${color} flex items-center justify-center font-serif text-xs font-black shrink-0`}>{icon}</span>
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </div>
                        );
                      })}
                    </div>

                    {/* SVG lines */}
                    <div className="w-24 shrink-0 h-full">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 128 140" fill="none">
                        <defs>
                          <linearGradient id="gradientFlow0" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#a855f7" />
                          </linearGradient>
                          <linearGradient id="gradientFlow1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#0284c7" />
                            <stop offset="100%" stopColor="#a855f7" />
                          </linearGradient>
                          <linearGradient id="gradientFlow2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#ec4899" />
                          </linearGradient>
                          <linearGradient id="gradientFlow3" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#10b981" />
                          </linearGradient>
                          <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>
                        {inputModalities.map((_, i) =>
                          outputModalities.map((_, j) => {
                            const y1 = inYs[i];
                            const y2 = outYs[j];
                            const pathD = Math.abs(y1 - y2) < 2
                              ? `M 0,${y1} L 128,${y2}`
                              : `M 0,${y1} C 64,${y1} 64,${y2} 128,${y2}`;
                            const gradId    = `gradientFlow${(i + j) % 4}`;
                            const animClass = `flow-path-anim-${(i % 3) + 1}`;
                            return (
                              <g key={`path-${i}-${j}`}>
                                <path d={pathD} stroke="rgba(203, 213, 225, 0.4)" className="flow-path-base" />
                                <path d={pathD} stroke={`url(#${gradId})`} className={animClass} filter="url(#glowFilter)" />
                              </g>
                            );
                          })
                        )}
                      </svg>
                    </div>

                    {/* Outputs badges */}
                    <div className="flex-1 relative h-full">
                      {outputModalities.map((m, i) => {
                        const { icon, color } = modalityIcon(m);
                        const topPx = outYs[i] * scale - 18;
                        return (
                          <div
                            key={m}
                            className="absolute left-0 right-0 px-3 py-2 bg-slate-50 dark:bg-zinc-800/80 rounded-xl border border-slate-200/80 dark:border-zinc-700 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-200 shadow-2xs"
                            style={{ top: `${topPx}px` }}
                          >
                            <span className={`w-5 h-5 rounded-md ${color} flex items-center justify-center font-serif text-xs font-black shrink-0`}>{icon}</span>
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>
              );
            })()}

          </div>

          {/* 2. Main Content Grid (8 Cols Left, 4 Cols Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Left Content Column (8 Cols) */}
            <div className="lg:col-span-8 space-y-6">

              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">Model Overview</h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-normal">Capabilities, design details, and architectural traits</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                  {overviewText ? (
                    <>
                      <div className={showFullOverview ? '' : 'max-h-[420px] overflow-hidden relative'}>
                        <MarkdownContent content={overviewText} />
                        {!showFullOverview && overviewText.length > 600 && (
                          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-[#151c2c] to-transparent pointer-events-none" />
                        )}
                      </div>
                      {overviewText.length > 600 && (
                        <div className="pt-3 text-center">
                          <button
                            onClick={() => setShowFullOverview(!showFullOverview)}
                            className="px-5 py-2 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 text-slate-700 dark:text-zinc-200 text-xs font-bold rounded-2xl border border-slate-200/80 dark:border-zinc-700 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            {showFullOverview ? 'Show Less' : 'Read Full Overview'}
                            <ChevronDown size={14} className={`transition-transform ${showFullOverview ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-zinc-400 py-2">
                      No overview available for this model yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Benchmark Performance Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                    <Award size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-zinc-100">Benchmark Performance</h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-normal">Independent evaluations · Artificial Analysis</p>
                  </div>
                </div>

                {/* 3 Circular Index Gauges */}
                {(intelligenceIndex !== null || codingIndex !== null || agenticIndex !== null) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {[
                      { label: 'INTELLIGENCE', value: intelligenceIndex, color: 'border-t-indigo-600 border-indigo-500/20' },
                      { label: 'CODING INDEX', value: codingIndex, color: 'border-t-emerald-500 border-emerald-500/20' },
                      { label: 'AGENTIC INDEX', value: agenticIndex, color: 'border-t-purple-500 border-purple-500/20' },
                    ].map((g) =>
                      g.value !== null ? (
                        <div key={g.label} className="p-6 bg-slate-50/80 dark:bg-zinc-800/40 rounded-3xl border border-slate-200/60 dark:border-zinc-700/60 text-center space-y-3">
                          <div className={`w-24 h-24 rounded-full border-[5px] ${g.color} mx-auto flex items-center justify-center font-black text-xl text-slate-900 dark:text-zinc-100`}>
                            {g.value.toFixed(1)}%
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">{g.label}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                )}

                {/* Progress Bar Benchmark List */}
                {benchmarkRows.length > 0 ? (
                  <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">ACCURACY & CAPABILITY DETAILS</div>
                    <div className="space-y-3">
                      {benchmarkRows.map((b, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200">
                            <span>{b.name}</span>
                            <span>{b.score}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-500"
                              style={{ width: `${b.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>ⓘ</span> Independent evaluation data provided by <strong className="text-slate-700 dark:text-zinc-300">Artificial Analysis</strong>.
                    </div>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 text-sm text-slate-400 text-center py-4">
                    No benchmark evaluations available for this model yet.
                  </div>
                )}
              </div>

            </div>

            {/* Right Column Specs & Ratings (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">

              {/* Specs Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">SPECS</div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  <div className="py-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-500 dark:text-zinc-400">Context window</span>
                    <span className="font-extrabold text-slate-900 dark:text-zinc-100">{formatContextWindow(model.context_length ?? undefined)}</span>
                  </div>
                  {fmtPrice(inputPrice) && (
                    <div className="py-3 flex items-center justify-between">
                      <span className="font-semibold text-slate-500 dark:text-zinc-400">Input pricing</span>
                      <div className="text-right">
                        <div className="font-extrabold text-slate-900 dark:text-zinc-100">{fmtPrice(inputPrice)}</div>
                        {inputPrice !== 0 && <div className="text-[9px] text-slate-400">per 1M tokens</div>}
                      </div>
                    </div>
                  )}
                  {fmtPrice(outputPrice) && (
                    <div className="py-3 flex items-center justify-between">
                      <span className="font-semibold text-slate-500 dark:text-zinc-400">Output pricing</span>
                      <div className="text-right">
                        <div className="font-extrabold text-slate-900 dark:text-zinc-100">{fmtPrice(outputPrice)}</div>
                        {outputPrice !== 0 && <div className="text-[9px] text-slate-400">per 1M tokens</div>}
                      </div>
                    </div>
                  )}
                  {fmtPrice(cachedPrice) && (
                    <div className="py-3 flex items-center justify-between">
                      <span className="font-semibold text-slate-500 dark:text-zinc-400">Cached input</span>
                      <div className="text-right">
                        <div className="font-extrabold text-slate-900 dark:text-zinc-100">{fmtPrice(cachedPrice)}</div>
                        {cachedPrice !== 0 && <div className="text-[9px] text-slate-400">per 1M tokens</div>}
                      </div>
                    </div>
                  )}
                  {model.knowledge_cutoff && (
                    <div className="py-3 flex items-center justify-between">
                      <span className="font-semibold text-slate-500 dark:text-zinc-400">Knowledge cutoff</span>
                      <span className="font-extrabold text-slate-900 dark:text-zinc-100">{model.knowledge_cutoff}</span>
                    </div>
                  )}
                </div>

                {pricing && <div className="pt-2 text-[10px] text-slate-400">Prices in USD via OpenRouter.</div>}
              </div>

              {/* Key Capabilities & Ratings Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-slate-700 dark:text-zinc-300" />
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100">Key Capabilities & Ratings</h4>
                </div>

                {keyCapabilities.length > 0 ? (
                  <div className="space-y-4 pt-1">
                    {(showAllRatings ? keyCapabilities : keyCapabilities.slice(0, 5)).map((cap, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200">
                          <span>{cap.title}</span>
                          <span>{cap.rating}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-500"
                            style={{ width: `${cap.rating}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {keyCapabilities.length > 5 && (
                      <div className="pt-2 text-center">
                        <button
                          onClick={() => setShowAllRatings(!showAllRatings)}
                          className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 transition-all cursor-pointer"
                        >
                          {showAllRatings ? 'SHOW LESS ▴' : `SHOW ALL (${keyCapabilities.length}) ▾`}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-2">No capability scores available yet.</p>
                )}
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}

