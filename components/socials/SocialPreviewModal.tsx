'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ExternalLink, Heart, MessageSquare,
  Copy, Check, ThumbsUp, Sparkles
} from 'lucide-react';
import { SocialItem } from './SocialTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SocialPreviewModalProps {
  social: SocialItem;
  onClose: () => void;
}

// Helper SVG Icons for Platforms
const YoutubeBrandIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const TwitterBrandIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const RedditBrandIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF4500">
    <circle cx="12" cy="12" r="10" />
    <path fill="#FFF" d="M16.67 11.41c-.4.07-.79.28-1.07.59-1.07-.75-2.52-1.23-4.13-1.29l.7-3.3 2.3.49c.04.57.51 1.02 1.09 1.02.61 0 1.11-.5 1.11-1.11s-.5-1.11-1.11-1.11c-.48 0-.89.31-1.04.74l-2.52-.53c-.11-.02-.22.02-.29.1-.07.08-.1.19-.07.3l-.78 3.66c-1.64.04-3.13.52-4.21 1.28-.28-.31-.67-.52-1.07-.59-.72-.12-1.42.36-1.54 1.08-.12.72.36 1.42 1.08 1.54.34.06.69-.02.97-.21.03.73.41 1.45 1.09 2.05.99.88 2.45 1.37 4.05 1.37s3.06-.49 4.05-1.37c.68-.6 1.06-1.32 1.09-2.05.28.19.63.27.97.21.72-.12 1.2-.82 1.08-1.54-.12-.72-.82-1.2-1.54-1.08z" />
  </svg>
);

const InstagramBrandIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

