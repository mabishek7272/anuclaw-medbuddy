import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch, Play, Plus, Trash2, ChevronRight, CheckCircle,
  Clock, AlertTriangle, Zap, FlaskConical, Dna, Pill, ShieldCheck,
  Activity, RotateCcw, Copy, Download, X, Save, ChevronDown,
  Cpu, FileText, Brain, ArrowRight, Layers,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PipelineNode {
  id: string;
  skill: string;
  label: string;
  prompt_template: string;
  position?: { x: number; y: number };
}
interface Pipeline {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: PipelineNode[];
  connections: Array<{ from: string; to: string }>;
  trigger_type: string;
  run_count: number;
  last_run_at: number | null;
  created_at: number;
}
interface Template {
  name: string;
  description: string;
  category: string;
  nodes: PipelineNode[];
}
interface RunEvent {
  type: string;
  nodeId?: string; nodeLabel?: string; skill?: string; output?: string;
  latencyMs?: number; nodeIndex?: number; total?: number;
  success?: boolean; finalOutput?: string; nodeResults?: Record<string, string>;
  message?: string; error?: string; runId?: string;
}

function apiFetch(path: string, method = 'GET', body?: object) {
  return fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

// ─── Category config ──────────────────────────────────────────────────────────
const CAT_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  genomics:       { color: '#9C27B0', icon: <Dna size={14} />,        label: 'Genomics' },
  clinical:       { color: '#00B8CC', icon: <Activity size={14} />,   label: 'Clinical' },
  drug_discovery: { color: '#FF6D00', icon: <Pill size={14} />,       label: 'Drug Discovery' },
  compliance:     { color: '#FFB300', icon: <ShieldCheck size={14} />, label: 'Compliance' },
  research:       { color: '#26C6DA', icon: <Brain size={14} />,      label: 'Research' },
  custom:         { color: '#546E7A', icon: <Layers size={14} />,     label: 'Custom' },
};

// ─── Skill icon map ───────────────────────────────────────────────────────────
function skillColor(skill: string): string {
  if (skill.includes('genomics') || skill.includes('protein')) return '#9C27B0';
  if (skill.includes('clinical')) return '#00B8CC';
  if (skill.includes('drug')) return '#FF6D00';
  if (skill.includes('ehr') || skill.includes('patient')) return '#00C878';
  if (skill.includes('regulatory') || skill.includes('security')) return '#FFB300';
  if (skill.includes('nlp') || skill.includes('document')) return '#26C6DA';
  if (skill.includes('lab')) return '#CE93D8';
  return '#546E7A';
}

// ─── Pipeline node visual ─────────────────────────────────────────────────────
function NodeChip({ node, index, total, result, status }: {
  node: PipelineNode; index: number; total: number;
  result?: string; status?: 'pending' | 'running' | 'done' | 'error';
}) {
  const color = skillColor(node.skill);
  const isLast = index === total - 1;
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        className="flex flex-col items-center gap-1"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center relative"
          style={{
            background: `${color}15`,
            border: `1.5px solid ${status === 'running' ? color : status === 'done' ? '#00C878' : status === 'error' ? '#FF1744' : color + '30'}`,
            boxShadow: status === 'running' ? `0 0 12px ${color}40` : undefined,
          }}
        >
          <Cpu size={14} style={{ color }} />
          {status === 'running' && <span className="absolute inset-0 rounded-xl border-2 animate-ping opacity-30" style={{ borderColor: color }} />}
          {status === 'done' && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#00C878] flex items-center justify-center"><CheckCircle size={9} style={{ color: '#fff' }} /></span>}
          {status === 'error' && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#FF1744] flex items-center justify-center"><AlertTriangle size={8} style={{ color: '#fff' }} /></span>}
        </div>
        <span className="text-3xs text-center max-w-[48px] truncate" style={{ color, fontSize: 9 }}>{node.label}</span>
      </motion.div>
      {!isLast && <ArrowRight size={12} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 14 }} />}
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ template, index, onRun }: { template: Template; index: number; onRun: () => void }) {
  const cfg = CAT_CONFIG[template.category] ?? CAT_CONFIG.custom;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="glass p-4 flex flex-col gap-3 relative overflow-hidden cursor-pointer group"
      style={{ border: '1px solid var(--border)' }}
      onClick={onRun}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-xs font-semibold" style={{ color: '#E8EEF6' }}>{template.name}</span>
        </div>
        <span className="text-3xs px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: `${cfg.color}15`, color: cfg.color, fontSize: 9, border: `1px solid ${cfg.color}25` }}>
          {cfg.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{template.description}</p>

      {/* Node flow preview */}
      <div className="flex items-center gap-1 flex-wrap">
        {template.nodes.map((n, i) => {
          const color = skillColor(n.skill);
          return (
            <React.Fragment key={n.id}>
              <span className="text-3xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: `${color}12`, color, border: `1px solid ${color}20`, fontSize: 9 }}>
                {n.label}
              </span>
              {i < template.nodes.length - 1 && <ArrowRight size={8} style={{ color: 'rgba(255,255,255,0.2)' }} />}
            </React.Fragment>
          );
        })}
      </div>

      <button
        className="btn-med text-xs py-1.5 flex items-center gap-1.5 justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => { e.stopPropagation(); onRun(); }}
      >
        <Play size={11} /> Run Template
      </button>
    </motion.div>
  );
}

