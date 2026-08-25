'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Clock, User, Copy, Check, Mail, List, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface BlogPreviewModalProps {
  blog: any;
  onClose: () => void;
}

const extractHeadingsAndAssignIds = (html: string) => {
  const headings: { id: string; text: string; level: number }[] = [];
  let index = 0;

  const processedHtml = html.replace(/<(h[23])([^>]*)>(.*?)<\/h[23]>/gi, (match, tag, attrs, content) => {
    const level = tag.toLowerCase() === 'h2' ? 2 : 3;
    const cleanText = content.replace(/<[^>]+>/g, '').trim();
    if (!cleanText) return match;

    const id = `preview-heading-${index++}`;
    headings.push({ id, text: cleanText, level });
    return `<${tag} id="${id}" ${attrs}>${content}</${tag}>`;
  });

  return { processedHtml, headings };
};


const formatMarkdownToHTML = (text: string) => {
  if (!text) return '';

  let str = text.trim();

  // If text is already pure HTML block content, return as-is
  const isPureHTML = /^\s*<(p|div|h[1-6]|table|ul|ol|blockquote|section|article)\b/i.test(str) &&
    !/(?:^|\n)#+\s|(?:^|\n)```|(?:^|\n)\|.*\|/m.test(str);

  if (isPureHTML) {
    return str;
  }

  // Standardize line endings
  str = str.replace(/\r\n/g, '\n');

  // STEP 1: Protect Code Blocks ```lang ... ```
  const codeBlocks: string[] = [];
  str = str.replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (_, lang, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
    const languageLabel = lang ? lang.trim() : '';
    codeBlocks.push(
      `<div class="my-6 rounded-2xl overflow-hidden border border-slate-700/80 bg-[#0d1117] shadow-xl">
        ${languageLabel ? `<div class="px-4 py-2 bg-[#161b22] border-b border-slate-800 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">${languageLabel}</div>` : ''}
        <pre class="p-4 text-xs md:text-sm font-mono leading-relaxed text-emerald-400 overflow-x-auto custom-scrollbar"><code>${escapedCode.trim()}</code></pre>
      </div>`
    );
    return `\n\n${placeholder}\n\n`;
  });

  // STEP 2: Protect Inline Code `code`
  const inlineCodes: string[] = [];
  str = str.replace(/`([^`]+)`/g, (_, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `___INLINE_CODE_${inlineCodes.length}___`;
    inlineCodes.push(
      `<code class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono text-[0.85em] border border-slate-200 dark:border-slate-700/60 font-semibold">${escaped}</code>`
    );
    return placeholder;
  });

  // STEP 3: Images ![alt](url "title")
  str = str.replace(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)"|)\)/g, (_, alt, url, title) => {
    return `<div class="my-8 flex flex-col items-center justify-center"><img src="${url}" alt="${alt || ''}" title="${title || ''}" class="rounded-2xl border border-slate-200 dark:border-slate-800 max-w-full shadow-md cursor-pointer hover:opacity-95 transition-opacity" /></div>`;
  });

  // STEP 4: Links [text](url "title")
  str = str.replace(/\[(.*?)\]\((.*?)(?:\s+"(.*?)"|)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">$1</a>');

  // STEP 5: Metadata / Key Labels
  const metaLabels = ['Pricing:', 'Current Pricing:', 'Best For:', 'Standout Feature:', 'Plan:', 'Price:', 'Key Features:'];
  metaLabels.forEach(label => {
    const regex = new RegExp(label, 'g');
    str = str.replace(regex, `<span class="inline-block text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400 mr-2 py-0.5 px-2 bg-indigo-50 dark:bg-indigo-900/30 rounded border border-indigo-100 dark:border-indigo-800/50">${label}</span>`);
  });

  // STEP 6: Headings
  str = str.replace(/^######\s+(.*$)/gm, '<h6>$1</h6>');
  str = str.replace(/^#####\s+(.*$)/gm, '<h5>$1</h5>');
  str = str.replace(/^####\s+(.*$)/gm, '<h4>$1</h4>');
  str = str.replace(/^###\s+(.*$)/gm, '<h3>$1</h3>');
  str = str.replace(/^##\s+(.*$)/gm, '<h2>$1</h2>');
  str = str.replace(/^#\s+(.*$)/gm, '<h1>$1</h1>');

  // STEP 7: Horizontal Rules
  str = str.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr>');

  // STEP 8: Bold, Italic, Strikethrough, Subscript, Superscript
  str = str.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  str = str.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__(.*?)__/g, '<strong>$1</strong>');
  str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
  str = str.replace(/_(.*?)_/g, '<em>$1</em>');
  str = str.replace(/~~(.*?)~~/g, '<s>$1</s>');
  str = str.replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
  str = str.replace(/~([^~]+)~/g, '<sub>$1</sub>');

  // STEP 9: Blockquotes
  str = str.replace(/(?:^>\s*(.*$)\n?)+/gm, (match) => {
    const innerText = match.replace(/^>\s?/gm, '').replace(/\n/g, '<br>');
    return `<blockquote class="border-l-4 border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10 p-6 rounded-2xl not-italic text-slate-700 dark:text-slate-300 my-6">${innerText}</blockquote>\n`;
  });

  // STEP 10: Tables
  const renderInlineMd = (t: string) =>
    t
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<s>$1</s>');

  const processTableBlock = (tLines: string[]) => {
    if (tLines.length === 0) return '';
    let header: string[] = [];
    const body: string[][] = [];
    let headerSet = false;

    tLines.forEach((l) => {
      if (/^[|\s-:]+$/.test(l.trim())) return;
      let parts = l.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      if (parts.length > 0 && parts[0] === '') parts.shift();
      if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      if (parts.length === 0) return;

      if (!headerSet) {
        header = parts.map(renderInlineMd);
        headerSet = true;
      } else {
        body.push(parts.map(renderInlineMd));
      }
    });

    const headHtml = header.length > 0 ? `
      <thead class="bg-slate-50 dark:bg-slate-800/60">
        <tr>
          ${header.map((h, i) => `<th class="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 text-left align-middle bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 ${i === 0 ? 'rounded-tl-xl' : ''} ${i === header.length - 1 ? 'rounded-tr-xl' : ''}">${h}</th>`).join('')}
        </tr>
      </thead>` : '';

    return `
      <div class="my-5 overflow-x-auto custom-scrollbar">
        <table class="w-full border-separate border-spacing-0 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden text-left text-sm align-middle">
          ${headHtml}
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
            ${body.map(row => `
              <tr class="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                ${row.map(cell => `
                  <td class="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs md:text-sm leading-normal align-middle">
                    ${cell.replace(/•/g, '<br/>•')}
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const lines = str.split('\n');
  const resultLines: string[] = [];
  let tableBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('|') && !/^\[[^\]]+\]\([^)]+\)$/.test(line)) {
      tableBlockLines.push(line);
    } else {
      if (tableBlockLines.length > 0) {
        resultLines.push(processTableBlock(tableBlockLines));
        tableBlockLines = [];
      }
      resultLines.push(lines[i]);
    }
  }
  if (tableBlockLines.length > 0) {
    resultLines.push(processTableBlock(tableBlockLines));
  }

  str = resultLines.join('\n');

  // STEP 11: Line-by-Line Block Generation (Paragraphs, Headings, Lists, Dividers)
  const rawLines = str.split('\n');
  const outputBlocks: string[] = [];
  let currentListType: 'ul' | 'ol' | null = null;
  let currentListItems: { text: string; num?: number }[] = [];

  const flushList = () => {
    if (currentListType && currentListItems.length > 0) {
      if (currentListType === 'ol') {
        const startNum = currentListItems[0].num || 1;
        const listContent = currentListItems
          .map(item => `<li${item.num !== undefined ? ` value="${item.num}"` : ''}>${item.text}</li>`)
          .join('\n');
        outputBlocks.push(`<ol start="${startNum}">\n${listContent}\n</ol>`);
      } else {
        const listContent = currentListItems.map(item => `<li>${item.text}</li>`).join('\n');
        outputBlocks.push(`<ul>\n${listContent}\n</ul>`);
      }
      currentListItems = [];
      currentListType = null;
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const isHtmlBlock = /^<(h[1-6]|table|blockquote|div|ul|ol|p|li|hr|pre|section|article)[^>]*>/i.test(trimmed);

    const ulMatch = !isHtmlBlock && trimmed.match(/^[-*•]\s+(.*)/);
    const olMatch = !isHtmlBlock && trimmed.match(/^(\d+)\.\s+(.*)/);

    if (ulMatch) {
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      currentListItems.push({ text: ulMatch[1] });
    } else if (olMatch) {
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      const num = parseInt(olMatch[1], 10);
      currentListItems.push({ text: olMatch[2], num });
    } else {
      flushList();
      if (isHtmlBlock) {
        outputBlocks.push(trimmed);
      } else {
        outputBlocks.push(`<p>${trimmed}</p>`);
      }
    }
  }
  flushList();

  let finalHTML = outputBlocks.join('\n');

  // STEP 12: Restore Placeholders
  codeBlocks.forEach((cb, idx) => {
    finalHTML = finalHTML.replace(new RegExp(`<p>___CODE_BLOCK_${idx}___<\/p>`, 'g'), cb);
    finalHTML = finalHTML.replace(new RegExp(`___CODE_BLOCK_${idx}___`, 'g'), cb);
  });

  inlineCodes.forEach((ic, idx) => {
    finalHTML = finalHTML.replace(new RegExp(`___INLINE_CODE_${idx}___`, 'g'), ic);
  });

  return finalHTML;
};


export default function BlogPreviewModal({ blog, onClose }: BlogPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [isTocOpen, setIsTocOpen] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute rendered HTML and extract H2/H3 headings
  const rawHtml = useMemo(() => formatMarkdownToHTML(blog?.content_mdx || ''), [blog?.content_mdx]);
  const { processedHtml, headings } = useMemo(() => extractHeadingsAndAssignIds(rawHtml), [rawHtml]);

  // Set default active heading to first heading
  useEffect(() => {
    if (headings.length > 0 && !activeHeadingId) {
      setActiveHeadingId(headings[0].id);
    }
  }, [headings, activeHeadingId]);

  // Scroll active observer for table of contents
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
          }
        });
      },
      { root: containerRef.current, rootMargin: '-40px 0px -70% 0px', threshold: 0.1 }
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [processedHtml, headings]);

  if (!blog || !mounted) return null;

  const scrollToHeading = (id: string) => {
    setActiveHeadingId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const url = blog.slug ? `${window.location.origin}/blog/${blog.slug}` : window.location.href;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareUrl = typeof window !== 'undefined' ? encodeURIComponent(blog.slug ? `${window.location.origin}/blog/${blog.slug}` : window.location.href) : '';
  const shareTitle = encodeURIComponent(blog.title || '');

  const categories = Array.isArray(blog.categories)
    ? blog.categories
    : typeof blog.categories === 'string'
      ? blog.categories.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];

  const formattedDate = blog.published_at || blog.updated_at || blog.created_at
    ? new Date(blog.published_at || blog.updated_at || blog.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'July 27, 2026';

  const readingTime = blog.reading_time_minutes || 5;

  const modalJSX = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div 
        className="bg-[#f8fafc] dark:bg-[#0b0f19] w-full max-w-[1240px] max-h-[90vh] rounded-2xl md:rounded-[28px] shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="px-6 py-3.5 bg-white dark:bg-[#151c2c] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="ml-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Live Blog Preview Mode</span>
          </div>
          <Button 
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
            title="Close Preview"
            aria-label="Close Preview"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Scrollable Main Article Container */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8fafc] dark:bg-[#0b0f19] px-4 md:px-10 pt-8 md:pt-10 pb-12"
        >
          <main className="max-w-[1100px] mx-auto">
            
            {/* 1. Header Section (Centered) */}
            <header className="text-center space-y-4 mb-8">
              {/* Category Badges */}
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {categories.map((cat: string, i: number) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="px-3.5 py-1 bg-white dark:bg-[#151c2c] text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-full border border-slate-200 dark:border-slate-700 shadow-2xs"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Main Title */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-black tracking-tight text-slate-900 dark:text-white leading-[1.2] max-w-4xl mx-auto">
                {blog.title || 'Untitled Article'}
              </h1>

              {/* Subtitle / Excerpt */}
              {blog.description && (
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
                  {blog.description}
                </p>
              )}

              {/* Meta Stats Row */}
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <User size={12} />
                  </div>
                  <span>{blog.author_name || 'Toolbit AI Team'}</span>
                </div>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span>{formattedDate}</span>
                </div>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-400" />
                  <span>{readingTime} min read</span>
                </div>
              </div>
            </header>

            {/* 2. Featured Image (Rounded with subtle border & shadow) */}
            {blog.featured_image_url && (
              <div className="relative mb-10 group overflow-hidden rounded-2xl md:rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-xl bg-slate-900/5">
                <img
                  src={blog.featured_image_url}
                  alt={blog.title || 'Featured Image'}
                  className="w-full max-h-[500px] object-cover transition-transform duration-500 group-hover:scale-[1.01]"
                />
                <button
                  onClick={() => setLightboxImage(blog.featured_image_url)}
                  className="absolute bottom-4 right-4 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-xl backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 text-xs font-bold opacity-0 group-hover:opacity-100"
                >
                  <Maximize2 size={14} />
                  <span>Expand</span>
                </button>
              </div>
            )}

            {/* 3. Table of Contents & Content Layout */}
            <div className="relative">
              
              {/* Sticky / Collapsible Table of Contents */}
              {headings.length > 0 && (
                <div className="mb-10 p-5 bg-white dark:bg-[#151c2c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div 
                    onClick={() => setIsTocOpen(!isTocOpen)}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      <List size={15} className="text-indigo-500" />
                      <span>Table of Contents</span>
                    </div>
                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                      {isTocOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {isTocOpen && (
                    <nav className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {headings.map((h) => {
                        const isActive = activeHeadingId === h.id;
                        return (
                          <button
                            key={h.id}
                            onClick={() => scrollToHeading(h.id)}
                            className={`block w-full text-left text-xs transition-all duration-200 py-1 px-2.5 rounded-lg truncate cursor-pointer ${
                              h.level === 3 ? 'pl-6' : ''
                            } ${
                              isActive
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                            }`}
                          >
                            {h.text}
                          </button>
                        );
                      })}
                    </nav>
                  )}
                </div>
              )}

              {/* Article Content Render Area */}
              <article className="prose prose-slate dark:prose-invert max-w-none">
                <style>{`
                  .blog-content {
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    color: #334155;
                    line-height: 1.8;
                    font-size: 1.05rem;
                  }
                  .dark .blog-content {
                    color: #cbd5e1;
                  }

                  .blog-content h1 {
                    font-size: 2rem;
                    font-weight: 900;
                    letter-spacing: -0.03em;
                    color: #0f172a;
                    margin-top: 2.5rem;
                    margin-bottom: 1.25rem;
                    line-height: 1.25;
                  }
                  .dark .blog-content h1 {
                    color: #f8fafc;
                  }

                  .blog-content h2 {
                    font-size: 1.6rem;
                    font-weight: 800;
                    letter-spacing: -0.025em;
                    color: #0f172a;
                    margin-top: 2.25rem;
                    margin-bottom: 1rem;
                    line-height: 1.3;
                    scroll-margin-top: 30px;
                  }
                  .dark .blog-content h2 {
                    color: #f1f5f9;
                  }

                  .blog-content h3 {
                    font-size: 1.25rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                    color: #1e293b;
                    margin-top: 1.75rem;
                    margin-bottom: 0.75rem;
                    line-height: 1.4;
                    scroll-margin-top: 30px;
                  }
                  .dark .blog-content h3 {
                    color: #e2e8f0;
                  }

                  .blog-content p {
                    margin-bottom: 1.35rem;
                    font-size: 1.025rem;
                    line-height: 1.8;
                  }

                  .blog-content strong {
                    font-weight: 700;
                    color: #0f172a;
                  }
                  .dark .blog-content strong {
                    color: #f8fafc;
                  }

                  .blog-content ul {
                    list-style-type: disc;
                    padding-left: 1.5rem;
                    margin-bottom: 1.5rem;
                    space-y: 0.5rem;
                  }

                  .blog-content ol {
                    list-style-type: decimal;
                    padding-left: 1.5rem;
                    margin-bottom: 1.5rem;
                    space-y: 0.5rem;
                  }

                  .blog-content li {
                    margin-bottom: 0.5rem;
                    line-height: 1.7;
                  }

                  .blog-content table {
                    margin: 1.5rem 0 !important;
                    width: 100% !important;
                    border-collapse: separate !important;
                    border-spacing: 0 !important;
                  }
                  .blog-content tr:first-child th:first-child {
                    border-top-left-radius: 0.75rem !important;
                  }
                  .blog-content tr:first-child th:last-child {
                    border-top-right-radius: 0.75rem !important;
                  }
                  .blog-content th {
                    vertical-align: middle !important;
                    padding: 0.875rem 1rem !important;
                    text-align: left;
                  }
                  .blog-content td {
                    vertical-align: middle !important;
                    padding: 0.75rem 1rem !important;
                    text-align: left;
                  }

                  .blog-content hr {
                    border: none !important;
                    height: 1px !important;
                    background: linear-gradient(to right, transparent, #cbd5e1 20%, #cbd5e1 80%, transparent) !important;
                    margin: 2.5rem 0 !important;
                    opacity: 0.8;
                  }
                  .dark .blog-content hr {
                    background: linear-gradient(to right, transparent, #334155 20%, #334155 80%, transparent) !important;
                  }
                  .blog-content li::marker {
                    color: #94a3b8;
                  }
                  .dark .blog-content li::marker {
                    color: #64748b;
                  }

                  .blog-content img {
                    border-radius: 16px;
                    max-width: 100%;
                    margin: 1.5rem auto;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
                    cursor: pointer;
                  }
                `}</style>

                <div 
                  ref={contentRef}
                  className="blog-content"
                  dangerouslySetInnerHTML={{ __html: processedHtml }}
                />

                {/* Divider Line */}
                <hr className="my-8 border-t border-slate-200/80 dark:border-slate-800" />

                {/* Share Article Section */}
                <div className="pt-2 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-4">
                    SHARE THIS ARTICLE
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* 1. Copy Link */}
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} className="text-slate-400" />}
                      <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    {/* 2. X Twitter */}
                    <a
                      href={`https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <svg className="w-3 h-3 text-slate-600 dark:text-slate-300 fill-current" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      <span>X Twitter</span>
                    </a>

                    {/* 3. LinkedIn */}
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <svg className="w-3 h-3 text-[#0a66c2] fill-current" viewBox="0 0 24 24">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                      </svg>
                      <span>LinkedIn</span>
                    </a>

                    {/* 4. Facebook */}
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <svg className="w-3 h-3 text-[#1877f2] fill-current" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <span>Facebook</span>
                    </a>

                    {/* 5. Reddit */}
                    <a
                      href={`https://reddit.com/submit?url=${shareUrl}&title=${shareTitle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <svg className="w-3 h-3 text-[#ff4500] fill-current" viewBox="0 0 24 24">
                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.188-.491.96 0 1.743.784 1.743 1.744 0 .606-.307 1.14-.775 1.45.02.18.031.36.031.541 0 2.723-3.155 4.93-7.043 4.93-3.887 0-7.043-2.207-7.043-4.93 0-.18.012-.36.03-.541a1.74 1.74 0 0 1-.774-1.45c0-.96.783-1.744 1.743-1.744.458 0 .88.182 1.187.49 1.196-.855 2.85-1.417 4.673-1.487l.951-4.463 3.32.7a1.25 1.25 0 0 1 1.188-.744z"/>
                      </svg>
                      <span>Reddit</span>
                    </a>

                    {/* 6. WhatsApp */}
                    <a
                      href={`https://api.whatsapp.com/send?text=${shareTitle}%20${shareUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <svg className="w-3 h-3 text-[#25d366] fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </a>

                    {/* 7. Email */}
                    <a
                      href={`mailto:?subject=${shareTitle}&body=${shareUrl}`}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Mail size={13} className="text-slate-400" />
                      <span>Email</span>
                    </a>
                  </div>
                </div>

              </article>

            </div>

          </main>
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border border-white/10">
            <img src={lightboxImage} alt="Expanded Preview" className="max-w-full max-h-[85vh] object-contain" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 rounded-full bg-black/60 text-white hover:bg-rose-600 hover:text-white transition-colors h-9 w-9"
              aria-label="Close image preview"
            >
              <X size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalJSX, document.body);
}
