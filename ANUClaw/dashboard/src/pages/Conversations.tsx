import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Brain, X, Trash2, MessageSquare, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈', discord: '🎮', slack: '💬', whatsapp: '📱',
  gmail: '📧', signal: '🔒', matrix: '🔷', web: '🌐', irc: '⌨',
};

interface Group {
  group_id: string;
  event_count: number;
  last_activity: number;
  created_at: number;
  last_user: string | null;
}

function apiFetch(path: string, method = 'GET') {
  return fetch(`/api${path}`, { method, credentials: 'include' }).then(r => r.json());
}

export default function Conversations() {
  const qc = useQueryClient();
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab]           = useState<'messages' | 'memory'>('messages');

  const { data, isLoading } = useQuery<{ groups: Group[]; total: number }>({
    queryKey: ['conversations', search],
    queryFn: () => apiFetch(`/conversations?search=${encodeURIComponent(search)}&limit=50`),
    refetchInterval: 10_000,
  });

  const { data: detail } = useQuery({
    queryKey: ['conv-messages', selected],
    queryFn: () => apiFetch(`/conversations/${selected}/messages`),
    enabled: !!selected,
  });

  const { data: memData } = useQuery({
    queryKey: ['conv-memory', selected],
    queryFn: () => apiFetch(`/conversations/${selected}/memory`),
    enabled: !!selected && tab === 'memory',
  });

  const clearMemory = useMutation({
    mutationFn: (id: string) => apiFetch(`/conversations/${id}/memory`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conv-memory'] }),
  });

  const groups  = data?.groups ?? [];
  const events  = (detail as any)?.events ?? [];
  const toolCalls = (detail as any)?.toolCalls ?? [];

  function channelOf(id: string) { return id.split('-')[0] ?? ''; }

  return (
    <div className="flex gap-0 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 130px)', border: '1px solid var(--border)' }}>
      {/* ── Left: group list ─────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'rgba(6,13,26,0.8)', borderRight: '1px solid var(--border)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Full-text search (FTS)…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-med text-xs pl-8 w-full"
              aria-label="Search conversations"
            />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{data?.total ?? 0} groups</p>
        </div>

        <div className="flex-1 overflow-y-auto" role="list">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel h-12 rounded-lg" />)}
            </div>
          ) : groups.length === 0 ? (
            <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No conversations yet.</p>
            </div>
          ) : (
            groups.map(g => {
              const ch = channelOf(g.group_id);
              const isActive = selected === g.group_id;
              return (
                <button
                  key={g.group_id}
                  role="listitem"
                  onClick={() => { setSelected(g.group_id); setTab('messages'); }}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{
                    background: isActive ? 'rgba(0,184,204,0.08)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? '#00B8CC' : 'transparent'}`,
                    borderBottom: '1px solid var(--border)',
                  }}
                  aria-selected={isActive}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span title={ch} aria-hidden>{CHANNEL_ICONS[ch] ?? '💬'}</span>
                      <span className="font-mono text-xs truncate" style={{ color: isActive ? '#00D4EB' : '#E8EEF6' }}>
                        {g.group_id.slice(0, 22)}
                      </span>
                    </div>
                    <span className="text-xs shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{g.event_count}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {g.last_activity ? formatDistanceToNow(new Date(g.last_activity), { addSuffix: true }) : '—'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: detail ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'rgba(5,10,18,0.7)' }}>
        {selected ? (
          <>
            {/* Toolbar */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5"
              style={{ borderBottom: '1px solid var(--border)', background: 'rgba(6,13,26,0.6)' }}>
              <span className="font-mono text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>{selected}</span>
              <button
                className="btn-ghost-med flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg"
                onClick={() => setTab(tab === 'memory' ? 'messages' : 'memory')}
              >
                <Brain size={12} /> Memory
              </button>
              <button
                className="btn-ghost-med p-1.5 rounded-lg"
                style={{ color: '#FF6D00' }}
                onClick={() => { if (confirm('Clear memory for this group?')) clearMemory.mutate(selected); }}
                title="Clear memory"
              >
                <Trash2 size={12} />
              </button>
              <button className="btn-ghost-med p-1.5 rounded-lg" onClick={() => setSelected(null)} aria-label="Close">
                <X size={12} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="shrink-0 flex" style={{ borderBottom: '1px solid var(--border)' }}>
              {(['messages', 'memory'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="px-5 py-2.5 text-sm capitalize transition-all"
                  style={{
                    borderBottom: tab === t ? '2px solid #00B8CC' : '2px solid transparent',
                    color: tab === t ? '#00B8CC' : 'var(--text-muted)',
                    fontWeight: tab === t ? 500 : 400,
                  }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <ErrorBoundary label="Conversation failed to load">
                {tab === 'messages' && <MessageTimeline events={events} toolCalls={toolCalls} />}
                {tab === 'memory'   && <MemoryView data={memData} />}
              </ErrorBoundary>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-3"
            >
              <MessageSquare size={40} className="mx-auto opacity-20" style={{ color: '#00B8CC' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a conversation group</p>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageTimeline({ events, toolCalls }: { events: any[]; toolCalls: any[] }) {
  const [expandedTool, setExpandedTool] = useState<number | null>(null);

  const merged = [
    ...events.map((e: any) => ({ ...e, _type: 'event' })),
    ...toolCalls.map((t: any) => ({ ...t, _type: 'tool' })),
  ].sort((a, b) => a.ts - b.ts);

  if (merged.length === 0) {
    return <div className="py-10 text-center" style={{ color: 'var(--text-muted)' }}><p className="text-sm">No messages yet.</p></div>;
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {merged.map((item: any, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
            {item._type === 'event' ? (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: item.action?.includes('received') ? 'rgba(0,184,204,0.06)' : 'rgba(0,200,120,0.06)',
                  borderLeft: `3px solid ${item.action?.includes('received') ? '#00B8CC' : '#00C878'}`,
                }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs" style={{ color: item.action?.includes('received') ? '#00B8CC' : '#00C878' }}>
                    {item.action}
                  </span>
                  <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                    {format(new Date(item.ts), 'HH:mm:ss')}
                  </span>
                </div>
                {item.before_json && (
                  <p className="text-xs" style={{ color: '#E8EEF6' }}>
                    {(() => { try { return JSON.parse(item.before_json)?.text ?? item.before_json; } catch { return item.before_json; } })()}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <button className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedTool(expandedTool === i ? null : i)}>
                  {expandedTool === i ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-mono" style={{ color: '#9C27B0' }}>tool: {item.skill}</span>
                  <span className="ml-auto font-mono" style={{ color: item.success ? '#00C878' : '#FF1744' }}>
                    {item.success ? '✓' : '✗'} {item.latency_ms}ms
                  </span>
                </button>
                <AnimatePresence>
                  {expandedTool === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                        ts: {new Date(item.ts).toISOString()} · id: {item.id}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function MemoryView({ data }: { data: any }) {
  if (!data) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading memory…</p>;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="section-heading mb-2">File Memory (AGENTS.md)</h3>
        <pre className="font-mono text-xs p-4 rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#E8EEF6' }}>
          {data.fileMemory || '(empty)'}
        </pre>
      </div>
      <div>
        <h3 className="section-heading mb-2">Structured Facts ({data.facts?.length ?? 0})</h3>
        <div className="space-y-1">
          {(data.facts ?? []).map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
              <span className="font-mono shrink-0" style={{ color: '#00B8CC' }}>{f.key}</span>
              <span className="flex-1" style={{ color: '#E8EEF6' }}>{f.value}</span>
            </div>
          ))}
          {(data.facts ?? []).length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No structured facts stored.</p>
          )}
        </div>
      </div>
    </div>
  );
}
