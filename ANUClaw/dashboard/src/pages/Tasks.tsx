import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Play, Trash2, CalendarClock, X, CheckCircle, XCircle } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';

interface Task {
  id: string;
  name: string;
  cron: string;
  skill: string;
  prompt: string;
  enabled: number;
  last_run: number | null;
  last_status: string | null;
  run_count: number;
}

const STATUS_STYLE: Record<string, { color: string; Icon: typeof CheckCircle }> = {
  success: { color: '#00C878', Icon: CheckCircle },
  failed:  { color: '#FF1744', Icon: XCircle },
};

export default function Tasks() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', cron: '0 * * * *', skill: '', prompt: '', group_id: '' });

  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  function apiFn(path: string, method = 'POST', body?: object) {
    return fetch(path, {
      method, credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json());
  }

  const create  = useMutation({ mutationFn: (b: typeof form) => apiFn('/api/tasks', 'POST', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setShowCreate(false); } });
  const toggle  = useMutation({ mutationFn: (id: string) => apiFn(`/api/tasks/${id}/toggle`, 'PATCH'), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) });
  const trigger = useMutation({ mutationFn: (id: string) => apiFn(`/api/tasks/${id}/trigger`, 'POST'), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) });
  const remove  = useMutation({ mutationFn: (id: string) => apiFn(`/api/tasks/${id}`, 'DELETE'), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) });

  const tasks = data?.tasks ?? [];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#E8EEF6' }}>
            <CalendarClock size={18} style={{ color: '#00B8CC' }} />
            Scheduled Tasks
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{tasks.length} tasks · cron-based automation</p>
        </div>
        <button className="btn-med flex items-center gap-2" onClick={() => setShowCreate(v => !v)}>
          <Plus size={14} />
          New Task
        </button>
      </motion.div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="section-heading">Create Task</h2>
                <button onClick={() => setShowCreate(false)} className="btn-ghost-med p-1 rounded"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'name',     label: 'Task name' },
                  { key: 'cron',     label: 'Cron schedule' },
                  { key: 'skill',    label: 'Skill (optional)' },
                  { key: 'group_id', label: 'Group ID (optional)' },
                ] as const).map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                    <input
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="input-med text-sm w-full"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt</label>
                <textarea
                  rows={2}
                  value={form.prompt}
                  onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                  className="input-med text-sm w-full resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-med" onClick={() => create.mutate(form)} disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create Task'}
                </button>
                <button className="btn-ghost-med" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tasks table */}
      {isLoading ? (
        <div className="glass p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel h-12 rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <CalendarClock size={32} className="mx-auto mb-2 opacity-20" style={{ color: '#00B8CC' }} />
          <p style={{ color: 'var(--text-muted)' }}>No scheduled tasks. Create one above.</p>
        </GlassCard>
      ) : (
        <div className="glass overflow-hidden">
          {/* Header */}
          <div className="grid gap-3 px-4 py-2.5 text-xs font-medium"
            style={{ gridTemplateColumns: '1fr 130px 120px 60px 130px 80px 120px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>
            <span>Name</span><span>Cron</span><span>Skill</span><span>Runs</span><span>Last Run</span><span>Status</span><span></span>
          </div>
          <AnimatePresence initial={false}>
            {tasks.map((t, i) => {
              const st = t.last_status ? STATUS_STYLE[t.last_status] : null;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="grid gap-3 px-4 py-3 text-xs items-center transition-colors hover:bg-white/[0.02]"
                  style={{ gridTemplateColumns: '1fr 130px 120px 60px 130px 80px 120px', borderBottom: '1px solid var(--border)' }}
                >
                  <span className="font-medium truncate" style={{ color: '#E8EEF6' }}>{t.name}</span>
                  <span className="font-mono" style={{ color: '#CE93D8' }}>{t.cron}</span>
                  <span className="font-mono truncate" style={{ color: '#00B8CC' }}>{t.skill || '—'}</span>
                  <span className="font-mono text-right" style={{ color: 'var(--text-muted)' }}>{t.run_count}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t.last_run ? formatDistanceToNow(new Date(t.last_run), { addSuffix: true }) : '—'}
                  </span>
                  <span className="flex items-center gap-1" style={{ color: st?.color ?? 'var(--text-muted)' }}>
                    {st && <st.Icon size={11} />}
                    {t.last_status ?? '—'}
                  </span>
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => toggle.mutate(t.id)}
                      className="text-xs py-1 px-2 rounded-lg transition-all"
                      style={{
                        background: t.enabled ? 'rgba(0,184,204,0.15)' : 'rgba(255,255,255,0.05)',
                        color: t.enabled ? '#00B8CC' : 'var(--text-muted)',
                        border: `1px solid ${t.enabled ? 'rgba(0,184,204,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      {t.enabled ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => trigger.mutate(t.id)} className="btn-ghost-med p-1.5 rounded-lg" aria-label="Run now" title="Run now">
                      <Play size={11} />
                    </button>
                    <button
                      onClick={() => { if (confirm('Delete task?')) remove.mutate(t.id); }}
                      className="btn-ghost-med p-1.5 rounded-lg"
                      style={{ color: '#FF1744' }}
                      aria-label="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
