'use client';

import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolLogoProps {
  tool?: any;
  toolName?: string;
  className?: string;
  iconSize?: number;
  alt?: string;
}

export function extractToolFavicon(tool: any): { primaryUrl: string | null; secondaryUrl: string | null } {
  if (!tool) return { primaryUrl: null, secondaryUrl: null };

  const info = typeof tool.tool_info === 'string'
    ? (() => { try { return JSON.parse(tool.tool_info); } catch { return {}; } })()
    : (tool.tool_info || {});

  const candidateUrl =
    tool.favicon_url ||
    tool.icon_url ||
    tool.logo_url ||
    tool.image_url ||
    tool.featured_image_url ||
    info.favicon_url ||
    info.icon_url ||
    info.logo_url ||
    info.logo ||
    info.icon ||
    info.imageUrl ||
    null;

  let faviconApiUrl: string | null = null;
  const siteUrl =
    tool.tool_site_url ||
    tool.website_url ||
    tool.tool_url ||
    tool.site_url ||
    tool.url ||
    info.websiteUrl ||
    info.url ||
    info.website_url ||
    info.importantLinks?.website;

  if (siteUrl && typeof siteUrl === 'string') {
    try {
      const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
      const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '');
      if (hostname) {
        faviconApiUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      }
    } catch {
      // ignore parse errors
    }
  }

  const primaryUrl = candidateUrl || faviconApiUrl;
  const secondaryUrl = candidateUrl && faviconApiUrl && candidateUrl !== faviconApiUrl ? faviconApiUrl : null;

  return { primaryUrl, secondaryUrl };
}

export default function ToolLogo({
  tool,
  toolName,
  className,
  iconSize = 16,
  alt
}: ToolLogoProps) {
  const name = toolName || tool?.tool_name || tool?.name || tool?.tool_info?.toolName || alt || 'Tool';
  const { primaryUrl, secondaryUrl } = extractToolFavicon(tool);

  const [currentSrc, setCurrentSrc] = useState<string | null>(primaryUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentSrc(primaryUrl);
    setHasError(false);
  }, [primaryUrl]);

  const handleError = () => {
    if (currentSrc === primaryUrl && secondaryUrl) {
      setCurrentSrc(secondaryUrl);
    } else {
      setHasError(true);
    }
  };

  return (
    <div
      className={cn(
        'w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden transition-all group-hover:scale-105',
        className
      )}
    >
      {!hasError && currentSrc ? (
        <img
          src={currentSrc}
          alt={name}
          onError={handleError}
          className="w-full h-full object-contain rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600 dark:text-zinc-300">
          <Wrench size={iconSize} />
        </div>
      )}
    </div>
  );
}
