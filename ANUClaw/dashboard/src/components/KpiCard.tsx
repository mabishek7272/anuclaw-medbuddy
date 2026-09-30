import React from 'react';
import { motion } from 'framer-motion';
import { AnimatedCounter } from './AnimatedCounter';
import { Sparkline } from './Sparkline';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number;
  delta?: number;
  sparkData?: number[];
  icon?: React.ReactNode;
  color?: string;
  delay?: number;
  unit?: string;
}

export function KpiCard({ title, value, delta, sparkData, icon, color = '#00B8CC', delay = 0, unit }: KpiCardProps) {
  const TrendIcon = delta == null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta == null ? '' : delta > 0 ? '#00E676' : delta < 0 ? '#FF1744' : '#64748B';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="glass glass-hover relative overflow-hidden p-5 flex flex-col gap-3"
    >
      {/* Teal top border accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      {/* Corner glow */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="section-heading">{title}</span>
        {icon && (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `rgba(0,184,204,0.1)`, color }}>
            {icon}
          </span>
        )}
      </div>

      {/* Value + sparkline */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="kpi-value" style={{ color }}>
            <AnimatedCounter value={value} duration={1000} />
          </span>
          {unit && <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
        </div>
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={color} width={80} height={32} />
        )}
      </div>

      {/* Delta */}
      {delta != null && TrendIcon && (
        <div className="flex items-center gap-1 text-xs" style={{ color: trendColor }}>
          <TrendIcon size={12} aria-hidden />
          <span>{Math.abs(delta).toFixed(1)}% vs yesterday</span>
        </div>
      )}
    </motion.div>
  );
}
