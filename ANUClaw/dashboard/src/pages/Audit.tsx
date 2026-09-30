import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, ChevronDown, ChevronRight, ShieldCheck, Filter } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';

interface AuditEvent {
  id: number;
  ts: number;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_json: string | null;
  after_json: string | null;
  channel: string | null;
  group_id: string | null;
  ip: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  'message.received': '#00B8CC',
  'message.sent':     '#00C878',
  'hook.fired':       '#FFB300',
  'hook.blocked':     '#FF1744',
  'tool.invoked':     '#9C27B0',
  'task.executed':    '#FF6D00',
  'hook.toggle':      '#00D4EB',
  'task.create':      '#26C6DA',
  'user.login':       '#CE93D8',
};

export default function Audit() {
  const [action, setAction]     = useState('');
  const [actor, setActor]       = useState('');
  const [channel, setChannel]   = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [page, setPage]         = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const limit = 50;

  const fromTs = fromDate ? new Date(fromDate).getTime() : 0;
  const toTs   = toDate   ? new Date(toDate + 'T23:59:59').getTime() : Date.now();

  const { data, isLoading } = useQuery<{ events: AuditEvent[]; total: number }>({
    queryKey: ['audit', action, actor, channel, fromTs, toTs, page],
    queryFn: () => fetch(
      `/api/audit?limit=${limit}&offset=${page * limit}` +
      `&action=${encodeURIComponent(action)}&actor=${encodeURIComponent(actor)}` +
      `&channel=${encodeURIComponent(channel)}&from=${fromTs}&to=${toTs}`,
      { credentials: 'include' }
    ).then(r => r.json()),
    refetchInterval: 20_000,
  });

  const events = data?.events ?? [];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#E8EEF6' }}>
            <ShieldCheck size={18} style={{ color: '#00B8CC' }} />
            Audit Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{data?.total ?? 0} events · HMAC-signed export</p>
        </div>
        <button
          className="btn-med flex items-center gap-2"
          onClick={() => window.open(`/api/audit/export?from=${fromTs}&to=${toTs}`, '_blank')}
          aria-label="Export signed NDJSON"
        >
          <Download size={14} />
          Export NDJSON
        </button>
      </motion.div>

      {/* Filter bar */}
      <GlassCard delay={0.1} className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Action',  value: action,   set: setAction,   ph: 'hook.fired…' },
            { label: 'Actor',   value: actor,    set: setActor,    ph: 'User or system' },
            { label: 'Channel', value: channel,  set: setChannel,  ph: 'telegram…' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
              <input
                value={f.value}
                onChange={e => { f.set(e.target.value); setPage(0); }}
                placeholder={f.ph}
                className="input-med text-xs"
                style={{ width: 175 }}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(0); }} className="input-med text-xs" style={{ width: 150 }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(0); }} className="input-med text-xs" style={{ width: 150 }} />
          </div>
          <div className="self-end">
            <button
              className="btn-ghost-med text-xs py-2 px-3"
              onClick={() => { setAction(''); setActor(''); setChannel(''); setFromDate(''); setToDate(''); setPage(0); }}
            >
              Clear
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Event table */}
      {isLoading ? (
        <div className="glass p-0 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skel h-10 mx-4 my-2 rounded-lg" style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <ShieldCheck size={32} className="mx-auto mb-2 opacity-20" style={{ color: '#00B8CC' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            No events match.{' '}
            <button className="underline" style={{ color: '#00B8CC' }}
              onClick={() => { setAction(''); setActor(''); setChannel(''); setFromDate(''); setToDate(''); }}>
              Clear filters
            </button>
          </p>
        </GlassCard>
      ) : (
        <div className="glass overflow-hidden">
          {/* Table header */}
          <div
            className="grid gap-2 px-4 py-2.5 text-xs font-medium"
            style={{
              gridTemplateColumns: '140px 1fr 110px 110px 90px 80px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-muted)',
            }}
          >
            <span>Time</span><span>Action</span><span>Actor</span>
            <span>Target</span><span>Channel</span><span>IP</span>
          </div>

          <AnimatePresence initial={false}>
            {events.map((e, idx) => (
              <React.Fragment key={e.id}>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="w-full grid gap-2 px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/[0.02]"
                  style={{
                    gridTemplateColumns: '140px 1fr 110px 110px 90px 80px',
                    borderBottom: '1px solid var(--border)',
                    color: '#E8EEF6',
                  }}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  aria-expanded={expanded === e.id}
                >
                  <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {format(new Date(e.ts), 'MM-dd HH:mm:ss')}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    {expanded === e.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <span style={{ color: ACTION_COLORS[e.action] ?? '#00B8CC' }}>{e.action}</span>
                  </span>
                  <span className="font-mono truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.actor_id ?? '—'}</span>
                  <span className="font-mono truncate" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.target_id ?? '—'}</span>
                  <span className="capitalize" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.channel ?? '—'}</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.ip ?? '—'}</span>
                </motion.button>

                <AnimatePresence>
                  {expanded === e.id && (e.before_json || e.after_json) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 py-4 grid grid-cols-2 gap-4 text-xs font-mono"
                        style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <p className="font-sans font-semibold mb-2 text-xs" style={{ color: '#FF1744' }}>Before</p>
                          <pre className="p-3 rounded-xl overflow-x-auto max-h-36"
                            style={{ background: 'rgba(255,23,68,0.05)', border: '1px solid rgba(255,23,68,0.15)', color: '#E8EEF6', fontSize: 11 }}>
                            {e.before_json ? JSON.stringify(JSON.parse(e.before_json), null, 2) : '—'}
                          </pre>
                        </div>
                        <div>
                          <p className="font-sans font-semibold mb-2 text-xs" style={{ color: '#00C878' }}>After</p>
                          <pre className="p-3 rounded-xl overflow-x-auto max-h-36"
                            style={{ background: 'rgba(0,200,120,0.05)', border: '1px solid rgba(0,200,120,0.15)', color: '#E8EEF6', fontSize: 11 }}>
                            {e.after_json ? JSON.stringify(JSON.parse(e.after_json), null, 2) : '—'}
                          </pre>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <button className="btn-ghost-med text-xs py-1.5 px-3" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
          Previous
        </button>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Page {page + 1} · {data?.total ?? 0} total
        </span>
        <button className="btn-ghost-med text-xs py-1.5 px-3" disabled={(data?.events.length ?? 0) < limit} onClick={() => setPage(p => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