// ─── Pipeline runner panel ────────────────────────────────────────────────────
function RunnerPanel({ pipeline, templateIndex, onClose }: {
  pipeline?: Pipeline;
  templateIndex?: number;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [nodeStatus, setNodeStatus] = useState<Record<string, 'pending' | 'running' | 'done' | 'error'>>({});
  const abortRef = useRef<(() => void) | null>(null);

  const nodes = pipeline?.nodes ?? [];

  async function run() {
    if (!input.trim() || running) return;
    setRunning(true);
    setEvents([]);
    setNodeStatus({});

    const url = pipeline ? `/api/pipelines/${pipeline.id}/run` : `/api/pipelines/template/run`;
    const body = pipeline ? { input } : { templateIndex, input };

    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = () => { cancelled = true; controller.abort(); };

    try {
      const resp = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const part of parts) {
          const evLine = part.split('\n').find(l => l.startsWith('event: '));
          const dtLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!evLine || !dtLine) continue;
          const evType = evLine.slice(7).trim();
          try {
            const payload = JSON.parse(dtLine.slice(6));
            setEvents(prev => [...prev, { type: evType, ...payload }]);
            if (evType === 'node_start')  setNodeStatus(s => ({ ...s, [payload.nodeId]: 'running' }));
            if (evType === 'node_done')   setNodeStatus(s => ({ ...s, [payload.nodeId]: 'done' }));
            if (evType === 'node_error')  setNodeStatus(s => ({ ...s, [payload.nodeId]: 'error' }));
          } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
    finally { setRunning(false); abortRef.current = null; }
  }

  const doneEvent = events.find(e => e.type === 'done');
  const nodeEvents = events.filter(e => e.type === 'node_done');

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="font-bold text-base" style={{ color: '#E8EEF6' }}>
            {pipeline?.name ?? 'Template Run'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {nodes.length} steps · autonomous execution
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost-med p-1.5 rounded-lg"><X size={14} /></button>
      </div>

      {/* Node flow */}
      <div className="glass p-4 flex items-center gap-1 flex-wrap">
        {nodes.map((n, i) => (
          <NodeChip key={n.id} node={n} index={i} total={nodes.length}
            result={events.find(e => e.nodeId === n.id && e.type === 'node_done')?.output}
            status={nodeStatus[n.id] ?? (running && !nodeStatus[n.id] ? undefined : undefined)} />
        ))}
        {nodes.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No nodes defined</span>}
      </div>

      {/* Input */}
      <GlassCard className="space-y-2">
        <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          PIPELINE INPUT
        </label>
        <textarea
          value={input} onChange={e => setInput(e.target.value)}
          rows={4} placeholder="Enter the initial data or question to feed into this pipeline…&#10;e.g. Patient: John Smith, 58M. VCF file: BRCA1 c.5266dupC"
          className="input-med w-full text-xs resize-none"
          style={{ fontSize: 12 }}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); }}
        />
        <div className="flex gap-2">
          {running ? (
            <button onClick={() => abortRef.current?.()}
              className="btn-ghost-med flex items-center gap-1.5 text-xs py-1.5"
              style={{ color: '#FF1744', borderColor: 'rgba(255,23,68,0.2)' }}>
              <X size={12} /> Stop
            </button>
          ) : (
            <button onClick={run} disabled={!input.trim()}
              className="btn-med flex items-center gap-2 text-sm px-5 py-2"
              style={{ opacity: input.trim() ? 1 : 0.4 }}>
              <Play size={13} /> Run Pipeline
            </button>
          )}
          <span className="text-3xs self-center" style={{ color: 'var(--text-muted)', fontSize: 10 }}>⌘↵ to run</span>
        </div>
      </GlassCard>

      {/* Live step results */}
      <div className="flex-1 overflow-y-auto space-y-3">
        <AnimatePresence>
          {nodeEvents.map((ev, i) => (
            <motion.div key={ev.nodeId ?? i}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="glass p-4 space-y-2"
              style={{ border: '1px solid rgba(0,200,120,0.15)' }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle size={12} style={{ color: '#00C878' }} />
                <span className="font-semibold text-xs" style={{ color: '#00C878' }}>
                  Step {(ev.nodeIndex ?? 0) + 1}: {ev.nodeLabel}
                </span>
                <span className="font-mono text-3xs ml-auto" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  {ev.skill} · {((ev.latencyMs ?? 0) / 1000).toFixed(1)}s
                </span>
              </div>
              {ev.output && (
                <p className="text-xs leading-relaxed font-mono whitespace-pre-wrap"
                  style={{ color: '#C8D8E8', fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                  {ev.output.slice(0, 600)}{ev.output.length > 600 ? '\n…' : ''}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Final result */}
        {doneEvent && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="glass p-4 space-y-3"
            style={{ border: `1px solid ${doneEvent.success ? 'rgba(0,184,204,0.25)' : 'rgba(255,23,68,0.2)'}` }}
          >
            <div className="flex items-center gap-2">
              {doneEvent.success
                ? <><CheckCircle size={13} style={{ color: '#00B8CC' }} /><span className="font-semibold text-sm" style={{ color: '#00B8CC' }}>Pipeline Complete</span></>
                : <><AlertTriangle size={13} style={{ color: '#FF1744' }} /><span className="font-semibold text-sm" style={{ color: '#FF1744' }}>Pipeline Failed</span></>
              }
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                <Clock size={10} className="inline mr-1" />{((doneEvent.latencyMs ?? 0) / 1000).toFixed(1)}s total
              </span>
            </div>
            {doneEvent.finalOutput && (
              <div className="space-y-1.5">
                <p className="text-3xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>FINAL OUTPUT</p>
                <div className="rounded-xl p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto"
                  style={{ background: 'rgba(0,0,0,0.3)', color: '#C8D8E8', fontSize: 11 }}>
                  {doneEvent.finalOutput}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {running && events.some(e => e.type === 'node_start') && !events.find(e => e.type === 'done') && (
          <div className="flex items-center gap-2 px-4" style={{ color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full dot-online animate-pulse" />
            <span className="text-xs">
              Running step {(events.filter(e => e.type === 'node_start').length)} of {nodes.length}…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Pipelines() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'templates' | 'mine'>('templates');
  const [running, setRunning] = useState<{ pipeline?: Pipeline; templateIndex?: number } | null>(null);
  const [catFilter, setCatFilter] = useState('all');

  const { data, isLoading } = useQuery<{ pipelines: Pipeline[]; templates: Template[] }>({
    queryKey: ['pipelines'],
    queryFn: () => apiFetch('/pipelines'),
    refetchInterval: 30_000,
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/pipelines/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  const templates = data?.templates ?? [];
  const pipelines = data?.pipelines ?? [];
  const cats = ['all', ...Array.from(new Set(templates.map(t => t.category)))];

  const filteredTemplates = catFilter === 'all' ? templates : templates.filter(t => t.category === catFilter);

  return (
    <div className="flex gap-0 h-full" style={{ height: 'calc(100vh - 112px)' }}>

      {/* Left: catalog + saved */}
      <div className={`flex flex-col gap-4 overflow-hidden transition-all duration-300 ${running ? 'w-[440px] pr-5' : 'flex-1'}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <GitBranch size={15} style={{ color: '#00B8CC' }} />
              <h1 className="font-bold text-lg" style={{ color: '#E8EEF6' }}>Autonomous Pipelines</h1>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Chain 1,100+ specialist skills into automated medical workflows
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs px-2.5 py-1 rounded-lg font-mono"
              style={{ background: 'rgba(0,184,204,0.1)', color: '#00B8CC', border: '1px solid rgba(0,184,204,0.2)' }}>
              {templates.length} templates
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
          {(['templates', 'mine'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize"
              style={{
                background: tab === t ? 'rgba(0,184,204,0.12)' : 'transparent',
                color: tab === t ? '#00B8CC' : 'var(--text-muted)',
                border: tab === t ? '1px solid rgba(0,184,204,0.25)' : '1px solid transparent',
              }}>
              {t === 'mine' ? `My Pipelines (${pipelines.length})` : `Templates (${templates.length})`}
            </button>
          ))}
        </div>

        {tab === 'templates' && (
          <>
            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5">
              {cats.map(c => {
                const cfg = CAT_CONFIG[c];
                return (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all capitalize"
                    style={{
                      background: catFilter === c ? `${cfg?.color ?? '#00B8CC'}15` : 'rgba(255,255,255,0.04)',
                      color: catFilter === c ? (cfg?.color ?? '#00B8CC') : 'var(--text-muted)',
                      border: `1px solid ${catFilter === c ? (cfg?.color ?? '#00B8CC') + '30' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    {c === 'all' ? 'All' : (cfg?.label ?? c)}
                  </button>
                );
              })}
            </div>

            {/* Template grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {filteredTemplates.map((t, i) => (
                  <TemplateCard key={t.name} template={t as any} index={i}
                    onRun={() => setRunning({ templateIndex: templates.indexOf(t) })} />
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'mine' && (
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel h-24 rounded-xl" />)}
              </div>
            ) : pipelines.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color: 'var(--text-muted)' }}>
                <GitBranch size={40} className="opacity-10" />
                <p className="text-sm">No saved pipelines yet</p>
                <p className="text-xs">Run a template to get started, or create a custom pipeline</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pipelines.map((p, i) => {
                  const cfg = CAT_CONFIG[p.category] ?? CAT_CONFIG.custom;
                  return (
                    <motion.div key={p.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: cfg.color }}>{cfg.icon}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate" style={{ color: '#E8EEF6' }}>{p.name}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{p.description}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setRunning({ pipeline: p })}
                            className="btn-med flex items-center gap-1 text-xs py-1 px-2">
                            <Play size={11} /> Run
                          </button>
                          <button onClick={() => del.mutate(p.id)}
                            className="btn-ghost-med p-1.5 rounded-lg" style={{ color: '#FF1744' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-3xs" style={{ fontSize: 10 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{p.nodes.length} steps</span>
                        <span style={{ color: 'var(--text-muted)' }}>{p.run_count} runs</span>
                        {p.last_run_at && <span style={{ color: 'var(--text-muted)' }}>Last: {formatDistanceToNow(new Date(p.last_run_at), { addSuffix: true })}</span>}
                        <span className="ml-auto px-1.5 py-0.5 rounded" style={{ background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}20` }}>{cfg.label}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Runner panel */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20 }}
          >
            <RunnerPanel
              pipeline={running.pipeline}
              templateIndex={running.templateIndex}
              onClose={() => setRunning(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!running && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="hidden xl:flex items-center justify-center w-80 shrink-0"
          style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}
        >
          <div className="text-center space-y-3" style={{ color: 'var(--text-muted)' }}>
            <GitBranch size={44} className="mx-auto opacity-10" />
            <p className="text-sm font-semibold" style={{ color: '#E8EEF6' }}>Select a template to run</p>
            <p className="text-xs max-w-[200px]">Each pipeline chains multiple specialist skills, passing outputs automatically between steps.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
