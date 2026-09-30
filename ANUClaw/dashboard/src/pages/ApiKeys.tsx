import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Plus, Trash2, Copy, CheckCircle, Eye, EyeOff, X,
  Zap, Brain, Globe, Shield, Activity, Cpu, TrendingUp,
  ChevronRight, BarChart2, Clock, Server,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { ECGLine } from '../components/ECGLine';
import { Sparkline } from '../components/Sparkline';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────
interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked: number;
  user_email?: string;
}

interface PlatformStats {
  msgs: number;
  skills: number;
  users: number;
  avgMs: number;
  uptime: number;
  totalCalls: number;
  successRate: number;
}

function apiFetch(path: string, method = 'GET', body?: object) {
  return fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

// ─── Proof of Value Demo ─────────────────────────────────────
const DEMO_FEATURES = [
  {
    icon: <Cpu size={20} />, color: '#00B8CC',
    title: '1,100+ Specialist Skills',
    detail: 'Medical, genomics, oncology, radiology, pharmacology, EHR/PMR, legal, finance, bioinformatics — all callable via a single API endpoint.',
    metric: '1,100+', metricLabel: 'domain skills',
  },
  {
    icon: <Globe size={20} />, color: '#00C878',
    title: 'Omnichannel Delivery',
    detail: 'Your application sends prompts; ANUClaw delivers through WhatsApp, Telegram, Slack, Discord, Gmail and 9 more channels automatically.',
    metric: '14', metricLabel: 'channels',
  },
  {
    icon: <Brain size={20} />, color: '#9C27B0',
    title: 'Persistent Memory',
    detail: 'Each patient or session carries structured facts and file memory. Your app gets context-aware responses without managing state yourself.',
    metric: '∞', metricLabel: 'sessions',
  },
  {
    icon: <Shield size={20} />, color: '#FFB300',
    title: 'Compliance Ready',
    detail: 'HMAC-signed audit logs, RBAC, HTTP-only tokens, and country-scoped patient UIDs. Drop-in into regulated environments.',
    metric: '100%', metricLabel: 'audited',
  },
  {
    icon: <Activity size={20} />, color: '#FF6D00',
    title: 'Hook Engine',
    detail: '5 lifecycle events let your application inspect, modify, or block any message or tool call — before or after execution.',
    metric: '5', metricLabel: 'hook events',
  },
  {
    icon: <Server size={20} />, color: '#CE93D8',
    title: 'Cloud API',
    detail: 'No infrastructure to manage. Send a request with your `amgi_live_` key and receive a structured JSON response in milliseconds.',
    metric: '<200ms', metricLabel: 'avg response',
  },
];

const DEMO_CODE = `// One API call — 1,100+ skills
const response = await fetch('https://api.anuclaw.amgi.io/v1/message', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer amgi_live_YOUR_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: "Analyse this genomic variant: BRCA1 c.5266dupC",
    channel: "api",
    group_id: "patient-AMGI-US-2024-0001234",
  }),
});

const { reply, skills_used, latency_ms } = await response.json();
// reply: "BRCA1 c.5266dupC is a pathogenic frameshift variant..."
// skills_used: ["anuclaw-genomic-variant-analysis", "anuclaw-clinical-significance"]
// latency_ms: 187`;

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  return <><AnimatedCounter value={to} duration={1500} />{suffix}</>;
}

