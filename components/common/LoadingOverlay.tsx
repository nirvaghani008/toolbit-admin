'use client';

interface LoadingOverlayProps {
  message?: string;
}

export default function LoadingOverlay({ message = 'Fetching data...' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--bg-elevated)]/60 backdrop-blur-md animate-fade-in">
      <div className="relative flex items-center justify-center">
        {/* Outer Ring */}
        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/10 border-t-indigo-500 animate-spin" />
        
        {/* Inner Pulse */}
        <div className="absolute w-8 h-8 rounded-full bg-indigo-500/20 animate-pulse flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
        </div>
      </div>
      
      <div className="mt-6 flex flex-col items-center">
        <span className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
          {message}
        </span>
        <div className="mt-2 flex gap-1">
          <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
