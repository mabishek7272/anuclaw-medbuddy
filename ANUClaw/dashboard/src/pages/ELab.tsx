import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Lock, ShieldCheck, KeyRound, Copy, Check, Loader2,
  Pill, Atom, AlertTriangle, CheckCircle, XCircle, Info, Unlock, Fingerprint, Activity,
  FileText, FileSearch,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { api } from '../lib/api';

const TEAL = '#00B8CC';

// ─── Types ──────────────────────────────────────────────────────────────────
interface MfaStatus { enrolled: boolean; unlocked: boolean }
interface SetupResp { secret: string; otpauth_uri: string }

interface ClinicalVerdict {
  domain: string;
  decision: 'recommend' | 'block' | 'cannot_advise' | 'no_guideline';
  reason_code: string;
  recommendation: { recommendation: string; strength: string; regimen: string[]; citation_ids: string[] } | null;
  citations: { id: string; source: string; section?: string; statement: string }[];
  blocks: { message: string; severity: string; citation_ids?: string[] }[];
  warnings: { message: string; severity: string }[];
  supporting_evidence: { engine_id: string; kind: string; summary: string }[];
  confidence: string;
  rule_version: string;
  verdict_hash: string;
}
interface DockMode { mode: number; affinity_kcal_mol: number; rmsd_lb: number; rmsd_ub: number }
interface DockResp {
  ok: true;
  result: {
    engine_id: string; engine_version: string; input_hash: string;
    reproducibility_class: string; seed?: number;
    output: { best_affinity_kcal_mol: number; modes: DockMode[] };
  };
}

interface PkPoint { t_h: number; conc_mg_l: number }
interface PkPdResult {
  series: PkPoint[];
  ke_per_h: number; half_life_h: number; cmax_mg_l: number; tmax_h: number;
  cmin_mg_l: number; auc_0_t_mg_h_l: number; auc_inf_mg_h_l: number;
}

const DECISION_STYLE: Record<string, { color: string; bg: string; Icon: React.ElementType; label: string }> = {
  recommend:     { color: '#00E676', bg: 'rgba(0,230,118,0.10)', Icon: CheckCircle,   label: 'RECOMMEND' },
  block:         { color: '#FF1744', bg: 'rgba(255,23,68,0.10)', Icon: XCircle,       label: 'BLOCK' },
  cannot_advise: { color: '#FFB300', bg: 'rgba(255,179,0,0.10)', Icon: AlertTriangle, label: 'CANNOT ADVISE' },
  no_guideline:  { color: '#90A4AE', bg: 'rgba(144,164,174,0.10)', Icon: Info,        label: 'NO GUIDELINE' },
};

const RECOMMEND_EXAMPLE = { tumor_type: 'breast', stage: 'II', biomarker: 'HER2+', line: '1', regimen: 'trastuzumab, pertuzumab, docetaxel', lvef: '60' };
const BLOCK_EXAMPLE     = { ...RECOMMEND_EXAMPLE, lvef: '40' };

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ locked, onLock }: { locked: boolean; onLock?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(0,184,204,0.12)', border: '1px solid rgba(0,184,204,0.25)' }}>
          <FlaskConical size={22} style={{ color: TEAL }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>E-LAB · Clinical Engine Console</h1>
          <p className="text-xs" style={{ color: '#7C8DA6' }}>
            Real deterministic engines — oncology drug-combination + molecular docking.
            <span style={{ color: '#FFB300' }}> Seed content · internal demo · not for patient care.</span>
          </p>
        </div>
      </div>
      {!locked && onLock && (
        <button onClick={onLock}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ color: '#90A4AE', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Lock size={13} /> Lock E-LAB
        </button>
      )}
    </div>
  );
}

