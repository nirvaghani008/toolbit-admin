'use client';

import { useRef, useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { isBypassActive } from '@/lib/bypass';
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  resetKey?: number;
  className?: string;
}

/**
 * Cloudflare Turnstile public site key.
 * Uses fallback dummy key '1x00000000000000000000AA' if environment variable is missing.
 */
function getSiteKey(): string {
  return process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
}

/**
 * Responsive Cloudflare Turnstile Widget styled for the Toolbit Admin dark theme.
 * Auto-scales smoothly if container width is constrained (< 300px).
 *
 * When NEXT_PUBLIC_SUBMIT_BYPASS=true:
 *   Shows a Dev Bypass badge and auto-fires 'bypass-token' for friction-free development.
 * When NEXT_PUBLIC_SUBMIT_BYPASS=false (or unset):
 *   Renders the live Cloudflare Turnstile interactive captcha widget in dark theme.
 */
export function TurnstileWidget({
  onSuccess,
  onError,
  onExpire,
  resetKey = 0,
  className = '',
}: TurnstileWidgetProps) {
  const isBypass = isBypassActive();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [localResetKey, setLocalResetKey] = useState(resetKey);

  const WIDGET_WIDTH = 300; // px - normal Turnstile widget width
  const WIDGET_HEIGHT = 65; // px - normal Turnstile widget height

  useEffect(() => {
    setLocalResetKey(resetKey);
    setHasError(false);
  }, [resetKey]);

  // Bypass: Auto-fire success on mount and on resetKey change
  useEffect(() => {
    if (isBypass) {
      onSuccess('bypass-token');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localResetKey, isBypass]);

  // ResizeObserver to scale widget down responsively on narrow viewports
  useEffect(() => {
    if (isBypass) return;

    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const availableWidth = container.offsetWidth;
      if (availableWidth > 0 && availableWidth < WIDGET_WIDTH) {
        setScale(availableWidth / WIDGET_WIDTH);
      } else {
        setScale(1);
      }
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [isBypass]);

  // Visual badge in dev mode when bypass is enabled
  if (isBypass) {
    return (
      <div className={`w-full ${className}`}>
        <div className="flex items-center gap-2.5 text-xs font-medium text-emerald-400 bg-emerald-950/25 border border-emerald-800/40 rounded-xl px-3.5 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="leading-snug">Dev Mode: Captcha verification bypassed</span>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="w-full max-w-[300px] border border-rose-900/50 bg-rose-950/20 rounded-xl p-3 flex flex-col gap-2 animate-in fade-in duration-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-rose-300">Verification load failed</p>
            <p className="text-[11px] text-rose-400/80 leading-normal mt-0.5">
              Please check your connection or disable ad blockers, then retry.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasError(false);
            setLocalResetKey((k) => k + 1);
          }}
          className="self-end inline-flex items-center gap-1 text-[11px] font-medium bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-rose-800/40"
        >
          <RefreshCw size={11} />
          Retry Verification
        </button>
      </div>
    );
  }

  const scaledHeight = Math.round(WIDGET_HEIGHT * scale);

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden relative flex justify-start ${className}`}
      style={{ height: `${scaledHeight}px` }}
    >
      <div
        key={localResetKey}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'left top',
          width: `${WIDGET_WIDTH}px`,
          height: `${WIDGET_HEIGHT}px`,
          lineHeight: 0,
        }}
      >
        <Turnstile
          siteKey={getSiteKey()}
          options={{
            theme: 'dark',
            size: 'normal',
          }}
          onSuccess={(token) => {
            setHasError(false);
            onSuccess(token);
          }}
          onError={() => {
            setHasError(true);
            onError?.();
          }}
          onExpire={() => {
            onExpire?.();
          }}
        />
      </div>
    </div>
  );
}