// ── oEmbed Renderer: uses iframe so scripts execute and embed widget renders fully ──
function OembedRenderer({ html, platform }: { html: string; platform?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(380);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Convert any JSX className="..." to standard HTML class="..." in raw HTML strings
    const cleanHtml = (html || '')
      .replace(/className=/g, 'class=')
      .trim();

    let scriptTags = '';
    const p = (platform || '').toLowerCase();
    const hLower = cleanHtml.toLowerCase();

    if (p.includes('twitter') || p.includes('x') || hLower.includes('twitter-tweet')) {
      scriptTags += `<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`;
    }
    if (p.includes('instagram') || hLower.includes('instagram-media')) {
      scriptTags += `<script async src="https://www.instagram.com/embed.js"></script>`;
    }
    if (p.includes('reddit') || hLower.includes('reddit-embed')) {
      scriptTags += `<script async src="https://embed.reddit.com/widgets.js" charset="utf-8"></script>`;
    }

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: transparent; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; font-size: 13px; display: flex; justify-content: center; align-items: center; min-height: 100px; }
    blockquote { width: 100% !important; max-width: 100% !important; margin: 0 !important; }
    .twitter-tweet { margin: 0 auto !important; width: 100% !important; max-width: 100% !important; }
    .instagram-media { margin: 0 auto !important; max-width: 100% !important; min-width: 280px !important; }
    .reddit-embed-bq { width: 100% !important; max-width: 100% !important; border-radius: 10px !important; }
  </style>
</head>
<body>
  <div style="width: 100%;" id="embed-root">
    ${cleanHtml}
  </div>
  ${scriptTags}
</body>
</html>`;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
    }

    const triggerRender = () => {
      try {
        const win = iframe.contentWindow as any;
        if (win?.twttr?.widgets?.load) {
          win.twttr.widgets.load(doc?.body);
        }
        if (win?.instgrm?.Embeds?.process) {
          win.instgrm.Embeds.process();
        }
      } catch { }
    };

    const updateHeight = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          const h = Math.max(body.scrollHeight, body.offsetHeight);
          if (h && h > 50) setHeight(h + 20);
        }
      } catch { }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    const timers = [
      setTimeout(() => { triggerRender(); updateHeight(); }, 300),
      setTimeout(() => { triggerRender(); updateHeight(); }, 800),
      setTimeout(() => { triggerRender(); updateHeight(); }, 1500),
      setTimeout(() => { triggerRender(); updateHeight(); }, 2500),
      setTimeout(() => { triggerRender(); updateHeight(); }, 4000)
    ];

    try {
      const body = iframe.contentDocument?.body;
      if (body) resizeObserver.observe(body);
    } catch { }

    return () => {
      timers.forEach(clearTimeout);
      resizeObserver.disconnect();
    };
  }, [html, platform]);

  return (
    <div className="w-full rounded-xl overflow-hidden my-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <iframe
        ref={iframeRef}
        title="Social Post Embed"
        className="w-full border-0 rounded-xl transition-all duration-300"
        style={{ height: `${height}px`, minHeight: '200px' }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
        scrolling="no"
      />
    </div>
  );
}

// ── Smart Media Component (Real img → JSX fallback) ──
function SocialMediaPreview({
  src,
  alt,
  platform = "default",
  title = "",
  className = ""
}: {
  src?: string | null;
  alt: string;
  platform?: string;
  title?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  // If real image URL exists and hasn't errored out, render real img
  if (src && !hasError) {
    return (
      <div className={`relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 flex items-center justify-center shadow-xs my-2 max-h-[300px] ${className}`}>
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="w-full h-auto max-h-[300px] object-cover rounded-lg"
        />
      </div>
    );
  }

  // Pure JSX fallback card (no broken img icon)
  const p = platform.toLowerCase();
  let bgClass = "from-slate-900 via-orange-950/40 to-slate-950 border-orange-500/20";
  let badgeColor = "bg-orange-500/20 text-orange-400 border-orange-500/30";
  let brandName = "REDDIT MEDIA";
  let IconComponent = RedditBrandIcon;

  if (p.includes('youtube')) {
    bgClass = "from-slate-900 via-rose-950/40 to-slate-950 border-rose-500/20";
    badgeColor = "bg-rose-500/20 text-rose-400 border-rose-500/30";
    brandName = "YOUTUBE MEDIA";
    IconComponent = YoutubeBrandIcon;
  } else if (p.includes('twitter') || p.includes('x')) {
    bgClass = "from-slate-900 via-sky-950/40 to-slate-950 border-sky-500/20";
    badgeColor = "bg-sky-500/20 text-sky-400 border-sky-500/30";
    brandName = "X / TWITTER MEDIA";
    IconComponent = TwitterBrandIcon;
  } else if (p.includes('instagram')) {
    bgClass = "from-slate-900 via-pink-950/40 to-slate-950 border-pink-500/20";
    badgeColor = "bg-pink-500/20 text-pink-400 border-pink-500/30";
    brandName = "INSTAGRAM MEDIA";
    IconComponent = InstagramBrandIcon;
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border bg-gradient-to-br ${bgClass} p-3 my-2 min-h-[100px] flex flex-col justify-between select-none shadow-xs ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />
      <div className="relative z-10 flex items-center justify-between">
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${badgeColor} flex items-center gap-1`}>
          <IconComponent size={12} /> {brandName}
        </span>
      </div>
      <div className="relative z-10 my-2 space-y-0.5">
        <h4 className="text-xs font-bold text-white leading-tight">{title || "Community Announcement"}</h4>
        <p className="text-[10px] text-white/50 font-medium">Toolbit AI Social Network</p>
      </div>
      <div className="relative z-10 flex items-center justify-between pt-1.5 border-t border-white/10 text-[9px] font-bold text-white/40 uppercase tracking-wider">
        <span>VERIFIED POST</span><span>TOOLBIT AI</span>
      </div>
    </div>
  );
}