// ─── 2FA Gate ───────────────────────────────────────────────────────────────
function MfaGate({ status, onUnlocked }: { status: MfaStatus; onUnlocked: () => void }) {
  const [setup, setSetup] = useState<SetupResp | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function startSetup() {
    setBusy(true); setErr('');
    try { setSetup(await api.post<SetupResp>('/elab-engine/mfa/setup', {})); }
    catch (e: any) { setErr(e.message ?? 'Setup failed'); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code from your authenticator.'); return; }
    setBusy(true); setErr('');
    try { await api.post('/elab-engine/mfa/verify', { code }); onUnlocked(); }
    catch (e: any) { setErr(e.message ?? 'Invalid code'); }
    finally { setBusy(false); }
  }

  const needsEnrol = !status.enrolled && !setup;

  return (
    <div className="max-w-md mx-auto mt-6">
      <GlassCard padding="lg">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 rounded-2xl mb-4" style={{ background: 'rgba(0,184,204,0.10)', border: '1px solid rgba(0,184,204,0.25)' }}>
            <Fingerprint size={30} style={{ color: TEAL }} />
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color: '#E8EEF6' }}>Two-factor required</h2>
          <p className="text-xs mb-5" style={{ color: '#7C8DA6' }}>
            E-LAB runs clinical-grade engines. Confirm a TOTP code to unlock this session (valid 15 min).
          </p>

          {needsEnrol && (
            <button onClick={startSetup} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: TEAL, color: '#04121A' }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Set up authenticator
            </button>
          )}

          {setup && (
            <div className="w-full mb-4 text-left">
              <p className="text-xs mb-2" style={{ color: '#9FB2C9' }}>
                Add to Google Authenticator / Authy / 1Password — scan or enter this key manually:
              </p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.18)' }}>
                <code className="flex-1 text-xs font-mono tracking-wider" style={{ color: TEAL }}>{setup.secret}</code>
                <button onClick={() => { navigator.clipboard.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  style={{ color: '#7C8DA6' }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
              </div>
              <p className="text-2xs break-all" style={{ color: '#54657C' }}>{setup.otpauth_uri}</p>
            </div>
          )}

          {(status.enrolled || setup) && (
            <div className="w-full">
              <input
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && verify()}
                placeholder="000000" inputMode="numeric" autoFocus
                className="w-full text-center text-2xl font-mono tracking-[0.4em] py-3 rounded-xl mb-3 outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.2)', color: '#E8EEF6' }}
              />
              <button onClick={verify} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm"
                style={{ background: TEAL, color: '#04121A' }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />} Unlock E-LAB
              </button>
            </div>
          )}

          {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Clinical panel (multi-domain: oncology + neurology) ────────────────────────
const NEURO_RECOMMEND = { indication: 'focal-onset seizures', line: '1', regimen: 'lamotrigine', pregnancy_status: '', hla_b_1502: '', renal_egfr: '' };
const NEURO_BLOCK = { indication: 'generalized tonic-clonic seizures', line: '1', regimen: 'valproate', pregnancy_status: 'childbearing_potential', hla_b_1502: '', renal_egfr: '' };

const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' } as const;

function ClinicalPanel() {
  const [domain, setDomain] = useState<'oncology-combination' | 'neurology-combination'>('oncology-combination');
  const [f, setF] = useState(RECOMMEND_EXAMPLE);
  const [nf, setNf] = useState(NEURO_RECOMMEND);
  const [verdict, setVerdict] = useState<ClinicalVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setO = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const setN = (k: keyof typeof nf) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNf({ ...nf, [k]: e.target.value });

  function switchDomain(d: typeof domain) { setDomain(d); setVerdict(null); setErr(''); }

  async function evaluate() {
    setBusy(true); setErr(''); setVerdict(null);
    const payload = domain === 'oncology-combination'
      ? {
          domain,
          query: { tumor_type: f.tumor_type, stage: f.stage, biomarker: f.biomarker, line: Number(f.line) || 1, candidate_regimen: f.regimen.split(',').map((s) => s.trim()).filter(Boolean) },
          context: { organ_function: f.lvef.trim() === '' ? {} : { lvef: Number(f.lvef) }, allergies: { status: 'confirmed_none', items: [] }, current_medications: { status: 'confirmed_none', items: [] }, conditions: { status: 'confirmed_none', items: [] } },
        }
      : {
          domain,
          query: { indication: nf.indication, line: Number(nf.line) || 1, candidate_regimen: nf.regimen.split(',').map((s) => s.trim()).filter(Boolean) },
          context: {
            factors: { ...(nf.pregnancy_status ? { pregnancy_status: nf.pregnancy_status } : {}), ...(nf.hla_b_1502 ? { hla_b_1502: nf.hla_b_1502 } : {}) },
            organ_function: nf.renal_egfr.trim() === '' ? {} : { renal_egfr: Number(nf.renal_egfr) },
            allergies: { status: 'confirmed_none', items: [] }, current_medications: { status: 'confirmed_none', items: [] }, conditions: { status: 'confirmed_none', items: [] },
          },
        };
    try {
      const r = await api.post<{ verdict: ClinicalVerdict }>('/elab-engine/clinical/drug-combination', payload);
      setVerdict(r.verdict);
    } catch (e: any) { setErr(e.message ?? 'Evaluation failed'); }
    finally { setBusy(false); }
  }

  const OField = ({ label, k, w }: { label: string; k: keyof typeof f; w?: string }) => (
    <label className={`flex flex-col gap-1 ${w ?? ''}`}>
      <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>{label}</span>
      <input value={f[k]} onChange={setO(k)} className="px-2.5 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </label>
  );
  const NField = ({ label, k }: { label: string; k: keyof typeof nf }) => (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>{label}</span>
      <input value={nf[k]} onChange={setN(k)} className="px-2.5 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </label>
  );
  const NSelect = ({ label, k, opts }: { label: string; k: keyof typeof nf; opts: [string, string][] }) => (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>{label}</span>
      <select value={nf[k]} onChange={setN(k)} className="px-2.5 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Pill size={16} style={{ color: TEAL }} />
          <select value={domain} onChange={(e) => switchDomain(e.target.value as typeof domain)}
            className="px-2.5 py-1.5 rounded-lg text-sm font-bold outline-none" style={inputStyle}>
            <option value="oncology-combination">Oncology — drug combination</option>
            <option value="neurology-combination">Neurology — antiseizure medication</option>
          </select>
        </div>

        {domain === 'oncology-combination' ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <OField label="Tumor type" k="tumor_type" />
              <OField label="Stage" k="stage" />
              <OField label="Biomarker" k="biomarker" />
              <OField label="Line" k="line" />
            </div>
            <div className="mb-3"><OField label="Candidate regimen (comma-separated)" k="regimen" w="col-span-2" /></div>
            <div className="mb-4"><OField label="LVEF % (blank = not provided)" k="lvef" /></div>
            <div className="flex flex-wrap gap-2">
              <button onClick={evaluate} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Evaluate
              </button>
              <button onClick={() => setF(RECOMMEND_EXAMPLE)} className="px-3 py-2 rounded-lg text-xs" style={{ color: '#9FB2C9', border: '1px solid rgba(255,255,255,0.1)' }}>Recommend example</button>
              <button onClick={() => setF(BLOCK_EXAMPLE)} className="px-3 py-2 rounded-lg text-xs" style={{ color: '#9FB2C9', border: '1px solid rgba(255,255,255,0.1)' }}>Low-LVEF (block) example</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <NField label="Indication" k="indication" />
              <NField label="Line" k="line" />
            </div>
            <div className="mb-3"><NField label="Candidate ASM(s) (comma-separated)" k="regimen" /></div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <NSelect label="Pregnancy status" k="pregnancy_status" opts={[['', '— not provided —'], ['not_applicable', 'Not applicable'], ['childbearing_potential', 'Childbearing potential'], ['pregnant', 'Pregnant']]} />
              <NSelect label="HLA-B*15:02" k="hla_b_1502" opts={[['', '— not provided —'], ['unknown', 'Unknown'], ['negative', 'Negative'], ['positive', 'Positive']]} />
              <NField label="Renal eGFR (blank = n/a)" k="renal_egfr" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={evaluate} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Evaluate
              </button>
              <button onClick={() => setNf(NEURO_RECOMMEND)} className="px-3 py-2 rounded-lg text-xs" style={{ color: '#9FB2C9', border: '1px solid rgba(255,255,255,0.1)' }}>Recommend example</button>
              <button onClick={() => setNf(NEURO_BLOCK)} className="px-3 py-2 rounded-lg text-xs" style={{ color: '#9FB2C9', border: '1px solid rgba(255,255,255,0.1)' }}>Valproate (block) example</button>
            </div>
          </>
        )}
        {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
      </GlassCard>

      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-4" style={{ color: '#E8EEF6' }}>Verdict</h3>
        {!verdict && <p className="text-xs" style={{ color: '#54657C' }}>Run an evaluation to see the deterministic verdict, citations and safety findings.</p>}
        {verdict && <VerdictView v={verdict} />}
      </GlassCard>
    </div>
  );
}

function VerdictView({ v }: { v: ClinicalVerdict }) {
  const s = DECISION_STYLE[v.decision] ?? DECISION_STYLE.no_guideline;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.color}40` }}>
        <s.Icon size={20} style={{ color: s.color }} />
        <div>
          <p className="text-sm font-bold" style={{ color: s.color }}>{s.label}</p>
          <p className="text-2xs font-mono" style={{ color: '#7C8DA6' }}>{v.reason_code} · confidence {v.confidence}</p>
        </div>
      </div>

      {v.recommendation && (
        <div>
          <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Recommendation · {v.recommendation.strength}</p>
          <p className="text-sm" style={{ color: '#CFE0F2' }}>{v.recommendation.recommendation}</p>
          <p className="text-2xs mt-1 font-mono" style={{ color: TEAL }}>{v.recommendation.regimen.join(' + ')}</p>
        </div>
      )}

      {v.blocks.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#FF6E8A' }}>Blocks</p>
          {v.blocks.map((b, i) => <p key={i} className="text-xs mb-1" style={{ color: '#FFB3C1' }}>• {b.message}</p>)}
        </div>
      )}
      {v.warnings.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#FFB300' }}>Warnings</p>
          {v.warnings.map((w, i) => <p key={i} className="text-xs mb-1" style={{ color: '#FFD27A' }}>• {w.message}</p>)}
        </div>
      )}

      {v.citations.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Citations</p>
          {v.citations.map((c) => (
            <p key={c.id} className="text-xs mb-1" style={{ color: '#9FB2C9' }}>
              <span style={{ color: TEAL }}>[{c.source}]</span> {c.section ? `${c.section} — ` : ''}{c.statement}
            </p>
          ))}
        </div>
      )}

      {v.supporting_evidence.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Supporting evidence (never originates)</p>
          {v.supporting_evidence.map((e, i) => <p key={i} className="text-xs" style={{ color: '#9FB2C9' }}>• [{e.kind}] {e.summary}</p>)}
        </div>
      )}

      <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-2xs font-mono break-all" style={{ color: '#54657C' }}>
          rule {v.rule_version} · hash {v.verdict_hash.slice(0, 24)}…
        </p>
      </div>
    </div>
  );
}

// ─── Docking panel ──────────────────────────────────────────────────────────
function DockingPanel() {
  const [ligand, setLigand] = useState('CC(=O)Oc1ccccc1C(=O)O'); // aspirin
  const [receptor, setReceptor] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<DockResp['result'] | null>(null);

  async function dock() {
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await api.post<DockResp>('/elab-engine/dock', { ligand_smiles: ligand, receptor_smiles: receptor || undefined });
      setRes(r.result);
    } catch (e: any) { setErr(e.message ?? 'Docking failed (is Docker + the anuclaw-vina image running?)'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: '#E8EEF6' }}><Atom size={16} style={{ color: TEAL }} /> Molecular docking (AutoDock Vina)</h3>
        <p className="text-2xs mb-4" style={{ color: '#7C8DA6' }}>RUO — real engine run; demo molecules. Requires Docker + the anuclaw-vina image.</p>
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>Ligand SMILES</span>
          <input value={ligand} onChange={(e) => setLigand(e.target.value)}
            className="px-2.5 py-2 rounded-lg text-sm font-mono outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
        </label>
        <label className="flex flex-col gap-1 mb-4">
          <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>Receptor SMILES (blank = use ligand as demo target)</span>
          <input value={receptor} onChange={(e) => setReceptor(e.target.value)}
            className="px-2.5 py-2 rounded-lg text-sm font-mono outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
        </label>
        <button onClick={dock} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Atom size={14} />} {busy ? 'Docking…' : 'Run docking'}
        </button>
        {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
      </GlassCard>

      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-4" style={{ color: '#E8EEF6' }}>Binding result</h3>
        {!res && <p className="text-xs" style={{ color: '#54657C' }}>Run docking to see the best affinity and per-mode poses.</p>}
        {res && (
          <div className="space-y-4">
            <div className="px-3 py-3 rounded-xl text-center" style={{ background: 'rgba(0,184,204,0.08)', border: '1px solid rgba(0,184,204,0.25)' }}>
              <p className="text-2xs uppercase" style={{ color: '#7C8DA6' }}>Best affinity</p>
              <p className="text-2xl font-bold font-mono" style={{ color: TEAL }}>{res.output.best_affinity_kcal_mol} <span className="text-sm">kcal/mol</span></p>
            </div>
            <table className="w-full text-xs">
              <thead><tr style={{ color: '#7C8DA6' }}>
                <th className="text-left py-1">Mode</th><th className="text-right">Affinity</th><th className="text-right">RMSD l.b.</th><th className="text-right">RMSD u.b.</th>
              </tr></thead>
              <tbody>
                {res.output.modes.map((m) => (
                  <tr key={m.mode} style={{ color: '#CFE0F2', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td className="py-1">{m.mode}</td><td className="text-right font-mono">{m.affinity_kcal_mol}</td>
                    <td className="text-right font-mono">{m.rmsd_lb}</td><td className="text-right font-mono">{m.rmsd_ub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-2xs font-mono break-all" style={{ color: '#54657C', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              {res.engine_id} v{res.engine_version} · {res.reproducibility_class} · seed {res.seed ?? '—'} · input {res.input_hash.slice(0, 16)}…
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Simulation panel (PK/PD) ──────────────────────────────────────────────────
const SIM_DEFAULT = { route: 'oral', dose_mg: '500', clearance_l_h: '7', volume_l: '50', ka_per_h: '1', interval_h: '12', n_doses: '5' };

function ConcChart({ series }: { series: PkPoint[] }) {
  const W = 520, H = 200, pad = 34;
  const maxT = Math.max(...series.map((p) => p.t_h), 1);
  const maxC = Math.max(...series.map((p) => p.conc_mg_l), 1e-6);
  const x = (t: number) => pad + (t / maxT) * (W - pad - 8);
  const y = (c: number) => H - pad - (c / maxC) * (H - pad - 10);
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t_h).toFixed(1)},${y(p.conc_mg_l).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      <line x1={pad} y1={H - pad} x2={W - 8} y2={H - pad} stroke="rgba(255,255,255,0.15)" />
      <line x1={pad} y1={10} x2={pad} y2={H - pad} stroke="rgba(255,255,255,0.15)" />
      <path d={path} fill="none" stroke={TEAL} strokeWidth={2} />
      <path d={`${path} L${x(maxT).toFixed(1)},${H - pad} L${pad},${H - pad} Z`} fill="rgba(0,184,204,0.10)" stroke="none" />
      <text x={pad} y={H - 8} fill="#54657C" fontSize="9">0</text>
      <text x={W - 24} y={H - 8} fill="#54657C" fontSize="9">{maxT.toFixed(0)} h</text>
      <text x={4} y={16} fill="#54657C" fontSize="9">{maxC.toFixed(1)} mg/L</text>
    </svg>
  );
}

function SimulationPanel() {
  const [f, setF] = useState(SIM_DEFAULT);
  const [res, setRes] = useState<PkPdResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function simulate() {
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await api.post<{ result: PkPdResult }>('/elab-engine/simulate', {
        route: f.route, dose_mg: Number(f.dose_mg), clearance_l_h: Number(f.clearance_l_h), volume_l: Number(f.volume_l),
        ka_per_h: Number(f.ka_per_h), interval_h: Number(f.interval_h), n_doses: Number(f.n_doses),
      });
      setRes(r.result);
    } catch (e: any) { setErr(e.message ?? 'Simulation failed'); }
    finally { setBusy(false); }
  }

  const NumField = ({ label, k }: { label: string; k: keyof typeof f }) => (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>{label}</span>
      <input value={f[k]} onChange={set(k)} inputMode="decimal"
        className="px-2.5 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
    </label>
  );
  const Metric = ({ label, val, unit }: { label: string; val: number; unit: string }) => (
    <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-2xs uppercase" style={{ color: '#7C8DA6' }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: '#E8EEF6' }}>{val} <span className="text-2xs" style={{ color: '#7C8DA6' }}>{unit}</span></p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: '#E8EEF6' }}><Activity size={16} style={{ color: TEAL }} /> One-compartment PK/PD simulation</h3>
        <p className="text-2xs mb-4" style={{ color: '#7C8DA6' }}>RUO — deterministic pharmacokinetics; reproducible. Not a validated dosing tool.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>Route</span>
            <select value={f.route} onChange={set('route')}
              className="px-2.5 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }}>
              <option value="oral">Oral</option><option value="iv">IV bolus</option>
            </select>
          </label>
          <NumField label="Dose (mg)" k="dose_mg" />
          <NumField label="Clearance (L/h)" k="clearance_l_h" />
          <NumField label="Volume (L)" k="volume_l" />
          {f.route === 'oral' && <NumField label="ka (1/h)" k="ka_per_h" />}
          <NumField label="Interval (h)" k="interval_h" />
          <NumField label="No. doses" k="n_doses" />
        </div>
        <button onClick={simulate} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Run simulation
        </button>
        {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
      </GlassCard>

      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-4" style={{ color: '#E8EEF6' }}>Concentration–time profile</h3>
        {!res && <p className="text-xs" style={{ color: '#54657C' }}>Run a simulation to see the plasma concentration curve and PK metrics.</p>}
        {res && (
          <div className="space-y-4">
            <ConcChart series={res.series} />
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Cmax" val={res.cmax_mg_l} unit="mg/L" />
              <Metric label="Tmax" val={res.tmax_h} unit="h" />
              <Metric label="Cmin" val={res.cmin_mg_l} unit="mg/L" />
              <Metric label="t½" val={res.half_life_h} unit="h" />
              <Metric label="ke" val={res.ke_per_h} unit="1/h" />
              <Metric label="AUC∞" val={res.auc_inf_mg_h_l} unit="mg·h/L" />
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Assistive (LLM) tools — shared scaffolding ─────────────────────────────────
interface Envelope {
  assistive?: boolean; not_diagnostic?: boolean; needs_human_review?: boolean; disclaimer?: string;
  phi?: { deidentified: boolean; baa_covered: boolean; redactions: number; residual_risk?: string };
  provenance?: { provider: string; model: string; prompt_version: string; generated_at: string };
}

function AssistiveBanner({ env }: { env?: Envelope }) {
  const phi = env?.phi;
  return (
    <div className="mb-4 space-y-1.5">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.3)' }}>
        <AlertTriangle size={15} style={{ color: '#FFB300', marginTop: 1 }} />
        <p className="text-2xs" style={{ color: '#FFD27A' }}>
          AI-assisted · <b>non-diagnostic</b> · a licensed clinician must independently verify. Output is supporting only — it never decides.
          {env?.provenance && <span style={{ color: '#7C8DA6' }}> · {env.provenance.model} ({env.provenance.prompt_version})</span>}
        </p>
      </div>
      {phi && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,184,204,0.06)', border: '1px solid rgba(0,184,204,0.2)' }}>
          <ShieldCheck size={13} style={{ color: phi.baa_covered ? '#00E676' : phi.deidentified ? TEAL : '#FF6E8A' }} />
          <p className="text-2xs" style={{ color: '#9FB2C9' }}>
            {phi.baa_covered
              ? 'Provider BAA-covered — PHI permitted.'
              : phi.deidentified
                ? <>De-identified before egress · <b>{phi.redactions}</b> identifier(s) redacted · re-identified locally{phi.residual_risk === 'residual' && <span style={{ color: '#FFD27A' }}> · residual risk (names)</span>}</>
                : 'PHI sent to provider (de-id disabled).'}
          </p>
        </div>
      )}
    </div>
  );
}

function useAssistive<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [env, setEnv] = useState<Envelope | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function run(body: unknown) {
    setBusy(true); setErr(''); setData(null);
    try {
      const r = await api.post<Envelope & { result: T }>(path, body);
      setData(r.result); setEnv(r);
    } catch (e: any) { setErr(e.message ?? 'Request failed'); }
    finally { setBusy(false); }
  }
  return { data, env, busy, err, run };
}

const Area = (props: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} rows={props.rows ?? 8}
    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
);
const RunBtn = ({ onClick, busy, label, Icon }: { onClick: () => void; busy: boolean; label: string; Icon: React.ElementType }) => (
  <button onClick={onClick} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
    {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {label}
  </button>
);
const QuoteList = ({ title, items, render }: { title: string; items: any[]; render: (x: any) => React.ReactNode }) => {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>{title}</p>
      {items.map((x, i) => <div key={i} className="text-xs mb-1.5" style={{ color: '#CFE0F2' }}>{render(x)}</div>)}
    </div>
  );
};
const Quote = ({ q }: { q?: string }) => q ? <span className="block text-2xs italic mt-0.5" style={{ color: '#7C8DA6' }}>“{q}”</span> : null;

// ─── Med NLP panel ──────────────────────────────────────────────────────────
function NlpPanel() {
  const [text, setText] = useState('58M with HTN on lisinopril 10mg daily. Allergic to penicillin (rash). BP 168/98, HR 92. Troponin 0.9 ng/mL (elevated). Crushing chest pain x2h.');
  const { data, env, busy, err, run } = useAssistive<any>('/elab-engine/nlp/extract');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#E8EEF6' }}><FileText size={16} style={{ color: TEAL }} /> Clinical text</h3>
        <div className="mb-3"><Area value={text} onChange={setText} placeholder="Paste clinical note / discharge summary…" /></div>
        <RunBtn onClick={() => run({ text })} busy={busy} label="Extract entities" Icon={FileText} />
        {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
      </GlassCard>
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#E8EEF6' }}>Extracted (each grounded in a quote)</h3>
        <AssistiveBanner env={env} />
        {!data && <p className="text-xs" style={{ color: '#54657C' }}>Run extraction to see grounded entities.</p>}
        {data && (
          <div className="space-y-3">
            <QuoteList title="Problems" items={data.problems} render={(x) => <>• {x.text}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Medications" items={data.medications} render={(x) => <>• {x.name} {x.dose} {x.route} {x.frequency}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Allergies" items={data.allergies} render={(x) => <>• {x.substance} — {x.reaction}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Vitals" items={data.vitals} render={(x) => <>• {x.name}: {x.value} {x.unit}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Labs" items={data.labs} render={(x) => <>• {x.name}: {x.value} {x.unit} {x.flag && <span style={{ color: '#FFB300' }}>[{x.flag}]</span>}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Red flags" items={data.red_flags} render={(x) => <><span style={{ color: '#FF6E8A' }}>• [{x.urgency}] {x.description}</span><Quote q={x.evidence_quote} /></>} />
            {data.notes && <p className="text-2xs" style={{ color: '#7C8DA6' }}>{data.notes}</p>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Reporting panel (read + write) ─────────────────────────────────────────
function ReportingPanel() {
  const [mode, setMode] = useState<'write' | 'read'>('write');
  const [reportType, setReportType] = useState('progress note');
  const [inputs, setInputs] = useState('Patient: 58M. Reason: follow-up HTN. BP today 138/86 (improved). Meds: lisinopril 10mg daily, tolerated. Plan: continue, recheck 4 weeks.');
  const [reportText, setReportText] = useState('');
  const draft = useAssistive<any>('/elab-engine/report/draft');
  const read = useAssistive<any>('/elab-engine/report/read');
  const active = mode === 'write' ? draft : read;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <div className="flex gap-2 mb-4">
          {(['write', 'read'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={mode === m ? { background: 'rgba(0,184,204,0.14)', color: TEAL, border: '1px solid rgba(0,184,204,0.35)' } : { color: '#7C8DA6', border: '1px solid rgba(255,255,255,0.08)' }}>
              {m === 'write' ? 'Write (draft)' : 'Read (summarise)'}
            </button>
          ))}
        </div>
        {mode === 'write' ? (
          <>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>Report type</span>
              <input value={reportType} onChange={(e) => setReportType(e.target.value)} className="px-2.5 py-2 rounded-lg text-sm outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
            </label>
            <p className="text-2xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#7C8DA6' }}>Inputs (facts only)</p>
            <div className="mb-3"><Area value={inputs} onChange={setInputs} rows={7} /></div>
            <RunBtn onClick={() => draft.run({ report_type: reportType, inputs })} busy={draft.busy} label="Draft report" Icon={FileText} />
            {draft.err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{draft.err}</p>}
          </>
        ) : (
          <>
            <p className="text-2xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#7C8DA6' }}>Existing report</p>
            <div className="mb-3"><Area value={reportText} onChange={setReportText} placeholder="Paste a report to summarise…" rows={9} /></div>
            <RunBtn onClick={() => read.run({ text: reportText })} busy={read.busy} label="Summarise report" Icon={FileSearch} />
            {read.err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{read.err}</p>}
          </>
        )}
      </GlassCard>

      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#E8EEF6' }}>{mode === 'write' ? 'Drafted report' : 'Report summary'}</h3>
        <AssistiveBanner env={active.env} />
        {!active.data && <p className="text-xs" style={{ color: '#54657C' }}>{mode === 'write' ? 'Provide facts and draft a report.' : 'Paste a report to summarise.'}</p>}
        {mode === 'write' && draft.data && (
          <div className="space-y-3">
            {draft.data.watermark && <p className="text-2xs font-bold uppercase" style={{ color: '#FFB300' }}>{draft.data.watermark}</p>}
            <p className="text-sm font-bold" style={{ color: '#E8EEF6' }}>{draft.data.title}</p>
            {(draft.data.sections ?? []).map((s: any, i: number) => (
              <div key={i}><p className="text-2xs font-semibold uppercase" style={{ color: TEAL }}>{s.heading}</p><p className="text-xs whitespace-pre-wrap" style={{ color: '#CFE0F2' }}>{s.content}</p></div>
            ))}
          </div>
        )}
        {mode === 'read' && read.data && (
          <div className="space-y-3">
            {read.data.document_type && <p className="text-2xs" style={{ color: '#7C8DA6' }}>Type: {read.data.document_type}</p>}
            {(read.data.sections ?? []).map((s: any, i: number) => (
              <div key={i}><p className="text-2xs font-semibold uppercase" style={{ color: TEAL }}>{s.heading}</p><p className="text-xs" style={{ color: '#CFE0F2' }}>{s.summary}</p></div>
            ))}
            <QuoteList title="Key findings" items={read.data.key_findings} render={(x) => <>• {x.finding}<Quote q={x.evidence_quote} /></>} />
            <QuoteList title="Follow-up" items={read.data.follow_up_items} render={(x) => <>• {x}</>} />
            <QuoteList title="Missing / ambiguous" items={read.data.missing_or_ambiguous} render={(x) => <span style={{ color: '#FFD27A' }}>• {x}</span>} />
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Second opinion panel ────────────────────────────────────────────────────
function SecondOpinionPanel() {
  const [caseSummary, setCaseSummary] = useState('HER2+ stage II breast cancer, LVEF 40%.');
  const [plan, setPlan] = useState('trastuzumab + pertuzumab + docetaxel');
  const [verdict, setVerdict] = useState('');
  const { data, env, busy, err, run } = useAssistive<any>('/elab-engine/second-opinion');
  function go() {
    let engine_verdict: unknown = undefined;
    if (verdict.trim()) { try { engine_verdict = JSON.parse(verdict); } catch { /* sent as omitted */ } }
    run({ case_summary: caseSummary, proposed_plan: plan, engine_verdict });
  }
  const CONC: Record<string, string> = { agree: '#00E676', partial: '#FFB300', differ: '#FF6E8A', no_engine_input: '#90A4AE' };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#E8EEF6' }}><ShieldCheck size={16} style={{ color: TEAL }} /> Case</h3>
        <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Case summary</p>
        <div className="mb-3"><Area value={caseSummary} onChange={setCaseSummary} rows={4} /></div>
        <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Proposed plan</p>
        <div className="mb-3"><Area value={plan} onChange={setPlan} rows={2} /></div>
        <p className="text-2xs font-semibold uppercase mb-1" style={{ color: '#7C8DA6' }}>Engine verdict JSON (optional — paste from Clinical tab; it cannot be overridden)</p>
        <div className="mb-3"><Area value={verdict} onChange={setVerdict} rows={3} placeholder='{"decision":"block",...}' /></div>
        <RunBtn onClick={go} busy={busy} label="Get second opinion" Icon={ShieldCheck} />
        {err && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{err}</p>}
      </GlassCard>
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-3" style={{ color: '#E8EEF6' }}>Advisory second opinion</h3>
        <AssistiveBanner env={env} />
        {!data && <p className="text-xs" style={{ color: '#54657C' }}>Independent advisory view — it defers to any engine block.</p>}
        {data && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-2 py-1 rounded-md text-2xs font-bold uppercase" style={{ color: CONC[data.concordance_with_engine] ?? '#90A4AE', border: `1px solid ${(CONC[data.concordance_with_engine] ?? '#90A4AE')}40` }}>
                {String(data.concordance_with_engine ?? '').replace(/_/g, ' ')}
              </span>
              {data.defers_to_block && <span className="px-2 py-1 rounded-md text-2xs font-bold uppercase" style={{ color: '#FF6E8A', border: '1px solid #FF6E8A40' }}>defers to engine block</span>}
            </div>
            <p className="text-xs" style={{ color: '#CFE0F2' }}>{data.summary}</p>
            <QuoteList title="Considerations" items={data.considerations} render={(x) => <>• {x}</>} />
            <QuoteList title="Questions to resolve" items={data.questions_to_resolve} render={(x) => <>• {x}</>} />
            <QuoteList title="Cautions" items={data.cautions} render={(x) => <span style={{ color: '#FFD27A' }}>• {x}</span>} />
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Cheminformatics + Structure panel (RUO) ───────────────────────────────────
function ChemPanel() {
  const [smiles, setSmiles] = useState('CC(=O)OC1=CC=CC=C1C(=O)O'); // aspirin
  const [props, setProps] = useState<any>(null);
  const [pErr, setPErr] = useState(''); const [pBusy, setPBusy] = useState(false);
  const [uniprot, setUniprot] = useState('P69905'); // human hemoglobin alpha
  const [struct, setStruct] = useState<any>(null);
  const [sErr, setSErr] = useState(''); const [sBusy, setSBusy] = useState(false);

  async function calc() {
    setPBusy(true); setPErr(''); setProps(null);
    try { setProps((await api.post<{ result: any }>('/elab-engine/properties', { smiles })).result); }
    catch (e: any) { setPErr(e.message ?? 'Failed'); } finally { setPBusy(false); }
  }
  async function lookup() {
    setSBusy(true); setSErr(''); setStruct(null);
    try { setStruct((await api.post<{ result: any }>('/elab-engine/structure', { uniprot })).result); }
    catch (e: any) { setSErr(e.message ?? 'Lookup failed (network or unknown accession)'); } finally { setSBusy(false); }
  }
  const Prop = ({ label, val }: { label: string; val: React.ReactNode }) => (
    <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-2xs uppercase" style={{ color: '#7C8DA6' }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: '#E8EEF6' }}>{val}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: '#E8EEF6' }}><Atom size={16} style={{ color: TEAL }} /> Molecular properties</h3>
        <p className="text-2xs mb-4" style={{ color: '#7C8DA6' }}>RUO · deterministic SMILES → formula / MW / Lipinski. No external call.</p>
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>SMILES</span>
          <input value={smiles} onChange={(e) => setSmiles(e.target.value)} className="px-2.5 py-2 rounded-lg text-sm font-mono outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
        </label>
        <button onClick={calc} disabled={pBusy} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
          {pBusy ? <Loader2 size={14} className="animate-spin" /> : <Atom size={14} />} Compute
        </button>
        {pErr && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{pErr}</p>}
        {props && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Prop label="Formula" val={props.formula} />
              <Prop label="MW" val={`${props.molecular_weight}`} />
              <Prop label="Heavy atoms" val={props.heavy_atom_count} />
              <Prop label="H-bond donors" val={props.h_bond_donors} />
              <Prop label="H-bond acc." val={props.h_bond_acceptors} />
              <Prop label="Rings" val={props.ring_count} />
            </div>
            <div className="px-3 py-2 rounded-lg" style={{ background: props.lipinski.violations === 0 ? 'rgba(0,230,118,0.08)' : 'rgba(255,179,0,0.08)', border: `1px solid ${props.lipinski.violations === 0 ? '#00E67640' : '#FFB30040'}` }}>
              <p className="text-xs font-bold" style={{ color: props.lipinski.violations === 0 ? '#00E676' : '#FFB300' }}>
                Lipinski Ro5: {props.lipinski.violations} violation(s)
              </p>
              <p className="text-2xs" style={{ color: '#7C8DA6' }}>{props.lipinski.note}</p>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard padding="lg">
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: '#E8EEF6' }}><FileSearch size={16} style={{ color: TEAL }} /> Protein structure (AlphaFold DB)</h3>
        <p className="text-2xs mb-4" style={{ color: '#7C8DA6' }}>RUO · snapshot lookup from EBI AlphaFold DB by UniProt accession (live network).</p>
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-2xs font-semibold uppercase tracking-wide" style={{ color: '#7C8DA6' }}>UniProt accession</span>
          <input value={uniprot} onChange={(e) => setUniprot(e.target.value)} className="px-2.5 py-2 rounded-lg text-sm font-mono outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,184,204,0.15)', color: '#E8EEF6' }} />
        </label>
        <button onClick={lookup} disabled={sBusy} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: TEAL, color: '#04121A' }}>
          {sBusy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />} Look up structure
        </button>
        {sErr && <p className="text-xs mt-3" style={{ color: '#FF6E8A' }}>{sErr}</p>}
        {struct && (
          <div className="mt-4 space-y-2 text-xs" style={{ color: '#CFE0F2' }}>
            <p className="text-sm font-bold" style={{ color: '#E8EEF6' }}>{struct.entry_id}</p>
            {struct.description && <p>{struct.description}</p>}
            <p style={{ color: '#7C8DA6' }}>{struct.gene && <>Gene {struct.gene} · </>}{struct.organism}{struct.sequence_length && <> · {struct.sequence_length} aa</>}{struct.model_version && <> · v{struct.model_version}</>}</p>
            <div className="flex gap-3 pt-1">
              {struct.pdb_url && <a href={struct.pdb_url} target="_blank" rel="noreferrer" style={{ color: TEAL }}>PDB model ↗</a>}
              {struct.cif_url && <a href={struct.cif_url} target="_blank" rel="noreferrer" style={{ color: TEAL }}>mmCIF ↗</a>}
            </div>
            {struct.pae_image_url && <img src={struct.pae_image_url} alt="PAE" className="rounded-lg mt-2" style={{ maxWidth: 200, border: '1px solid rgba(255,255,255,0.1)' }} />}
            <p className="text-2xs pt-1" style={{ color: '#54657C' }}>snapshot_only_external · {struct.source}</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ELab() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [tab, setTab] = useState<'clinical' | 'dock' | 'sim' | 'chem' | 'nlp' | 'report' | 'opinion'>('clinical');

  async function refresh() {
    try { setStatus(await api.get<MfaStatus>('/elab-engine/mfa/status')); }
    catch { setStatus({ enrolled: false, unlocked: false }); }
  }
  useEffect(() => { refresh(); }, []);

  async function lock() {
    try { await api.post('/elab-engine/mfa/lock', {}); } catch { /* ignore */ }
    refresh();
  }

  if (!status) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" style={{ color: TEAL }} /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Header locked={!status.unlocked} onLock={status.unlocked ? lock : undefined} />
      <AnimatePresence mode="wait">
        {!status.unlocked ? (
          <motion.div key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MfaGate status={status} onUnlocked={refresh} />
          </motion.div>
        ) : (
          <motion.div key="console" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex gap-2 mb-5 flex-wrap">
              {([['clinical', 'Drug Combination'], ['dock', 'Docking (RUO)'], ['sim', 'Simulation (RUO)'], ['chem', 'Cheminformatics (RUO)'], ['opinion', 'Second Opinion'], ['nlp', 'Med NLP'], ['report', 'Reporting']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={tab === k
                    ? { background: 'rgba(0,184,204,0.14)', color: TEAL, border: '1px solid rgba(0,184,204,0.35)' }
                    : { color: '#7C8DA6', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'clinical' ? <ClinicalPanel /> : tab === 'dock' ? <DockingPanel /> : tab === 'sim' ? <SimulationPanel />
              : tab === 'chem' ? <ChemPanel /> : tab === 'opinion' ? <SecondOpinionPanel /> : tab === 'nlp' ? <NlpPanel /> : <ReportingPanel />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
