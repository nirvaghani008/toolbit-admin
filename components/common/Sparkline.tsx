'use client';

interface SparklineProps {
  color: string;
  points: number[];
  id: string;
  isSelected?: boolean;
}

export default function Sparkline({ color, points, id, isSelected = false }: SparklineProps) {
  const data = points || [];
  const max = Math.max(...data, 5);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const isAllZero = data.every((v) => v === 0);

  const pathData = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      if (isAllZero) return `${i === 0 ? 'M' : 'L'} ${x} 50`;
      const y = 100 - ((d - min) / range) * 80 - 10;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const areaData = isAllZero ? `M 0 50 L 100 50 L 100 100 L 0 100 Z` : `${pathData} L 100 100 L 0 100 Z`;

  const safeId = `grad-${color}-${id}`.replace(/[^a-zA-Z0-9]/g, '-');

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden rounded-2xl transition-all duration-300 ${color} ${
        isSelected ? 'opacity-80' : 'opacity-40 group-hover:opacity-75'
      }`}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id={safeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={isSelected ? '0.75' : '0.55'} />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaData} fill={`url(#${safeId})`} className="text-current" />
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth={isSelected ? '2' : '1.5'}
          vectorEffect="non-scaling-stroke"
          className="text-current transition-all duration-300 group-hover:stroke-[2px]"
          style={isSelected ? { filter: 'drop-shadow(0px 1px 2px currentColor)' } : undefined}
        />
      </svg>
    </div>
  );
}
