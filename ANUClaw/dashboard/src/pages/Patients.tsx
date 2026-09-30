import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Search, X, AlertTriangle, CheckCircle, Activity,
  Brain, FlaskConical, ClipboardList, Shield, ChevronRight,
  Dna, Pill, Clock, FileText, Zap, RotateCcw, User, Calendar,
  TrendingUp, TrendingDown, Minus, Play,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Patient {
  id: string; uid: string; name: string; dob: string | null; sex: string | null;
  conditions: string[]; medications: string[]; genomic_profile: Record<string, any>;
  risk_score: number; risk_level: string; risk_factors: string[];
  ai_summary: string | null; trial_matches: any[];
  created_at: number; updated_at: number; summary_updated_at: number | null;
}

interface Analysis {
  id: string; skill: string; prompt: string; result: string; ts: number;
}

function apiFetch(path: string, method = 'GET', body?: object) {
  return fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

// ─── Risk config ──────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  critical: { color: '#FF1744', bg: 'rgba(255,23,68,0.1)',  label: 'CRITICAL', icon: <AlertTriangle size={11} /> },
  high:     { color: '#FF6D00', bg: 'rgba(255,109,0,0.1)',  label: 'HIGH',     icon: <TrendingUp size={11} /> },
  medium:   { color: '#FFB300', bg: 'rgba(255,179,0,0.1)',  label: 'MEDIUM',   icon: <Minus size={11} /> },
  low:      { color: '#00C878', bg: 'rgba(0,200,120,0.1)',  label: 'LOW',      icon: <TrendingDown size={11} /> },
  unknown:  { color: '#546E7A', bg: 'rgba(84,110,122,0.1)', label: 'UNKNOWN',  icon: <Minus size={11} /> },
};

function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_CONFIG[level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.unknown;
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`, fontSize: 9, letterSpacing: '0.06em' }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Patient row ──────────────────────────────────────────────────────────────
function PatientRow({ patient, active, onClick }: { patient: Patient; active: boolean; onClick: () => void }) {
  const riskCfg = RISK_CONFIG[patient.risk_level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.unknown;
  const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200"
      style={{
        background: active ? 'rgba(0,184,204,0.06)' : 'transparent',
        border: `1px solid ${active ? 'rgba(0,184,204,0.25)' : 'transparent'}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs"
          style={{ background: `${riskCfg.color}18`, color: riskCfg.color, border: `1px solid ${riskCfg.color}25` }}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-xs truncate" style={{ color: active ? '#E8EEF6' : '#C8D8E8' }}>{patient.name}</p>
            <RiskBadge level={patient.risk_level} />
          </div>
          <p className="text-3xs font-mono truncate" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {patient.uid} {age ? `· ${age}y` : ''}{patient.sex ? ` · ${patient.sex}` : ''}
          </p>
        </div>
        {patient.conditions.length > 0 && (
          <span className="text-3xs shrink-0" style={{ color: 'var(--text-muted)', fontSize: 9 }}>
            {patient.conditions.length} Dx
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Analysis stream panel ────────────────────────────────────────────────────
function AnalysisRunner({ patient, analysisType, onDone }: {
  patient: Patient; analysisType: string; onDone: (result: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [done, setDone] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true); setOutput(''); setDone(false);

    try {
      const resp = await fetch(`/api/patients/${patient.id}/analyse`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_type: analysisType, prompt }),
      });

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const part of parts) {
          const evLine = part.split('\n').find((l: string) => l.startsWith('event: '));
          const dtLine = part.split('\n').find((l: string) => l.startsWith('data: '));
          if (!evLine || !dtLine) continue;
          const evType = evLine.slice(7).trim();
          try {
            const p = JSON.parse(dtLine.slice(6));
            if (evType === 'output') { setOutput(p.text ?? ''); onDone(p.text ?? ''); }
            if (evType === 'done') setDone(true);
          } catch { /* ok */ }
        }
      }
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setRunning(false); setDone(true);
    }
  }

  const ANALYSIS_LABELS: Record<string, string> = {
    risk_stratification: 'Risk Stratification',
    trial_matching: 'Clinical Trial Matching',
    drug_interactions: 'Drug Interaction Review',
    care_plan: 'Care Plan Generation',
    second_opinion: 'AI Second Opinion',
    general: 'General Analysis',
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold" style={{ color: '#00B8CC' }}>{ANALYSIS_LABELS[analysisType] ?? analysisType}</p>
      {(analysisType === 'second_opinion' || analysisType === 'general') && (
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          rows={2} placeholder="Additional context or specific question…"
          className="input-med w-full text-xs resize-none" style={{ fontSize: 12 }} />
      )}
      {!running && !output && (
        <button onClick={run} className="btn-med flex items-center gap-2 text-sm w-full justify-center py-2.5">
          <Play size={13} /> Start Analysis
        </button>
      )}
      {running && (
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full dot-online animate-pulse" />
          <span className="text-xs">AI analysing patient data…</span>
        </div>
      )}
      {output && (
        <div className="rounded-xl p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.3)', color: '#C8D8E8', border: '1px solid rgba(0,184,204,0.12)', fontSize: 11 }}>
          {output}
        </div>
      )}
    </div>
  );
}

