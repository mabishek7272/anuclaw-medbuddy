import React from 'react';

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="glass p-5 space-y-3" aria-hidden>
      <div className="skel h-4 w-1/3 rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skel h-3 rounded ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass overflow-hidden" aria-hidden>
      <div className="skel h-9 w-full rounded-none" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel h-11 w-full rounded-none" style={{ animationDelay: `${i * 0.07}s` }} />
      ))}
    </div>
  );
}