// ── Exhaustive Image Extractor ──
function extractImageUrl(social: SocialItem): string | null {
  if (!social) return null;

  // 1. Direct properties on top-level social object
  const directObj = social as Record<string, any>;
  const directKeys = [
    'image_url', 'thumbnail_url', 'thumbnail', 'cover_url', 'cover',
    'media_url', 'image', 'picture', 'photo', 'preview_url', 'img_url'
  ];
  for (const k of directKeys) {
    const val = directObj[k];
    if (typeof val === 'string' && val.trim().startsWith('http')) return val.trim();
  }

  let jsonData: Record<string, any> = social.json_data || {};
  if (typeof jsonData === 'string') {
    try { jsonData = JSON.parse(jsonData); } catch { jsonData = {}; }
  }

  // 2. Recursive key & value finder for images
  const findImageUrl = (obj: any, depth = 0): string | null => {
    if (!obj || depth > 5) return null;

    if (typeof obj === 'string') {
      const v = obj.trim();
      if (v.startsWith('http') && (
        /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(v) ||
        /pbs\.twimg\.com|cdninstagram\.com|instagram\.f|fbcdn\.net|i\.ytimg\.com|img\.youtube\.com|i\.redd\.it|preview\.redd\.it|external-preview\.redd\.it|imgur\.com|media\.tenor\.com/i.test(v)
      )) {
        return v;
      }
      return null;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = findImageUrl(item, depth + 1);
        if (res) return res;
      }
      return null;
    }

    if (typeof obj === 'object') {
      const priorityKeys = [
        'url', 'src', 'href', 'thumbnail_url', 'thumbnail', 'media_url',
        'media_url_https', 'image_url', 'image', 'cover_url', 'cover',
        'picture', 'photo', 'display_url', 'og_image'
      ];
      for (const pk of priorityKeys) {
        if (obj[pk]) {
          const res = findImageUrl(obj[pk], depth + 1);
          if (res) return res;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        if (priorityKeys.includes(k.toLowerCase())) continue;
        const res = findImageUrl(v, depth + 1);
        if (res) return res;
      }
    }

    return null;
  };

  const foundInJson = findImageUrl(jsonData);
  if (foundInJson) return foundInJson;

  // 3. YouTube Video ID
  const youtubeVideoId = jsonData.video_id || (() => {
    if (!social.source_url) return null;
    const match = social.source_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    return match ? match[1] : null;
  })();
  if (youtubeVideoId) {
    return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  }

  // 4. HTML strings check
  const htmlStrings = [jsonData.oembedHtml, jsonData.oembed_html, jsonData.html, jsonData.embed_code];
  for (const h of htmlStrings) {
    if (h && typeof h === 'string') {
      const match = h.match(/(?:src|href)=["'](https?:\/\/[^"']+\.(?:png|jpe?g|webp|gif|svg)[^"']*)/i);
      if (match && match[1]) return match[1];
      const cdnMatch = h.match(/src=["'](https?:\/\/[^"']*(?:pbs\.twimg\.com|cdninstagram\.com|fbcdn\.net|i\.ytimg\.com|i\.redd\.it|preview\.redd\.it)[^"']*)/i);
      if (cdnMatch && cdnMatch[1]) return cdnMatch[1];
    }
  }

  // 5. Check if source_url is directly an image
  if (social.source_url && typeof social.source_url === 'string') {
    const srcUrl = social.source_url.trim();
    if (/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(srcUrl) || /i\.redd\.it|preview\.redd\.it|pbs\.twimg\.com|cdninstagram\.com|imgur\.com/i.test(srcUrl)) {
      return srcUrl;
    }
  }

  return null;
}

