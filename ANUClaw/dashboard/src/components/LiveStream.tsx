import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useSSE, SSEEvent } from '../lib/useSSE';
import { Pause, Play } from 'lucide-react';
import { ECGPulse } from './ECGLine';

const TYPE_META: Record<string, { color: string; icon: string }> = {
  'message.received':   { color: '#3085A8', icon: '↓' },
  'message.sent':       { color: '#00C878', icon: '↑' },
  'hook.fired':         { color: '#FFB300', icon: '⚡' },
  'hook.blocked':       { color: '#FF1744', icon: '⛔' },
  'tool.invoked':       { color: '#9C27B0', icon: '⚙' },
  'tool.completed':     { color: '#CE93D8', icon: '✓' },
  'llm.call.started':   { color: '#00B8CC', icon: '🧠' },
  'llm.call.completed': { color: '#00D4EB', icon: '✔' },
  'task.executed':      { color: '#FF6D00', icon: '⏱' },
  'channel.status':     { color: '#26C6DA', icon: '📡' },
  'audit.event':        { color: '#546E7A', icon: '📋' },
};

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈', discord: '🎮', slack: '💬', whatsapp: '📱',
  gmail: '📧', signal: '🔒', matrix: '🔷', web: '🌐',
};

export function LiveStream({ maxEvents = 60 }: { maxEvents?: number }) {
  const liveEvents = useSSE(maxEvents);
  const [paused, setPaused]   = useState(false);
  const [frozen, setFrozen]   = useState<SSEEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault(); setPaused(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const display = paused ? frozen : liveEvents;

  return (
    <div className="glass flex flex-col gap-0" style={{ height: 340 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 flex-1">
          <h2 className="section-heading">Live Activity</h2>
          {!paused && <ECGPulse color="#00D4EB" />}
        </div>
        <div className="flex items-center gap-2">
          {paused ? (
            <span className="badge-warn-med">Paused</span>
          ) : (
            <span className="badge-online">
              <span className="w-1.5 h-1.5 rounded-full dot-online animate-pulse-slow" />
              Live
            </span>
          )}
          <button
            onClick={() => { if (!paused) setFrozen([...liveEvents]); setPaused(v => !v); }}
            className="btn-ghost-med p-1.5 rounded-lg"
            aria-label={paused ? 'Resume' : 'Pause (Space)'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
        </div>
      </div>

      {/* Event list */}
      <div
        className="flex-1 overflow-y-auto px-2 py-1"
        role="log"
        aria-live={paused ? 'off' : 'polite'}
        aria-label="Live event feed"
      >
        {display.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Waiting for events…</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {display.slice(0, 40).map((evt, i) => {
              const meta = TYPE_META[evt.type] ?? { color: '#546E7A', icon: '•' };
              return (
                <motion.div
                  key={`${evt.ts}-${i}`}
                  initial={!paused ? { opacity: 0, x: -10 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg my-0.5 text-xs"
                  style={{ background: i === 0 && !paused ? 'rgba(0,184,204,0.04)' : 'transparent' }}
                >
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-2xs"
                    style={{ background: `rgba(${hexToRgb(meta.color)},0.15)`, color: meta.color }}
                  >
                    {meta.icon}
                  </span>
                  <span className="mono-med w-36 shrink-0 truncate" style={{ color: meta.color }}>
                    {evt.type}
                  </span>
                  {!!evt.payload.channel && (
                    <span className="shrink-0" title={String(evt.payload.channel)}>
                      {CHANNEL_ICONS[String(evt.payload.channel)] ?? '•'}
                    </span>
                  )}
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                    {String(evt.payload.msgPreview ?? evt.payload.groupId ?? JSON.stringify(evt.payload)).slice(0, 60)}
                  </span>
                  <span className="mono-med shrink-0" style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                    {formatDistanceToNow(new Date(evt.ts), { addSuffix: false })}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="px-5 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-3xs" style={{ color: 'var(--text-dim)' }}>
          {display.length} events · Press <kbd className="mono-med px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', fontSize: 10 }}>Space</kbd> to pause
        </span>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
