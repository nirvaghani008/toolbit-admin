'use client';

import { useState, useEffect, useRef } from 'react';

interface CountUpProps {
  end: number;
  duration?: number;
  decimals?: number;
}

export default function CountUp({ end, duration = 1000, decimals }: CountUpProps) {
  const targetEnd = typeof end === 'number' && !isNaN(end) ? end : 0;
  const isDecimal = decimals !== undefined ? decimals > 0 : (targetEnd % 1 !== 0);
  const decimalPlaces = decimals !== undefined ? decimals : (isDecimal ? 1 : 0);
  const [count, setCount] = useState<number>(0);
  const prevEndRef = useRef(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startVal = prevEndRef.current;
    const diff = targetEnd - startVal;

    if (diff === 0 && startVal !== 0) {
      setCount(targetEnd);
      return;
    }

    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Easing function (outQuart)
      const easedProgress = 1 - Math.pow(1 - progress, 4);

      const currentCount = isDecimal
        ? Number((startVal + easedProgress * diff).toFixed(decimalPlaces))
        : Math.floor(startVal + easedProgress * diff);

      setCount(currentCount);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setCount(targetEnd);
        prevEndRef.current = targetEnd;
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [targetEnd, duration, isDecimal, decimalPlaces]);

  const safeCount = typeof count === 'number' && !isNaN(count) ? count : 0;
  return <>{isDecimal ? safeCount.toFixed(decimalPlaces) : safeCount.toLocaleString()}</>;
}
