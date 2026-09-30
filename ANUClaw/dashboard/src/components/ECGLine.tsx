import React from 'react';

interface ECGLineProps {
  width?: number;
  height?: number;
  color?: string;
  speed?: number; // animation duration seconds
  className?: string;
}

// Classic ECG/heartbeat waveform path
const ECG_PATH = 'M0,30 L20,30 L25,30 L30,10 L35,50 L40,5 L45,50 L50,30 L55,30 L70,30 L75,30 L80,18 L85,42 L88,26 L91,30 L120,30';

export function ECGLine({ width = 120, height = 60, color = '#00D4EB', speed = 2.5, className = '' }: ECGLineProps) {
  const pathLength = 300;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 60"
      aria-hidden
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="ecg-glow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="ecg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={color} stopOpacity="0" />
          <stop offset="40%"  stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Trail */}
      <path
        d={ECG_PATH}
        fill="none"
        stroke={`url(#ecg-fade)`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Main animated line */}
      <path
        d={ECG_PATH}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ecg-glow)"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength}
        style={{
          animation: `ecgDraw ${speed}s linear infinite`,
        }}
      />
      {/* Moving dot at the front */}
      <circle r="2.5" fill={color} filter="url(#ecg-glow)" opacity="0.9">
        <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={ECG_PATH} />
      </circle>
    </svg>
  );
}

// Compact version for header
export function ECGPulse({ color = '#00D4EB' }: { color?: string }) {
  return (
    <svg width="60" height="24" viewBox="0 0 60 24" aria-hidden>
      <defs>
        <filter id="pulse-glow">
          <feGaussianBlur stdDeviation="1" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path
        d="M0,12 L10,12 L14,12 L17,4 L20,22 L22,2 L25,22 L28,12 L32,12 L40,12 L43,8 L46,17 L48,12 L60,12"
        fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"
        filter="url(#pulse-glow)"
        strokeDasharray="200"
        strokeDashoffset="200"
        style={{ animation: 'ecgDraw 2s linear infinite' }}
      />
    </svg>
  );
}
