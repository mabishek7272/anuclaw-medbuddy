import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkline } from '../components/Sparkline';
import { GlassCard } from '../components/GlassCard';
import { formatDistanceToNow } from 'date-fns';
import { Radio, ExternalLink, Zap, AlertTriangle } from 'lucide-react';

const HOOK_EVENTS = [
  { event: 'BeforeMessage',  label: 'Before Message',   color: '#00B8CC', icon: '📨', description: 'Runs before any user message is processed. Can block or modify.' },
  { event: 'BeforeLLMCall',  label: 'Before LLM Call',  color: '#9C27B0', icon: '🧠', description: 'Fires before each LLM API call. Can inject context or abort.' },
  { event: 'BeforeToolCall', label: 'Before Tool Call', color: '#00C878', icon: '⚙',  description: 'Fires before a skill/tool is invoked. Can block restricted actions.' },
  { event: 'AfterToolCall',  label: 'After Tool Call',  color: '#CE93D8', icon: '✓',  description: 'Fires after a tool returns. Can modify output or log results.' },
  { event: 'AfterMessage',   label: 'After Message',    color: '#FFB300', icon: '↑',  description: 'Fires after the assistant response is ready. Can transform output.' },
];

interface HookEntry {
  index: number;
  id?: string;
  name?: string;
  event?: string;
  enabled: boolean;
  stats: { fires: number; last_fired: number | null; blocks: number };
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="shrink-0 w-11 h-6 rounded-full transition-all duration-200 relative"
      style={{ background: on ? '#00B8CC' : 'rgba(255,255,255,0.08)', border: `1px solid ${on ? '#00B8CC' : 'rgba(255,255,255,0.1)'}` }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200"
        style={{ width: 18, height: 18, transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

export default function Hooks() {
  const qc = useQueryClient();
  const [streamEvent, setStreamEvent] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ hooks: HookEntry[] }>({
    queryKey: ['hooks'],
    queryFn: () => fetch('/api/hooks', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: logData } = useQuery<{ log: any[] }>({
    queryKey: ['hook-log'],
    queryFn: () => fetch('/api/hooks/log?limit=100', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 8_000,
  });

  const toggle = useMutation({
    mutationFn: (idx: number) =>
      fetch(`/api/hooks/${idx}/toggle`, { method: 'PATCH', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hooks'] }),
  });

  const allHooks = data?.hooks ?? [];
  const logEntries = logData?.log ?? [];

  const hooksByEvent = new Map<string, HookEntry[]>();
  for (const h of allHooks) {
    const key = h.event ?? 'Unknown';
    hooksByEvent.set(key, [...(hooksByEvent.get(key) ?? []), h]);
  }

  function getSparkData(event: string): number[] {
    const now = Date.now();
    return Array.from({ length: 12 }, (_, i) => {
      const start = now - (12 - i) * 3600000;
      const end   = now - (11 - i) * 3600000;
      return logEntries.filter(e =>
        e.action === 'hook.fired' &&
        (e.target_id ?? '').includes(event.toLowerCase()) &&
        e.ts >= start && e.ts < end
      ).length;
    });
  }

  function getStatsForEvent(event: string) {
    const fires  = logEntries.filter(e => e.action === 'hook.fired'   && (e.target_id ?? '').includes(event.toLowerCase())).length;
    const blocks = logEntries.filter(e => e.action === 'hook.blocked' && (e.target_id ?? '').includes(event.toLowerCase())).length;
    const last   = logEntries.find(e => (e.target_id ?? '').includes(event.toLowerCase()));
    return { fires, blocks, last_fired: last?.ts ?? null };
  }

  const filteredLog = streamEvent
    ? logEntries.filter(e => (e.target_id ?? '').toLowerCase().includes(streamEvent.toLowerCase()))
    : logEntries;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>Hook Engine</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>5 lifecycle events · configure and monitor hook triggers</p>
      </motion.div>

      {/* Event cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {HOOK_EVENTS.map(({ event, label, color, icon, description }, i) => {
            const stats = getStatsForEvent(event);
            const sparkData = getSparkData(event);
            const hooksForEvent = hooksByEvent.get(event) ?? hooksByEvent.get(label) ?? [];
            const allEnabled = hooksForEvent.length > 0 && hooksForEvent.every(h => h.enabled);
            const streaming = streamEvent === event;

            return (
              <motion.div
                key={event}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                <div
                  className="glass glass-hover flex flex-col gap-4 p-5 relative overflow-hidden"
                  style={{ border: streaming ? `1px solid ${color}40` : undefined }}
                >
                  {/* Top accent */}
                  <div className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                        aria-hidden>{icon}</span>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: '#E8EEF6' }}>{label}</p>
                        <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{description}</p>
                      </div>
                    </div>
                    {hooksForEvent.length > 0 ? (
                      <Toggle
                        on={allEnabled}
                        onToggle={() => hooksForEvent.forEach(h => toggle.mutate(h.index))}
                        label={`Toggle ${label} hooks`}
                      />
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        None
                      </span>
                    )}
                  </div>

                  {/* Stats + sparkline */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold font-mono" style={{ color }}>{stats.fires}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>fires (24h)</span>
                      </div>
                      {stats.blocks > 0 && (
                        <div className="flex items-center gap-1 text-xs" style={{ color: '#FF1744' }}>
                          <AlertTriangle size={11} />
                          {stats.blocks} blocked
                        </div>
                      )}
                      {stats.last_fired && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Last: {formatDistanceToNow(new Date(stats.last_fired), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <Sparkline data={sparkData} width={90} height={36} color={color} />
                  </div>

                  {/* Per-hook toggles */}
                  {hooksForEvent.map(h => (
                    <div key={h.index} className="flex items-center justify-between py-2"
                      style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="font-mono text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {h.name ?? h.id ?? `hook-${h.index}`}
                      </span>
                      <Toggle on={h.enabled} onToggle={() => toggle.mutate(h.index)} label={`Toggle ${h.name ?? h.index}`} />
                    </div>
                  ))}

                  {/* Stream toggle */}
                  <button
                    onClick={() => setStreamEvent(streaming ? null : event)}
                    className="flex items-center gap-1.5 text-xs transition-colors mt-1"
                    style={{ color: streaming ? color : 'var(--text-muted)' }}
                  >
                    <ExternalLink size={11} />
                    {streaming ? 'Hide live stream' : 'View live stream'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Live hook event log */}
      <GlassCard delay={0.4} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="section-heading flex items-center gap-2">
            <Radio size={14} />
            {streamEvent ? `${streamEvent} Events` : 'All Hook Events'}
          </h2>
          {streamEvent && (
            <button className="btn-ghost-med text-xs py-1 px-3" onClick={() => setStreamEvent(null)}>
              Show all
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto space-y-0.5 font-mono text-xs">
          {filteredLog.length === 0 ? (
            <p className="py-6 text-center" style={{ color: 'var(--text-muted)' }}>No hook events yet.</p>
          ) : (
            <AnimatePresence initial={false}>
              {filteredLog.slice(0, 50).map((e: any) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-2 items-start py-1.5 px-2 rounded-lg hover:bg-white/[0.02]"
                >
                  <span className="w-20 shrink-0 tabular-nums" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                  </span>
                  <span
                    className="w-20 shrink-0 font-semibold"
                    style={{ color: e.action === 'hook.blocked' ? '#FF1744' : '#FFB300', fontSize: 10 }}
                  >
                    {e.action === 'hook.blocked' ? 'BLOCKED' : 'FIRED'}
                  </span>
                  <span className="truncate" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {e.target_id ?? e.group_id ?? '—'}
                  </span>
                  {e.channel && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-3xs"
                      style={{ background: 'rgba(0,184,204,0.1)', color: '#00B8CC', border: '1px solid rgba(0,184,204,0.2)', fontSize: 10 }}>
                      {e.channel}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
