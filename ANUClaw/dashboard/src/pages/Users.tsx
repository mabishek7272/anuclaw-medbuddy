import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { UserPlus, Trash2, Key, Shield, X } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';

interface DashUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: number;
  last_login_at: number | null;
}

const ROLES = ['admin', 'operator', 'viewer', 'auditor', 'compliance'];

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  admin:      { bg: 'rgba(0,184,204,0.12)',  text: '#00D4EB', border: 'rgba(0,184,204,0.3)' },
  operator:   { bg: 'rgba(156,39,176,0.12)', text: '#CE93D8', border: 'rgba(156,39,176,0.3)' },
  viewer:     { bg: 'rgba(84,110,122,0.12)', text: '#90A4AE', border: 'rgba(84,110,122,0.3)' },
  auditor:    { bg: 'rgba(255,179,0,0.12)',  text: '#FFB300', border: 'rgba(255,179,0,0.3)' },
  compliance: { bg: 'rgba(0,200,120,0.12)',  text: '#00C878', border: 'rgba(0,200,120,0.3)' },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {role}
    </span>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer', password: '' });
  const [pwTarget, setPwTarget] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');

  const { data, isLoading } = useQuery<{ users: DashUser[] }>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: (body: typeof form) =>
      fetch('/api/users', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); setForm({ email: '', name: '', role: 'viewer', password: '' }); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const changePw = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      fetch(`/api/users/${id}/password`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).then(r => r.json()),
    onSuccess: () => { setPwTarget(null); setNewPw(''); },
  });

  const users = data?.users ?? [];

  return (
    <div className="space-y-5" style={{ maxWidth: 900 }}>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#E8EEF6' }}>
            <Shield size={18} style={{ color: '#00B8CC' }} />
            Users & Access
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{users.length} users · 5 RBAC roles</p>
        </div>
        <button className="btn-med flex items-center gap-2" onClick={() => setShowCreate(v => !v)}>
          <UserPlus size={14} />
          {showCreate ? 'Cancel' : 'Add User'}
        </button>
      </motion.div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="section-heading">New User</h2>
                <button onClick={() => setShowCreate(false)} className="btn-ghost-med p-1 rounded"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['email', 'name', 'password'] as const).map(k => (
                  <div key={k}>
                    <label className="block text-xs mb-1.5 font-medium capitalize" style={{ color: 'var(--text-muted)' }}>{k}</label>
                    <input
                      type={k === 'password' ? 'password' : 'text'}
                      value={form[k]}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="input-med text-sm w-full"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="input-med text-sm w-full"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-med" onClick={() => create.mutate(form)} disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create User'}
                </button>
              </div>
              {create.isError && (
                <p className="text-xs" style={{ color: '#FF1744' }}>{(create.error as Error).message}</p>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change password panel */}
      <AnimatePresence>
        {pwTarget && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="section-heading">Change Password</h2>
                <button onClick={() => setPwTarget(null)} className="btn-ghost-med p-1 rounded"><X size={14} /></button>
              </div>
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="input-med text-sm"
                style={{ maxWidth: 300 }}
              />
              <div className="flex gap-2">
                <button className="btn-med" onClick={() => changePw.mutate({ id: pwTarget, password: newPw })} disabled={changePw.isPending}>
                  {changePw.isPending ? 'Saving…' : 'Save Password'}
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users table */}
      {isLoading ? (
        <div className="glass p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel h-10 rounded-lg" />)}
        </div>
      ) : (
        <div className="glass overflow-hidden">
          {/* Header */}
          <div className="grid gap-3 px-4 py-2.5 text-xs font-medium"
            style={{ gridTemplateColumns: '1fr 120px 100px 140px 80px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>
            <span>Email</span><span>Name</span><span>Role</span><span>Last Login</span><span></span>
          </div>
          {users.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="grid gap-3 px-4 py-3 text-sm items-center transition-colors hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: '1fr 120px 100px 140px 80px', borderBottom: '1px solid var(--border)' }}
            >
              <span className="font-mono text-xs truncate" style={{ color: '#E8EEF6' }}>{u.email}</span>
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>{u.name ?? '—'}</span>
              <span><RoleBadge role={u.role} /></span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : 'Never'}
              </span>
              <div className="flex gap-1 justify-end">
                <button onClick={() => { setPwTarget(u.id); setNewPw(''); }} className="btn-ghost-med p-1.5 rounded-lg" aria-label="Change password">
                  <Key size={13} />
                </button>
                <button
                  onClick={() => { if (confirm(`Delete ${u.email}?`)) remove.mutate(u.id); }}
                  className="btn-ghost-med p-1.5 rounded-lg"
                  style={{ color: '#FF1744' }}
                  aria-label="Delete user"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No users found.</p>
          )}
        </div>
      )}

      {/* RBAC info */}
      <GlassCard delay={0.3} className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: '#00B8CC' }}>Role Permissions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span><strong style={{ color: '#E8EEF6' }}>Admin</strong> — full access</span>
          <span><strong style={{ color: '#E8EEF6' }}>Operator</strong> — manage hooks &amp; tasks</span>
          <span><strong style={{ color: '#E8EEF6' }}>Viewer</strong> — read-only</span>
          <span><strong style={{ color: '#E8EEF6' }}>Auditor</strong> — audit log access</span>
          <span><strong style={{ color: '#E8EEF6' }}>Compliance</strong> — export &amp; audit</span>
        </div>
      </GlassCard>
    </div>
  );
}
