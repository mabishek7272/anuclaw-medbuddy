import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export function AnimatedCounter({ value, duration = 1200, decimals = 0, prefix = '', suffix = '' }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const prevRef  = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    prevRef.current = value;

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    startRef.current = null;

    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * ease;
      setDisplayed(current);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    }

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [value, duration]);

  const formatted = displayed.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return <>{prefix}{formatted}{suffix}</>;
}
