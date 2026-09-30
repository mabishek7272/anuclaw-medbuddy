import React from 'react';

type Status = 'green' | 'amber' | 'red' | 'disabled';

const DOT_CLASS: Record<Status, string> = {
  green:    'dot-online',
  amber:    'dot-warn',
  red:      'dot-danger',
  disabled: 'dot-offline',
};

export function StatusDot({ status, label }: { status: Status; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASS[status]}`}
        aria-label={`Status: ${status}`}
        role="img"
      />
      {label && <span className="text-sm" style={{ color: '#E8EEF6' }}>{label}</span>}
    </span>
  );
}
