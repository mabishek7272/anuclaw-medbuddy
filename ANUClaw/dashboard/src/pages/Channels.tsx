import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, ChevronDown, Radio } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';

interface Channel {
  name: string;
  configured: boolean;
  status: 'green' | 'amber' | 'red' | 'disabled';
  msgs_24h: number;
  msgs_1h: number;
  errors_24h: number;
  last_seen: number | null;
}

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈', discord: '🎮', slack: '💬', whatsapp: '📱',
  feishu: '🪶', dingtalk: '📞', gmail: '📧', signal: '🔒',
  matrix: '🔷', imessage: '🍎', irc: '⌨', nostr: '⚡', qq: '🐧', web: '🌐',
};

const STATUS_MAP = {
  green:    { dot: 'dot-online',  label: 'Online',   color: '#00E676' },
  amber:    { dot: 'dot-warn',    label: 'Degraded', color: '#FFB300' },
  red:      { dot: 'dot-danger',  label: 'Error',    color: '#FF1744' },
  disabled: { dot: 'dot-offline', label: 'Disabled', color: '#546E7A' },
};

export default function Channels() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ channels: Channel[] }>({
    queryKey: ['channels'],
    queryFn: () => fetch('/api/channels', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const restart = useMutation({
    mutationFn: (name: string) =>
      fetch(`/api/channels/${name}/restart`, { method: 'POST', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });

  const channels = data?.channels ?? [];
  const active  = channels.filter(c => c.status === 'green').length;
  const warn    = channels.filter(c => c.status === 'amber').length;
  const errored = channels.filter(c => c.status === 'red').length;

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>Channels</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>14 messaging channels · real-time status</p>
        </div>
        <div className="flex gap-2">
          {active > 0   && <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(0,230,118,0.1)', color: '#00E676', border: '1px solid rgba(0,230,118,0.2)' }}>{active} online</span>}
          {warn > 0     && <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(255,179,0,0.1)', color: '#FFB300', border: '1px solid rgba(255,179,0,0.2)' }}>{warn} degraded</span>}
          {errored > 0  && <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(255,23,68,0.1)', color: '#FF1744', border: '1px solid rgba(255,23,68,0.2)' }}>{errored} error</span>}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel h-36 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {channels.map((ch, i) => {
            const sm = STATUS_MAP[ch.status] ?? STATUS_MAP.disabled;
            const isExp = expanded === ch.name;
            return (
              <motion.div
                key={ch.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              >
                <div
                  className="glass glass-hover flex flex-col gap-4 p-5 relative overflow-hidden"
                  style={{ border: isExp ? `1px solid ${sm.color}30` : undefined }}
                >
                  {/* Status accent */}
                  <div className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${sm.color}, transparent)`, opacity: ch.status === 'disabled' ? 0.2 : 0.7 }} />

                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{CHANNEL_ICONS[ch.name] ?? '📡'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm capitalize" style={{ color: '#E8EEF6' }}>{ch.name}</p>
                        <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
                        {!ch.configured && (
                          <span className="px-1.5 py-0.5 rounded text-3xs"
                            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            Not configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: sm.color }}>{sm.label}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <dl className="grid grid-cols-2 gap-y-1 text-xs">
                    <dt style={{ color: 'var(--text-muted)' }}>24h msgs</dt>
                    <dd className="font-mono text-right" style={{ color: '#E8EEF6' }}>{ch.msgs_24h}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>1h msgs</dt>
                    <dd className="font-mono text-right" style={{ color: '#E8EEF6' }}>{ch.msgs_1h}</dd>
                    {ch.errors_24h > 0 && (
                      <>
                        <dt style={{ color: '#FF1744' }}>Errors (24h)</dt>
                        <dd className="font-mono text-right" style={{ color: '#FF1744' }}>{ch.errors_24h}</dd>
                      </>
                    )}
                    <dt style={{ color: 'var(--text-muted)' }}>Last seen</dt>
                    <dd className="text-right" style={{ color: '#E8EEF6' }}>
                      {ch.last_seen ? formatDistanceToNow(new Date(ch.last_seen), { addSuffix: true }) : '—'}
                    </dd>
                  </dl>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    {ch.configured && (
                      <button
                        onClick={() => restart.mutate(ch.name)}
                        disabled={restart.isPending && restart.variables === ch.name}
                        className="btn-ghost-med flex items-center gap-1.5 text-xs py-1 px-2.5"
                        aria-label={`Restart ${ch.name}`}
                      >
                        <RefreshCw size={11} className={restart.isPending && restart.variables === ch.name ? 'animate-spin' : ''} />
                        Restart
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isExp ? null : ch.name)}
                      className="btn-ghost-med flex items-center gap-1 text-xs py-1 px-2 ml-auto"
                      aria-expanded={isExp}
                    >
                      <ChevronDown size={11} style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      {isExp ? 'Less' : 'Details'}
                    </button>
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExp && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                          {ch.name === 'whatsapp' && <WhatsAppQR />}
                          <ChannelTimeline channelName={ch.name} barColor={sm.color} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WhatsAppQR() {
  const { data } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: () => fetch('/api/channels/whatsapp/qr', { credentials: 'include' }).then(r => r.json()),
    retry: false,
    staleTime: 30_000,
  });

  if (!data?.qr) return (
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No QR code — WhatsApp may already be paired.</p>
  );

  return (
    <pre className="font-mono text-xs p-3 rounded-xl overflow-x-auto"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#E8EEF6' }}>
      {data.qr}
    </pre>
  );
}

function ChannelTimeline({ channelName, barColor }: { channelName: string; barColor: string }) {
  const { data } = useQuery({
    queryKey: ['channel-timeline', channelName],
    queryFn: () => fetch(`/api/channels/${channelName}/timeline`, { credentials: 'include' }).then(r => r.json()),
    staleTime: 60_000,
  });

  const timeline = data?.timeline ?? [];
  if (timeline.length === 0) return null;

  const max = Math.max(...timeline.map((t: any) => t.count), 1);

  return (
    <div>
      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Hourly activity (24h)</p>
      <div className="flex items-end gap-0.5 h-10">
        {timeline.slice(-24).map((t: any, i: number) => {
          const h = Math.round((t.count / max) * 36) + 2;
          return (
            <motion.div
              key={i}
              initial={{ height: 2, opacity: 0 }}
              animate={{ height: h, opacity: 0.7 }}
              transition={{ delay: i * 0.02, duration: 0.4 }}
              className="flex-1 rounded-t"
              title={`${t.hour}: ${t.count} msgs`}
              style={{ background: t.errors > 0 ? '#FF1744' : barColor }}
            />
          );
        })}
      </div>
    </div>
  );
}