export default function SocialPreviewModal({ social, onClose }: SocialPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  if (!mounted) return null;

  const platform = (social.platform || 'Other').toLowerCase();
  const isTwitter = platform.includes('twitter') || platform.includes('x');
  const isYoutube = platform.includes('youtube');
  const isReddit = platform.includes('reddit');
  const isInstagram = platform.includes('instagram');

  const jsonData = social.json_data || {};

  // Extract Youtube Video ID if present
  const youtubeVideoId = jsonData.video_id || (() => {
    if (!social.source_url) return null;
    const match = social.source_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    return match ? match[1] : null;
  })();

  // Extract Instagram Post / Reel Code if present
  const instagramCode = (() => {
    if (!social.source_url) return null;
    const match = social.source_url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/i);
    return match ? match[1] : null;
  })();

  const primaryThumb = extractImageUrl(social);

  const authorName = jsonData.source_name || jsonData.author || social.platform || 'Creator';
  const authorHandle = (jsonData.author || authorName).toLowerCase().replace(/^u\//i, '').replace(/^@/, '').replace(/\s+/g, '');
  const subreddit = (jsonData.subreddit || 'ai').replace(/^r\//i, '');

  const handleCopyLink = () => {
    if (social.source_url) {
      navigator.clipboard.writeText(social.source_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderPlatformHeaderBadge = () => {
    if (isTwitter) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
          <TwitterBrandIcon size={14} /> X
        </Badge>
      );
    }
    if (isYoutube) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
          <YoutubeBrandIcon size={16} /> YouTube
        </Badge>
      );
    }
    if (isReddit) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400">
          <RedditBrandIcon size={16} /> Reddit
        </Badge>
      );
    }
    if (isInstagram) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5 text-xs font-bold text-pink-600 dark:text-pink-400">
          <InstagramBrandIcon size={15} /> Instagram
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
        <Sparkles size={14} /> {social.platform || 'Social Update'}
      </Badge>
    );
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto custom-scrollbar"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Outer Card Header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {renderPlatformHeaderBadge()}
            {social.published_date && (
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                • {new Date(social.published_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {social.source_url && (
              <a
                href={social.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button
                  variant="outline"
                  size="xs"
                  className="text-[11px] font-bold h-7 px-2.5 rounded-lg inline-flex items-center gap-1"
                >
                  View original <ExternalLink size={11} />
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white"
              title="Close Preview"
            >
              <X size={15} />
            </Button>
          </div>
        </div>

        {/* Outer Article Body Container - Scrollable if overflowed */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1">
          {/* Main Title & Description Header */}
          <div className="space-y-1.5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
              {social.title}
            </h2>

            {social.description && !jsonData.oembedHtml && !isYoutube && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                {social.description}
              </p>
            )}
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* PLATFORM EMBED CARD PREVIEW */}
          {/* ───────────────────────────────────────────────────────────── */}

          {/* 1. TWITTER / X EMBED CARD */}
          {isTwitter && (
            <div className="mt-2">
              {jsonData.oembedHtml || jsonData.oembed_html || jsonData.html ? (
                <OembedRenderer html={jsonData.oembedHtml || jsonData.oembed_html || jsonData.html} platform="twitter" />
              ) : (social.source_url && (social.source_url.includes('twitter.com') || social.source_url.includes('x.com'))) ? (
                <OembedRenderer
                  html={`<blockquote class="twitter-tweet" data-dnt="true"><a href="${social.source_url.replace('x.com', 'twitter.com')}"></a></blockquote>`}
                  platform="twitter"
                />
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161e2e] p-3 shadow-xs space-y-2">
                  {/* Author Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-black flex items-center justify-center text-xs shadow-xs shrink-0">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white">
                          {authorName}
                          <span className="text-sky-500 inline-block text-[10px]" title="Verified">✓</span>
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          @{authorHandle} · <span className="text-sky-500 font-semibold cursor-pointer">Follow</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-slate-900 dark:text-white">
                      <TwitterBrandIcon size={16} />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    {social.description || social.title}
                  </p>

                  <SocialMediaPreview
                    src={primaryThumb}
                    alt="Twitter Media"
                    platform="twitter"
                    title={social.title}
                  />

                  {social.published_date && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                      {new Date(social.published_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {new Date(social.published_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1 hover:text-rose-500 transition-colors cursor-pointer">
                      <Heart size={13} className="text-rose-500 fill-rose-500/20" />
                      <span>{social.view_counter ? social.view_counter.toLocaleString() : '552'}</span>
                    </div>
                    <div className="flex items-center gap-1 hover:text-sky-500 transition-colors cursor-pointer">
                      <MessageSquare size={13} className="text-sky-500" />
                      <span>Reply</span>
                    </div>
                    <div
                      onClick={handleCopyLink}
                      className="flex items-center gap-1 hover:text-indigo-500 transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      <span>{copied ? 'Copied!' : 'Copy link'}</span>
                    </div>
                  </div>

                  {social.source_url && (
                    <a
                      href={social.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-sky-500 hover:bg-sky-500/10 text-[11px] font-bold flex items-center justify-center gap-1 transition-all text-center"
                    >
                      Read full post on X
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. YOUTUBE EMBED CARD */}
          {isYoutube && (
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-3 text-white shadow-xl space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] uppercase font-black tracking-wider">
                    YOUTUBE
                  </span>
                  {social.content_type && (
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[9px] uppercase font-bold">
                      {Array.isArray(social.content_type) ? social.content_type[0] : social.content_type}
                    </span>
                  )}
                </div>
                {social.published_date && (
                  <span className="text-[10px] font-medium text-slate-400">
                    {new Date(social.published_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* YouTube Video Player Embed or Media Preview */}
              {youtubeVideoId ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-slate-800 shadow-md">
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=0&rel=0`}
                    title={social.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                </div>
              ) : jsonData.oembedHtml || jsonData.oembed_html || jsonData.html ? (
                <OembedRenderer html={jsonData.oembedHtml || jsonData.oembed_html || jsonData.html} platform="youtube" />
              ) : (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="YouTube Media"
                  platform="youtube"
                  title={social.title}
                />
              )}

              {/* Video Tags */}
              {social.tags && social.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {social.tags.slice(0, 4).map((t, idx) => (
                    <span key={idx} className="text-[10px] font-semibold text-sky-400 hover:underline cursor-pointer">
                      #{t.replace(/^#/, '').toLowerCase()}
                    </span>
                  ))}
                </div>
              )}

              {social.source_url && (
                <a
                  href={social.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 bg-white hover:bg-slate-100 text-slate-950 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs mt-1"
                >
                  View original post <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

          {/* 3. REDDIT EMBED CARD */}
          {isReddit && (
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182030] p-3 shadow-xs space-y-2">
              {/* Reddit Subreddit Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0">
                    <RedditBrandIcon size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        r/{subreddit}
                      </span>
                      <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold rounded-full border border-slate-200 dark:border-slate-700">
                        + Join
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      Posted by u/{authorHandle}
                    </div>
                  </div>
                </div>
                <RedditBrandIcon size={20} />
              </div>

              {/* Only show title/description inside card if oEmbed HTML is NOT present, avoiding duplication */}
              {!(jsonData.oembedHtml || jsonData.oembed_html || jsonData.html) && (
                <>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                    {social.title}
                  </h3>

                  {social.description && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                      <p>{social.description}</p>
                    </div>
                  )}
                </>
              )}

              {/* oEmbed or image preview */}
              {primaryThumb ? (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Reddit Media"
                  platform="reddit"
                  title={social.title}
                />
              ) : jsonData.oembedHtml || jsonData.oembed_html || jsonData.html ? (
                <OembedRenderer html={jsonData.oembedHtml || jsonData.oembed_html || jsonData.html} platform="reddit" />
              ) : (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Reddit Media"
                  platform="reddit"
                  title={social.title}
                />
              )}

              {/* Reddit Stats & Actions Bar */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1 text-orange-600 dark:text-orange-500 font-extrabold">
                  <ThumbsUp size={13} />
                  <span>{social.view_counter ? `${(social.view_counter / 1000).toFixed(1)}K` : '1.4K'} upvotes</span>
                </div>
                <div className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
                  <MessageSquare size={13} />
                  <span>Comment</span>
                </div>
                <div
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 hover:text-indigo-500 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied!' : 'Copy link'}</span>
                </div>
              </div>

              {social.source_url && (
                <a
                  href={social.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 rounded-full border border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 text-[11px] font-bold flex items-center justify-center gap-1 transition-all text-center mt-1"
                >
                  View post on Reddit
                </a>
              )}
            </div>
          )}

          {/* 4. INSTAGRAM EMBED CARD */}
          {isInstagram && (
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1f2e] p-3 shadow-xs space-y-2">
              {/* Instagram Profile Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shrink-0">
                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 p-0.5">
                      <div className="w-full h-full rounded-full bg-gradient-to-tr from-purple-500 to-rose-500 text-white font-black flex items-center justify-center text-[9px]">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white">
                      {authorHandle}
                      <span className="text-sky-500 text-[10px]">✓</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Instagram Post</div>
                  </div>
                </div>
                {social.source_url && (
                  <a
                    href={social.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-md transition-all shadow-xs"
                  >
                    View profile
                  </a>
                )}
              </div>

              {/* Instagram Media / oEmbed / iFrame Embed */}
              {primaryThumb ? (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Instagram Media"
                  platform="instagram"
                  title={social.title}
                />
              ) : jsonData.oembedHtml || jsonData.oembed_html || jsonData.html ? (
                <OembedRenderer html={jsonData.oembedHtml || jsonData.oembed_html || jsonData.html} platform="instagram" />
              ) : instagramCode ? (
                <OembedRenderer
                  html={`<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/${instagramCode}/" data-instgrm-version="14" style="background:#FFF; border:0; border-radius:12px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:280px; padding:0; width:99.375%;"><div style="padding:16px;"><a href="https://www.instagram.com/p/${instagramCode}/" style="background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;" target="_blank">View post on Instagram</a></div></blockquote>`}
                  platform="instagram"
                />
              ) : (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Instagram Media"
                  platform="instagram"
                  title={social.title}
                />
              )}

              {/* Caption */}
              <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                <span className="font-extrabold text-slate-900 dark:text-white mr-1">{authorHandle}</span>
                {social.description || social.title}
              </div>

              {social.source_url && (
                <a
                  href={social.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 transition-all text-center"
                >
                  View original post <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

          {/* 5. DEFAULT / OTHER PLATFORM EMBED CARD */}
          {!isTwitter && !isYoutube && !isReddit && !isInstagram && (
            <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141b2d] p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/20">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{authorName}</div>
                    <div className="text-[10px] text-slate-400">{social.platform || 'Social Media'}</div>
                  </div>
                </div>
              </div>

              {primaryThumb ? (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Social Media"
                  platform="default"
                  title={social.title}
                />
              ) : jsonData.oembedHtml || jsonData.oembed_html || jsonData.html ? (
                <OembedRenderer html={jsonData.oembedHtml || jsonData.oembed_html || jsonData.html} platform="default" />
              ) : (
                <SocialMediaPreview
                  src={primaryThumb}
                  alt="Social Media"
                  platform="default"
                  title={social.title}
                />
              )}

              <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                {social.description || social.title}
              </p>

              {social.source_url && (
                <a
                  href={social.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  View original post <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