// ─── Add Patient modal ────────────────────────────────────────────────────────
function AddPatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', dob: '', sex: '', uid: '', conditions: '', medications: '' });
  const create = useMutation({
    mutationFn: () => apiFetch('/patients', 'POST', {
      name: form.name, dob: form.dob || null, sex: form.sex || null, uid: form.uid || null,
      conditions: form.conditions ? form.conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
      medications: form.medications ? form.medications.split(',').map(s => s.trim()).filter(Boolean) : [],
    }),
    onSuccess: (r: any) => { if (r.id) onCreated(r.id); onClose(); },
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(5,10,18,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="glass p-6 w-full max-w-md space-y-5" style={{ border: '1px solid rgba(0,184,204,0.25)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base" style={{ color: '#E8EEF6' }}>Register Patient</h2>
          <button onClick={onClose} className="btn-ghost-med p-1 rounded"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Full Name *', key: 'name', placeholder: 'e.g. John Smith', type: 'text' },
            { label: 'Date of Birth', key: 'dob', placeholder: '1978-04-12', type: 'date' },
            { label: 'Custom UID (auto-generated if blank)', key: 'uid', placeholder: 'AMGI-GB-2024-0001234', type: 'text' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder} className="input-med w-full text-xs" style={{ fontSize: 12 }} />
            </div>
          ))}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Sex</label>
            <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}
              className="input-med w-full text-xs" style={{ fontSize: 12 }}>
              <option value="" className="bg-slate-900">Not specified</option>
              <option value="M" className="bg-slate-900">Male</option>
              <option value="F" className="bg-slate-900">Female</option>
              <option value="X" className="bg-slate-900">Other / Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Conditions (comma-separated)</label>
            <input value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
              placeholder="e.g. Type 2 Diabetes, Hypertension" className="input-med w-full text-xs" style={{ fontSize: 12 }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Medications (comma-separated)</label>
            <input value={form.medications} onChange={e => setForm(f => ({ ...f, medications: e.target.value }))}
              placeholder="e.g. Metformin 500mg, Lisinopril 10mg" className="input-med w-full text-xs" style={{ fontSize: 12 }} />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}
            className="btn-med flex-1 flex items-center justify-center gap-2 py-2.5"
            style={{ opacity: form.name.trim() ? 1 : 0.5 }}>
            {create.isPending ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Registering…</> : <><Plus size={14} /> Register Patient</>}
          </button>
          <button onClick={onClose} className="btn-ghost-med px-4">Cancel</button>
        </div>
        {create.isError && <p className="text-xs" style={{ color: '#FF1744' }}>Failed to register patient.</p>}
      </motion.div>
    </motion.div>
  );
}

