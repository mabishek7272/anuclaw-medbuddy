import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  animateIn?: boolean;
  delay?: number;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-6',
};

export function GlassCard({
  children, className, glow = false, animateIn = true, delay = 0, onClick, padding = 'md',
}: GlassCardProps) {
  const base = clsx('glass', glow && 'glass-hover', paddings[padding], className);

  if (!animateIn) {
    return <div className={base} onClick={onClick}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
      className={base}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {children}
    </motion.div>
  );
}

export function GlassCardGlowing({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={clsx('glow-border', className)}
    >
      <div className="glass rounded-[var(--radius)] h-full">{children}</div>
    </motion.div>
  );
}