function ProofOfValue({ onProceed }: { onProceed: () => void }) {
  const [activeFeature, setActiveFeature] = useState(0);
  const [codeCopied, setCodeCopied]       = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: () => apiFetch('/keys/platform-stats'),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    intervalRef.current = setInterval(() => setActiveFeature(f => (f + 1) % DEMO_FEATURES.length), 4000);
    return () => clearInterval(intervalRef.current);
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(DEMO_CODE).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  const feat = DEMO_FEATURES[activeFeature];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="ANUClaw" className="w-16 h-16 rounded-xl object-cover"
            style={{ filter: 'drop-shadow(0 0 12px rgba(0,184,204,0.5))' }} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#E8EEF6' }}>
          ANUClaw Cloud API
        </h1>
        <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
          Embed 1,100+ medical and research AI skills into your application with a single REST endpoint.
          No model hosting, no infrastructure, no compliance overhead.
        </p>
        <div className="flex justify-center">
          <ECGLine width={140} height={40} color="#00D4EB" />
        </div>
      </motion.div>

      {/* Live platform stats */}
      <GlassCard delay={0.1} className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <Activity size={14} style={{ color: '#00B8CC' }} />
          <h2 className="section-heading">Live Platform Metrics</h2>
          <span className="ml-auto flex items-center gap-1.5 text-xs" style={{ color: '#00E676' }}>
            <span className="w-1.5 h-1.5 rounded-full dot-online animate-pulse" />
            Real-time
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Messages Processed', value: stats?.msgs ?? 0,        color: '#00B8CC', suffix: '' },
            { label: 'Skills Available',   value: stats?.skills ?? 1100,   color: '#00C878', suffix: '+' },
            { label: 'Total API Calls',    value: stats?.totalCalls ?? 0,  color: '#9C27B0', suffix: '' },
            { label: 'Success Rate',       value: stats?.successRate ?? 99.9, color: '#00E676', suffix: '%' },
            { label: 'Avg Response',       value: stats?.avgMs ?? 187,     color: '#FFB300', suffix: 'ms' },
            { label: 'Uptime',             value: Math.floor((stats?.uptime ?? 0) / 3600), color: '#26C6DA', suffix: 'h' },
          ].map(({ label, value, color, suffix }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 + 0.2 }}
              className="flex flex-col gap-1 text-center"
            >
              <span className="text-2xl font-bold font-mono tabular-nums" style={{ color }}>
                <CountUp to={value} suffix={suffix} />
              </span>
              <span className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Feature showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auto-cycling feature cards */}
        <GlassCard delay={0.2} className="flex flex-col gap-4">
          <h2 className="section-heading">What You Get</h2>
          <div className="flex gap-2 flex-wrap">
            {DEMO_FEATURES.map((f, i) => (
              <button
                key={f.title}
                onClick={() => { setActiveFeature(i); clearInterval(intervalRef.current); }}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{ background: i === activeFeature ? f.color : 'rgba(255,255,255,0.15)', transform: i === activeFeature ? 'scale(1.4)' : 'scale(1)' }}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${feat.color}18`, color: feat.color, border: `1px solid ${feat.color}30` }}>
                  {feat.icon}
                </div>
                <div>
                  <p className="font-bold text-lg" style={{ color: feat.color }}>{feat.metric}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{feat.metricLabel}</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm mb-2" style={{ color: '#E8EEF6' }}>{feat.title}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{feat.detail}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* All features mini-grid */}
          <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {DEMO_FEATURES.map((f, i) => (
              <button
                key={f.title}
                onClick={() => { setActiveFeature(i); clearInterval(intervalRef.current); }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all text-center"
                style={{
                  background: i === activeFeature ? `${f.color}12` : 'transparent',
                  border: `1px solid ${i === activeFeature ? f.color + '30' : 'transparent'}`,
                }}
              >
                <span style={{ color: f.color }}>{React.cloneElement(f.icon, { size: 14 })}</span>
                <span className="text-3xs leading-tight" style={{ color: i === activeFeature ? '#E8EEF6' : 'var(--text-muted)' }}>
                  {f.title.split(' ').slice(0, 2).join(' ')}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Code sample */}
        <GlassCard delay={0.25} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="section-heading">Integration in 10 Lines</h2>
            <button
              onClick={copyCode}
              className="btn-ghost-med flex items-center gap-1.5 text-xs py-1 px-2"
            >
              {codeCopied ? <><CheckCircle size={12} style={{ color: '#00C878' }} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <pre className="flex-1 font-mono text-xs p-4 rounded-xl overflow-x-auto leading-relaxed"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#E8EEF6', fontSize: 11 }}>
            <code>{DEMO_CODE}</code>
          </pre>
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(0,184,204,0.06)', border: '1px solid rgba(0,184,204,0.15)' }}>
            <Zap size={12} style={{ color: '#00B8CC', marginTop: 1 }} />
            <p className="text-xs" style={{ color: '#C8D8E8' }}>
              Your key is prefixed <code className="font-mono" style={{ color: '#00D4EB' }}>amgi_live_</code> —
              simply swap in your real key. All skills are invoked by the <code className="font-mono" style={{ color: '#00D4EB' }}>message</code> field.
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Use-case cards */}
      <GlassCard delay={0.3} className="space-y-4">
        <h2 className="section-heading">Who Uses the API</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { role: 'Clinical Apps',     icon: '🏥', desc: 'EMR integrations that need real-time genomic interpretation, drug interaction checks, or clinical decision support.' },
            { role: 'Research Tools',    icon: '🔬', desc: 'Lab analysis platforms that want to overlay AI interpretation on sequencing results, imaging findings, or literature.' },
            { role: 'Enterprise Bots',   icon: '🤖', desc: 'Custom chatbots and workflow automation that need deep domain knowledge without building or hosting models.' },
          ].map(({ role, icon, desc }) => (
            <div key={role} className="p-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
              <span className="text-2xl">{icon}</span>
              <p className="font-semibold text-sm" style={{ color: '#E8EEF6' }}>{role}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass p-8 text-center space-y-4"
        style={{ border: '1px solid rgba(0,184,204,0.25)' }}
      >
        <div className="absolute inset-0 rounded-xl opacity-5 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #00B8CC, transparent)' }} />
        <h2 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>
          Ready to integrate ANUClaw into your application?
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Generate your API key below. Keys are prefixed <code className="font-mono" style={{ color: '#00D4EB' }}>amgi_live_</code> and
          are shown once — store them securely.
        </p>
        <button
          onClick={onProceed}
          className="btn-med flex items-center gap-3 mx-auto px-10 py-3.5 text-base"
        >
          <Key size={18} />
          Generate My API Key
          <ChevronRight size={18} />
        </button>
      </motion.div>
    </div>
  );
}

// ─── Key Management ──────────────────────────────────────────
const SCOPES = ['read', 'write', 'admin', 'skills', 'audit'];

function KeyManagement() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', scopes: ['read', 'write'] as string[], expires_days: '' });
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied]     = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ keys: ApiKey[] }>({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch('/keys'),
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expires_days?: number }) =>
      apiFetch('/keys', 'POST', body),
    onSuccess: (newKey: any) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setShowCreate(false);
      if (newKey.key) setRevealed(r => ({ ...r, [newKey.id]: newKey.key }));
      setForm({ name: '', scopes: ['read', 'write'], expires_days: '' });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/keys/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const keys = data?.keys ?? [];
  const activeKeys  = keys.filter(k => !k.revoked);
  const revokedKeys = keys.filter(k => k.revoked);

  function copyKey(id: string, key: string) {
    navigator.clipboard.writeText(key).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  }

  function toggleScope(scope: string) {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#E8EEF6' }}>Your API Keys</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {activeKeys.length} active · prefix <code className="font-mono" style={{ color: '#00B8CC' }}>amgi_live_</code>
          </p>
        </div>
        <button className="btn-med flex items-center gap-2" onClick={() => setShowCreate(v => !v)}>
          <Plus size={14} /> New Key
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="section-heading">Create API Key</h3>
                <button onClick={() => setShowCreate(false)} className="btn-ghost-med p-1 rounded"><X size={14} /></button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Key name / description</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Production App, Research Tool"
                    className="input-med text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Expires in (days, blank = never)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.expires_days}
                    onChange={e => setForm(f => ({ ...f, expires_days: e.target.value }))}
                    placeholder="e.g. 90"
                    className="input-med text-sm w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {SCOPES.map(scope => (
                    <button
                      key={scope}
                      onClick={() => toggleScope(scope)}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: form.scopes.includes(scope) ? 'rgba(0,184,204,0.15)' : 'rgba(255,255,255,0.04)',
                        color:      form.scopes.includes(scope) ? '#00D4EB' : 'var(--text-muted)',
                        border:     `1px solid ${form.scopes.includes(scope) ? 'rgba(0,184,204,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  className="btn-med flex items-center gap-2"
                  onClick={() => create.mutate({ name: form.name, scopes: form.scopes, expires_days: form.expires_days ? Number(form.expires_days) : undefined })}
                  disabled={create.isPending || !form.name.trim()}
                >
                  {create.isPending ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Generating…</> : <><Key size={13} />Generate Key</>}
                </button>
                <button className="btn-ghost-med" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
              {create.isError && <p className="text-xs" style={{ color: '#FF1744' }}>{(create.error as Error).message}</p>}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active keys */}
      {isLoading ? (
        <div className="glass p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skel h-16 rounded-xl" />)}
        </div>
      ) : activeKeys.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <Key size={32} className="mx-auto mb-2 opacity-20" style={{ color: '#00B8CC' }} />
          <p style={{ color: 'var(--text-muted)' }}>No active API keys. Create one above.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {activeKeys.map((k, i) => (
              <motion.div
                key={k.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
              >
                <KeyCard
                  apiKey={k}
                  rawKey={revealed[k.id]}
                  copied={copied === k.id}
                  onCopy={() => copyKey(k.id, revealed[k.id] ?? k.key_prefix)}
                  onRevoke={() => { if (confirm(`Revoke key "${k.name}"? This cannot be undone.`)) revoke.mutate(k.id); }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Security notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(255,179,0,0.06)', border: '1px solid rgba(255,179,0,0.18)' }}>
        <Shield size={14} style={{ color: '#FFB300', marginTop: 1 }} />
        <p className="text-xs" style={{ color: '#C8A020' }}>
          API keys are shown once at creation. Store them in a secrets manager — AMGI never stores the plaintext key.
          Revoking is permanent and immediate.
        </p>
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs list-none flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
            {revokedKeys.length} revoked key{revokedKeys.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {revokedKeys.map(k => (
              <div key={k.id} className="glass px-4 py-3 flex items-center gap-3 text-xs">
                <Key size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="font-mono truncate flex-1" style={{ color: 'var(--text-muted)' }}>{k.name}</span>
                <span style={{ color: '#FF1744' }}>Revoked</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function KeyCard({ apiKey: k, rawKey, copied, onCopy, onRevoke }: {
  apiKey: ApiKey; rawKey?: string; copied: boolean;
  onCopy: () => void; onRevoke: () => void;
}) {
  const [showRaw, setShowRaw] = useState(!!rawKey);
  const scopes: string[] = (() => { try { return JSON.parse(k.scopes); } catch { return []; } })();

  return (
    <div className="glass p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{ border: rawKey ? '1px solid rgba(0,184,204,0.3)' : undefined }}>
      {rawKey && (
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #00B8CC, transparent)' }} />
      )}
      {rawKey && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(0,184,204,0.08)', border: '1px solid rgba(0,184,204,0.2)' }}>
          <CheckCircle size={12} style={{ color: '#00C878' }} />
          <span style={{ color: '#00C878' }}>Key generated — copy it now, it won't be shown again</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,184,204,0.1)', border: '1px solid rgba(0,184,204,0.2)' }}>
            <Key size={15} style={{ color: '#00B8CC' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: '#E8EEF6' }}>{k.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs truncate" style={{ color: '#00B8CC' }}>
                {showRaw && rawKey ? rawKey : k.key_prefix}
              </span>
              {rawKey && (
                <button onClick={() => setShowRaw(v => !v)} className="shrink-0">
                  {showRaw ? <EyeOff size={11} style={{ color: 'var(--text-muted)' }} /> : <Eye size={11} style={{ color: 'var(--text-muted)' }} />}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {rawKey && (
            <button onClick={onCopy} className="btn-ghost-med flex items-center gap-1.5 text-xs py-1 px-2 rounded-lg">
              {copied ? <><CheckCircle size={11} style={{ color: '#00C878' }} />Copied!</> : <><Copy size={11} />Copy</>}
            </button>
          )}
          <button onClick={onRevoke} className="btn-ghost-med p-1.5 rounded-lg" style={{ color: '#FF1744' }} title="Revoke">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs flex-wrap">
        <span style={{ color: 'var(--text-muted)' }}>
          Created {formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}
        </span>
        {k.last_used_at && (
          <span style={{ color: 'var(--text-muted)' }}>
            Last used {formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })}
          </span>
        )}
        {k.expires_at && (
          <span style={{ color: k.expires_at < Date.now() ? '#FF1744' : '#FFB300' }}>
            {k.expires_at < Date.now() ? 'Expired' : `Expires ${formatDistanceToNow(new Date(k.expires_at), { addSuffix: true })}`}
          </span>
        )}
        <div className="flex gap-1 flex-wrap ml-auto">
          {scopes.map(s => (
            <span key={s} className="px-1.5 py-0.5 rounded text-3xs font-mono"
              style={{ background: 'rgba(0,184,204,0.08)', color: '#00B8CC', border: '1px solid rgba(0,184,204,0.15)' }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function ApiKeys() {
  const [phase, setPhase] = useState<'demo' | 'keys'>('demo');

  return (
    <div className="space-y-6" style={{ maxWidth: phase === 'demo' ? 860 : 760, margin: '0 auto' }}>
      {/* Back to demo */}
      {phase === 'keys' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button
            onClick={() => setPhase('demo')}
            className="btn-ghost-med flex items-center gap-1.5 text-xs mb-2"
          >
            ← View Platform Demo
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {phase === 'demo' ? (
          <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
            <ProofOfValue onProceed={() => setPhase('keys')} />
          </motion.div>
        ) : (
          <motion.div key="keys" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <KeyManagement />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