// ─── Patient detail panel ─────────────────────────────────────────────────────
function PatientDetail({ patient, analyses, onClose, onRefresh }: {
  patient: Patient; analyses: Analysis[];
  onClose: () => void; onRefresh: () => void;
}) {
  const [activeAnalysis, setActiveAnalysis] = useState<string | null>(null);
  const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000) : null;
  const riskCfg = RISK_CONFIG[patient.risk_level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.unknown;

  const ANALYSES = [
    { key: 'risk_stratification', label: 'Risk Score', icon: <TrendingUp size={12} />, color: '#FF6D00' },
    { key: 'trial_matching',      label: 'Trial Match', icon: <FlaskConical size={12} />, color: '#9C27B0' },
    { key: 'drug_interactions',   label: 'Drug Safety', icon: <Pill size={12} />, color: '#FF1744' },
    { key: 'care_plan',           label: 'Care Plan',  icon: <ClipboardList size={12} />, color: '#00C878' },
    { key: 'second_opinion',      label: '2nd Opinion', icon: <Brain size={12} />, color: '#00B8CC' },
  ];

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
          style={{ background: `${riskCfg.color}18`, color: riskCfg.color, border: `1px solid ${riskCfg.color}25` }}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base" style={{ color: '#E8EEF6' }}>{patient.name}</h2>
            <RiskBadge level={patient.risk_level} />
          </div>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {patient.uid}{age ? ` · ${age}y` : ''}{patient.sex ? ` · ${patient.sex}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost-med p-1.5 rounded-lg shrink-0"><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Risk score bar */}
        <div className="glass p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Risk Score</span>
            <span className="text-2xl font-bold font-mono" style={{ color: riskCfg.color }}>{patient.risk_score.toFixed(0)}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${patient.risk_score}%` }}
              transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${riskCfg.color}80, ${riskCfg.color})` }} />
          </div>
          {patient.risk_factors.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {patient.risk_factors.slice(0, 4).map((f, i) => (
                <span key={i} className="text-3xs px-1.5 py-0.5 rounded"
                  style={{ background: `${riskCfg.color}10`, color: riskCfg.color, fontSize: 9, border: `1px solid ${riskCfg.color}20` }}>
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Conditions + meds */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass p-3 space-y-2">
            <p className="text-3xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', fontSize: 9 }}>DIAGNOSES</p>
            {patient.conditions.length > 0
              ? patient.conditions.map((c, i) => <p key={i} className="text-xs" style={{ color: '#C8D8E8' }}>{c}</p>)
              : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None recorded</p>
            }
          </div>
          <div className="glass p-3 space-y-2">
            <p className="text-3xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', fontSize: 9 }}>MEDICATIONS</p>
            {patient.medications.length > 0
              ? patient.medications.map((m, i) => <p key={i} className="text-xs" style={{ color: '#C8D8E8' }}>{m}</p>)
              : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None recorded</p>
            }
          </div>
        </div>

        {/* AI Summary */}
        {patient.ai_summary && (
          <div className="glass p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Brain size={12} style={{ color: '#00B8CC' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>AI Clinical Summary</p>
              {patient.summary_updated_at && (
                <span className="text-3xs ml-auto" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  {formatDistanceToNow(new Date(patient.summary_updated_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: '#C8D8E8' }}>
              {patient.ai_summary.slice(0, 400)}{patient.ai_summary.length > 400 ? '…' : ''}
            </p>
          </div>
        )}

        {/* AI Analysis tools */}
        <div className="glass p-4 space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>AI ANALYSIS TOOLS</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ANALYSES.map(({ key, label, icon, color }) => (
              <button key={key} onClick={() => setActiveAnalysis(activeAnalysis === key ? null : key)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-center"
                style={{
                  background: activeAnalysis === key ? `${color}12` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activeAnalysis === key ? color + '35' : 'rgba(255,255,255,0.06)'}`,
                }}>
                <span style={{ color }}>{icon}</span>
                <span className="text-3xs font-medium" style={{ color: activeAnalysis === key ? '#E8EEF6' : 'var(--text-muted)', fontSize: 10 }}>{label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence>
            {activeAnalysis && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <AnalysisRunner patient={patient} analysisType={activeAnalysis} onDone={onRefresh} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Analysis history */}
        {analyses.length > 0 && (
          <div className="glass p-4 space-y-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>ANALYSIS HISTORY</p>
            <div className="space-y-2">
              {analyses.slice(0, 5).map(a => (
                <div key={a.id} className="p-3 rounded-xl space-y-1.5"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-3xs" style={{ color: '#00B8CC', fontSize: 10 }}>{a.skill}</span>
                    <span className="text-3xs ml-auto" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {formatDistanceToNow(new Date(a.ts), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#C8D8E8' }}>
                    {a.result.slice(0, 200)}{a.result.length > 200 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PatientsPage() {
  const qc = useQueryClient();
  const [search, setSearch]     = useState('');
  const [riskFilter, setRisk]   = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);

  const { data, isLoading, refetch } = useQuery<{ patients: Patient[]; total: number }>({
    queryKey: ['patients', search, riskFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (riskFilter) params.set('risk', riskFilter);
      return apiFetch(`/patients?${params}`);
    },
    refetchInterval: 60_000,
  });

  const { data: detail } = useQuery<{ patient: Patient; analyses: Analysis[] }>({
    queryKey: ['patient-detail', selected],
    queryFn: () => apiFetch(`/patients/${selected}`),
    enabled: !!selected,
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/patients/${id}`, 'DELETE'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patients'] }); if (selected) setSelected(null); },
  });

  const patients = data?.patients ?? [];
  const riskCounts = patients.reduce((acc, p) => {
    acc[p.risk_level] = (acc[p.risk_level] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex gap-0 h-full" style={{ height: 'calc(100vh - 112px)' }}>

      {/* Left: patient list */}
      <div className="w-72 shrink-0 flex flex-col gap-3 pr-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <Users size={15} style={{ color: '#00B8CC' }} />
          <h1 className="font-bold text-sm" style={{ color: '#E8EEF6' }}>Patient Intelligence</h1>
          <button onClick={() => setShowAdd(true)} className="btn-med ml-auto flex items-center gap-1 text-xs py-1 px-2.5">
            <Plus size={12} /> Add
          </button>
        </div>

        {/* Risk summary */}
        <div className="grid grid-cols-4 gap-1.5">
          {Object.entries(RISK_CONFIG).filter(([k]) => k !== 'unknown').map(([level, cfg]) => (
            <button key={level} onClick={() => setRisk(riskFilter === level ? '' : level)}
              className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all"
              style={{
                background: riskFilter === level ? cfg.bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${riskFilter === level ? cfg.color + '30' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <span className="font-bold text-sm" style={{ color: cfg.color }}>{riskCounts[level] ?? 0}</span>
              <span className="text-3xs" style={{ color: cfg.color, fontSize: 8, letterSpacing: '0.04em' }}>{level.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search patients or UID…" className="input-med w-full pl-7 text-xs py-1.5" style={{ fontSize: 12 }} />
        </div>

        {/* Patient list */}
        <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel h-11 rounded-xl" style={{ animationDelay: `${i * 0.07}s` }} />)
            : patients.length === 0
              ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12" style={{ color: 'var(--text-muted)' }}>
                  <Users size={32} className="opacity-10" />
                  <p className="text-xs">No patients found</p>
                  <button onClick={() => setShowAdd(true)} className="btn-med text-xs py-1 px-3 flex items-center gap-1">
                    <Plus size={11} /> Register first patient
                  </button>
                </div>
              )
              : patients.map(p => (
                <PatientRow key={p.id} patient={p} active={selected === p.id} onClick={() => setSelected(p.id)} />
              ))
          }
        </div>

        <div className="text-3xs text-center pb-1" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {patients.length} patient{patients.length !== 1 ? 's' : ''} · AMGI patient UID format
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-hidden" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
        <AnimatePresence mode="wait">
          {detail?.patient ? (
            <motion.div key={selected} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }} className="h-full">
              <PatientDetail
                patient={detail.patient}
                analyses={detail.analyses ?? []}
                onClose={() => setSelected(null)}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['patient-detail', selected] })}
              />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
              <Users size={52} className="opacity-10" />
              <p className="text-base font-semibold" style={{ color: '#E8EEF6' }}>Select a patient</p>
              <p className="text-sm text-center max-w-xs">
                Patient Intelligence Hub — AI risk stratification, trial matching, drug safety, and care planning.
              </p>
              <button onClick={() => setShowAdd(true)} className="btn-med flex items-center gap-2 mt-2">
                <Plus size={14} /> Register Patient
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <AddPatientModal
            onClose={() => setShowAdd(false)}
            onCreated={id => { qc.invalidateQueries({ queryKey: ['patients'] }); setSelected(id); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
