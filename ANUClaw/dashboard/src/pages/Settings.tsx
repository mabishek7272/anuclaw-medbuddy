import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTheme } from '../lib/theme';
import { Save, Sun, Moon, Server, Brain, Shield, Sliders, Radio } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';

const TABS = [
  { id: 'general',  label: 'General',  Icon: Sliders },
  { id: 'models',   label: 'Models',   Icon: Server },
  { id: 'memory',   label: 'Memory',   Icon: Brain },
  { id: 'security', label: 'Security', Icon: Shield },
  { id: 'soul',     label: 'SOUL',     Icon: Brain },
  { id: 'channels', label: 'Channels', Icon: Radio },
  { id: 'system',   label: 'System',   Icon: Server },
] as const;

type TabId = typeof TABS[number]['id'];

function apiFetch(path: string, method = 'GET', body?: object) {
  return fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: '#E8EEF6' }}>{label}</p>
        {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function RadioOption({ active, label, description }: { active: boolean; label: string; description?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
      style={{ border: `1px solid ${active ? 'rgba(0,184,204,0.4)' : 'var(--border)'}`, background: active ? 'rgba(0,184,204,0.06)' : 'transparent' }}>
      <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
        style={{ borderColor: '#00B8CC', background: active ? '#00B8CC' : 'transparent' }} />
      <div>
        <p className="text-sm font-medium" style={{ color: '#E8EEF6' }}>{label}</p>
        {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<TabId>('general');
  const { theme, toggle } = useTheme();

  return (
    <div className="space-y-5" style={{ maxWidth: 860 }}>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure runtime, models, memory and personality</p>
      </motion.div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all"
            style={{
              borderBottom: tab === id ? '2px solid #00B8CC' : '2px solid transparent',
              color: tab === id ? '#00B8CC' : 'var(--text-muted)',
              fontWeight: tab === id ? 500 : 400,
              marginBottom: -1,
            }}
          >
            <Icon size={13} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general'  && <GeneralTab theme={theme} toggleTheme={toggle} />}
      {tab === 'models'   && <ModelsTab />}
      {tab === 'memory'   && <MemoryTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'soul'     && <SoulTab />}
      {tab === 'channels' && <ChannelsTab />}
      {tab === 'system'   && <SystemTab />}
    </div>
  );
}

function GeneralTab({ theme, toggleTheme }: { theme: string; toggleTheme: () => void }) {
  const { data } = useQuery<any>({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const s = data?.settings ?? {};
  return (
    <GlassCard className="p-0 divide-y divide-white/5">
      <div className="p-5 pb-3">
        <p className="section-heading">General</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Runtime behaviour and appearance</p>
      </div>
      <div className="px-5">
        <SettingRow label="Theme" description="Switch between dark and light mode">
          <button onClick={toggleTheme} className="btn-ghost-med flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm">
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </SettingRow>
        <SettingRow label="Trigger Pattern" description="How users invoke the assistant in channels">
          <span className="font-mono text-sm px-2 py-1 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#00B8CC' }}>
            {s.TRIGGER_PATTERN ?? '@ANUClaw'}
          </span>
        </SettingRow>
        <SettingRow label="Max Session Messages" description="Context window before compaction">
          <span className="font-mono text-sm" style={{ color: '#E8EEF6' }}>{s.MAX_SESSION_MESSAGES ?? '80'}</span>
        </SettingRow>
        <SettingRow label="Container Timeout" description="Max execution time per agent">
          <span className="font-mono text-sm" style={{ color: '#E8EEF6' }}>
            {s.CONTAINER_TIMEOUT_MS ? `${Number(s.CONTAINER_TIMEOUT_MS)/1000}s` : '300s'}
          </span>
        </SettingRow>
      </div>
      <div className="px-5 py-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Edit runtime values in your <code className="font-mono">.env</code> file and restart ANUClaw to apply.
        </p>
      </div>
    </GlassCard>
  );
}

function ModelsTab() {
  const { data } = useQuery<any>({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const provider = data?.settings?.MODEL_PROVIDER ?? 'anthropic';

  const PROVIDERS = [
    { id: 'anthropic',        label: 'Anthropic (Claude)',          keyVar: 'ANTHROPIC_API_KEY' },
    { id: 'openrouter',       label: 'OpenRouter (200+ models)',    keyVar: 'OPENROUTER_API_KEY' },
    { id: 'openai-compatible',label: 'OpenAI-compatible endpoint',  keyVar: 'OPENAI_COMPATIBLE_API_KEY' },
    { id: 'ollama',           label: 'Ollama (local, no key)',      keyVar: null },
  ];

  return (
    <GlassCard className="space-y-4">
      <div>
        <p className="section-heading">LLM Provider</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Current AI model configuration (edit .env to change)</p>
      </div>
      <div className="space-y-2">
        {PROVIDERS.map(p => (
          <div key={p.id}>
            <RadioOption active={p.id === provider} label={p.label}
              description={p.id === provider && p.keyVar ? `${p.keyVar} = ***configured***` : undefined} />
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Change <code className="font-mono">MODEL_PROVIDER</code> in .env and restart.
      </p>
    </GlassCard>
  );
}

function MemoryTab() {
  const { data } = useQuery<any>({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const mode      = data?.settings?.MEMORY_MODE ?? 'dual';
  const threshold = data?.settings?.MEMORY_COMPACTION_THRESHOLD ?? '80';

  const MODES = [
    { id: 'dual',        label: 'Dual (recommended)', description: 'AGENTS.md file + SQLite structured facts' },
    { id: 'file-only',   label: 'File only',          description: 'AGENTS.md file memory only' },
    { id: 'sqlite-only', label: 'SQLite only',         description: 'Structured facts only, no file memory' },
  ];

  return (
    <GlassCard className="space-y-4">
      <div>
        <p className="section-heading">Memory</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>How the agent retains context across sessions</p>
      </div>
      <div className="space-y-2">
        {MODES.map(m => <RadioOption key={m.id} active={m.id === mode} label={m.label} description={m.description} />)}
      </div>
      <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Compaction threshold</p>
        <span className="font-mono text-sm ml-auto" style={{ color: '#E8EEF6' }}>{threshold} messages</span>
      </div>
    </GlassCard>
  );
}

function SecurityTab() {
  const items = [
    ['Dashboard JWT',    'Configured', '#00C878'],
    ['Session timeout',  '15 min access / 7 day refresh', '#E8EEF6'],
    ['HTTP-only cookies','Enabled', '#00C878'],
    ['RBAC',             '5 roles enforced', '#00C878'],
    ['Audit HMAC',       'HMAC-SHA256 per-row signing', '#00C878'],
  ];

  return (
    <GlassCard className="space-y-4">
      <div>
        <p className="section-heading">Security</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Authentication and access control</p>
      </div>
      <div className="space-y-3">
        {items.map(([label, value, color]) => (
          <div key={label as string} className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${color}15`, color: color as string, border: `1px solid ${color}30` }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function SoulTab() {
  const { data } = useQuery<any>({ queryKey: ['soul'], queryFn: () => apiFetch('/settings/soul') });
  const [content, setContent] = useState('');
  useEffect(() => { if (data?.content) setContent(data.content); }, [data]);

  const save = useMutation({ mutationFn: () => apiFetch('/settings/soul', 'PUT', { content }) });

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-heading">SOUL.md — Personality</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>System prompt defining ANUClaw's personality and behaviour</p>
        </div>
        <button className="btn-med flex items-center gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={13} />
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {save.isSuccess && <p className="text-xs" style={{ color: '#00C878' }}>Saved successfully.</p>}
      <textarea
        rows={22}
        value={content}
        onChange={e => setContent(e.target.value)}
        className="input-med font-mono text-xs w-full resize-y"
        aria-label="SOUL.md content editor"
      />
    </GlassCard>
  );
}

function ChannelsTab() {
  const { data } = useQuery<any>({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const status = data?.channelStatus ?? {};

  return (
    <GlassCard className="space-y-4">
      <div>
        <p className="section-heading">Channel Tokens</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure channel credentials in .env</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(status).map(([key, set]) => {
          const channelName = key.replace(/_BOT_TOKEN|_ACCESS_TOKEN|_APP_TOKEN|_SIGNING_SECRET|_CLIENT_ID|_CLIENT_SECRET|_PHONE_NUMBER|_PRIVATE_KEY|_WEBSOCKET_URL/g, '').toLowerCase();
          const color = set ? '#00C878' : '#546E7A';
          return (
            <div key={key} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
              <span className={`w-2 h-2 rounded-full ${set ? 'dot-online' : 'dot-offline'}`} />
              <span className="text-xs capitalize flex-1" style={{ color: '#E8EEF6' }}>{channelName}</span>
              <span className="font-mono text-3xs" style={{ color: 'var(--text-muted)' }}>
                {String(set) === 'true' ? 'set' : 'missing'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Green = token configured. Edit .env and restart to add channels.
      </p>
    </GlassCard>
  );
}

function SystemTab() {
  const { data } = useQuery<any>({
    queryKey: ['sysinfo'],
    queryFn: () => apiFetch('/settings/system'),
    refetchInterval: 30_000,
  });

  if (!data) return <GlassCard><p style={{ color: 'var(--text-muted)' }}>Loading…</p></GlassCard>;

  const rows = [
    ['Node version',       data.nodeVersion],
    ['Platform',           data.platform],
    ['PID',                String(data.pid)],
    ['Environment',        data.env],
    ['Uptime',             `${Math.floor(data.uptimeSeconds / 60)} min ${data.uptimeSeconds % 60}s`],
    ['RSS memory',         `${data.memoryMb?.rss} MB`],
    ['Heap used / total',  `${data.memoryMb?.heapUsed} / ${data.memoryMb?.heapTotal} MB`],
  ];

  return (
    <GlassCard className="space-y-4">
      <p className="section-heading">Runtime System Info</p>
      <dl className="space-y-0">
        {rows.map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between py-2.5"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <dt className="text-sm" style={{ color: 'var(--text-muted)' }}>{k}</dt>
            <dd className="font-mono text-sm" style={{ color: '#E8EEF6' }}>{v}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}
