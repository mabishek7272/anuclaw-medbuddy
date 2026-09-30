import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  MessageSquare, Cpu, Users, Activity, Radio, Clock,
  AlertTriangle, Zap,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { GlassCard } from '../components/GlassCard';
import { LiveStream } from '../components/LiveStream';
import { ECGLine } from '../components/ECGLine';

interface HomeData {
  kpis: {
    messagesToday: number;
    activeChannels: number;
    activeUsers: number;
    skillsInvoked: number;
    avgResponseMs: number;
    blockedByHooks: number;
  };
  kpiHistory: {
    messages: number[];
    skills: number[];
    users: number[];
  };
  systemHealth: {
    runtime: string;
    memMb: number;
    uptimeSec: number;
    nodeVersion: string;
    dbSizeKb: number;
    cpuPct: number;
    connectedClients: number;
  };
  topSkills: Array<{ skill: string; count: number; domain: string }>;
  channelBoard: Array<{ channel: string; status: string; msgCount: number }>;
  deltas: Record<string, number>;
}

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈', discord: '🎮', slack: '💬', whatsapp: '📱',
  gmail: '📧', signal: '🔒', matrix: '🔷', web: '🌐', sms: '📟',
};

const DOMAIN_COLORS: Record<string, string> = {
  medical: '#00C878', legal: '#00B8CC', finance: '#FFB300',
  admin: '#9C27B0', general: '#546E7A',
};

function SkeletonKpi() {
  return (
    <div className="glass p-5 flex flex-col gap-3 overflow-hidden">
      <div className="skel h-3 w-24 rounded" />
      <div className="skel h-8 w-16 rounded" />
      <div className="skel h-2 w-32 rounded" />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'online' ? 'dot-online' : status === 'degraded' ? 'dot-warn' : 'dot-offline';
  return <span className={`w-2 h-2 rounded-full ${cls}`} />;
}

function HealthBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs font-mono" style={{ color }}>{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.23, 1, 0.32, 1], delay: 0.3 }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})` }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const { data, isLoading } = useQuery<HomeData>({
    queryKey: ['home'],
    queryFn: () => fetch('/api/home', { credentials: 'include' }).then(r => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    }),
    refetchInterval: 15_000,
  });

  const kpiDefs = [
    { key: 'messagesToday', title: 'Messages Today',  icon: <MessageSquare size={15} />, color: '#00B8CC' },
    { key: 'skillsInvoked', title: 'Skills Invoked',  icon: <Cpu size={15} />,          color: '#00C878' },
    { key: 'activeUsers',   title: 'Active Users',    icon: <Users size={15} />,         color: '#9C27B0' },
    { key: 'activeChannels',title: 'Active Channels', icon: <Radio size={15} />,         color: '#26C6DA' },
    { key: 'avgResponseMs', title: 'Avg Response',    icon: <Clock size={15} />,         color: '#FFB300', unit: 'ms' },
    { key: 'blockedByHooks',title: 'Hooks Blocked',   icon: <AlertTriangle size={15} />, color: '#FF6D00' },
  ];

  const sparkMap: Record<string, number[]> = {
    messagesToday: data?.kpiHistory.messages ?? [],
    skillsInvoked: data?.kpiHistory.skills ?? [],
    activeUsers:   data?.kpiHistory.users ?? [],
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#E8EEF6', letterSpacing: '-0.01em' }}>
            Operations Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            AMGI Research Initiative · Real-time system overview
          </p>
        </div>
        <div className="hidden xl:flex items-center gap-3">
          <ECGLine width={100} height={40} color="#00D4EB" />
        </div>
      </motion.div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)
          : kpiDefs.map(({ key, title, icon, color, unit }, i) => (
            <KpiCard
              key={key}
              title={title}
              value={(data?.kpis as Record<string, number>)[key] ?? 0}
              delta={(data?.deltas as Record<string, number>)?.[key]}
              sparkData={sparkMap[key]}
              icon={icon}
              color={color}
              unit={unit}
              delay={i * 0.07}
            />
          ))
        }
      </div>

      {/* Live stream + System health */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <LiveStream maxEvents={50} />
        </div>
        <GlassCard delay={0.2} className="flex flex-col gap-5">
          <h2 className="section-heading flex items-center gap-2">
            <Activity size={14} />
            System Health
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel h-5 rounded" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <HealthBar label="Memory (MB)" value={data?.systemHealth.memMb ?? 0}    max={2048} color="#00B8CC" />
              <HealthBar label="CPU %"        value={data?.systemHealth.cpuPct ?? 0}   max={100}  color="#00C878" />
              <HealthBar label="DB (KB)"      value={data?.systemHealth.dbSizeKb ?? 0} max={102400} color="#FFB300" />

              <div className="pt-2 space-y-2">
                {[
                  { label: 'Node',     val: data?.systemHealth.nodeVersion ?? '—' },
                  { label: 'Runtime',  val: data?.systemHealth.runtime ?? '—' },
                  { label: 'Clients',  val: String(data?.systemHealth.connectedClients ?? 0) },
                  { label: 'Uptime',   val: formatUptime(data?.systemHealth.uptimeSec ?? 0) },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="font-mono" style={{ color: '#E8EEF6' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Top skills + Channel board */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GlassCard delay={0.3} className="flex flex-col gap-4">
          <h2 className="section-heading flex items-center gap-2">
            <Zap size={14} />
            Top Skills
          </h2>
          {isLoading ? (
            <div className="skel h-40 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data?.topSkills ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="skill" width={120}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  axisLine={false} tickLine={false}
                />
                <RTooltip
                  cursor={{ fill: 'rgba(0,184,204,0.05)' }}
                  contentStyle={{ background: 'rgba(6,13,26,0.95)', border: '1px solid rgba(0,184,204,0.2)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#E8EEF6' }}
                  itemStyle={{ color: '#00D4EB' }}
                />
                <Bar dataKey="count" radius={3}>
                  {(data?.topSkills ?? []).map((entry, i) => (
                    <Cell key={i} fill={DOMAIN_COLORS[entry.domain] ?? '#00B8CC'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <GlassCard delay={0.35} className="flex flex-col gap-4">
          <h2 className="section-heading flex items-center gap-2">
            <Radio size={14} />
            Channels
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel h-9 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data?.channelBoard ?? []).map((ch, i) => (
                <motion.div
                  key={ch.channel}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 + 0.4 }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.025)' }}
                >
                  <span className="text-base" aria-hidden>{CHANNEL_ICONS[ch.channel] ?? '📡'}</span>
                  <span className="flex-1 text-sm capitalize" style={{ color: '#E8EEF6' }}>{ch.channel}</span>
                  <StatusDot status={ch.status} />
                  <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{ch.msgCount}</span>
                </motion.div>
              ))}
              {(!data?.channelBoard || data.channelBoard.length === 0) && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No channel data</p>
              )}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
