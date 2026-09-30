import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Cpu, CheckCircle, XCircle, Clock, ChevronDown } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface Skill {
  name: string;
  description: string;
  stats: { invocations: number; avg_latency: number; success_rate: number };
}

const DOMAIN_MAP: Record<string, string> = {
  'anuclaw-bio':      'Bioinformatics',
  'anuclaw-chem':     'Chemistry',
  'anuclaw-clinical': 'Clinical',
  'anuclaw-drug':     'Drug Discovery',
  'anuclaw-ehr':      'EHR / PMR',
  'anuclaw-genomic':  'Genomics',
  'anuclaw-imaging':  'Imaging',
  'anuclaw-immuno':   'Immunology',
  'anuclaw-lit':      'Literature',
  'anuclaw-neuro':    'Neuroscience',
  'anuclaw-onco':     'Oncology',
  'anuclaw-path':     'Pathology',
  'anuclaw-pharma':   'Pharmacology',
  'anuclaw-proteom':  'Proteomics',
  'anuclaw-pubmed':   'PubMed',
  'anuclaw-radio':    'Radiology',
  'anuclaw-stats':    'Statistics',
  'anuclaw-sys':      'System',
  'anuclaw-util':     'Utilities',
};

const DOMAIN_COLORS: Record<string, string> = {
  'EHR / PMR': '#00C878', 'Clinical': '#00B8CC', 'Genomics': '#9C27B0',
  'Oncology': '#FF6D00', 'Imaging': '#26C6DA', 'Drug Discovery': '#FFB300',
  'Bioinformatics': '#00E676', 'Pharmacology': '#CE93D8',
};

function getSkillDomain(name: string) {
  for (const prefix of Object.keys(DOMAIN_MAP)) {
    if (name.startsWith(prefix)) return DOMAIN_MAP[prefix];
  }
  return 'General';
}

const ALL = 'All';

export default function Skills() {
  const [search, setSearch]           = useState('');
  const [activeDomain, setActiveDomain] = useState<string>(ALL);
  const [expanded, setExpanded]       = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ skills: Skill[]; total: number }>({
    queryKey: ['skills'],
    queryFn: () => fetch('/api/skills', { credentials: 'include' }).then(r => r.json()),
    staleTime: 60_000,
  });

  const skills = data?.skills ?? [];
  const domainCounts = new Map<string, number>();
  for (const s of skills) {
    const d = getSkillDomain(s.name);
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const domains = [ALL, ...Array.from(domainCounts.keys()).sort()];

  const filtered = skills.filter(s => {
    const matchDomain = activeDomain === ALL || getSkillDomain(s.name) === activeDomain;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
                        s.description.toLowerCase().includes(search.toLowerCase());
    return matchDomain && matchSearch;
  });

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>Skills</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{data?.total ?? 0} domain skills loaded</p>
        </div>
      </motion.div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search skills…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-med"
        style={{ maxWidth: 340 }}
        aria-label="Search skills"
      />

      {/* Domain chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by domain">
        {domains.map(d => {
          const active = activeDomain === d;
          const color = DOMAIN_COLORS[d] ?? '#00B8CC';
          return (
            <button
              key={d}
              onClick={() => setActiveDomain(d)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200"
              style={{
                background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                color:      active ? color : 'var(--text-muted)',
                border:     `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
              }}
              aria-pressed={active}
            >
              {d}
              {d !== ALL && <span className="ml-1 opacity-60">({domainCounts.get(d)})</span>}
            </button>
          );
        })}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} skills shown</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel h-28 rounded-xl" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
          <Cpu size={32} className="mx-auto mb-2 opacity-30" />
          <p>No skills match — <button className="underline" onClick={() => { setSearch(''); setActiveDomain(ALL); }}>clear filters</button></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((skill, i) => (
              <motion.div
                key={skill.name}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
              >
                <SkillCard
                  skill={skill}
                  domain={getSkillDomain(skill.name)}
                  onClick={() => setExpanded(expanded === skill.name ? null : skill.name)}
                  isExpanded={expanded === skill.name}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill, domain, onClick, isExpanded }: {
  skill: Skill; domain: string; onClick: () => void; isExpanded: boolean;
}) {
  const successPct  = Math.round(skill.stats.success_rate * 100);
  const successColor = successPct >= 95 ? '#00C878' : successPct >= 80 ? '#FFB300' : '#FF1744';
  const domainColor  = DOMAIN_COLORS[domain] ?? '#00B8CC';

  return (
    <button
      onClick={onClick}
      className="glass glass-hover text-left w-full flex flex-col gap-3 p-4 relative overflow-hidden"
      style={{ border: isExpanded ? `1px solid ${domainColor}40` : undefined }}
      aria-expanded={isExpanded}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${domainColor}, transparent)`, opacity: isExpanded ? 1 : 0.4 }}
      />

      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-xs font-medium leading-tight" style={{ color: domainColor }}>
          {skill.name}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-3xs font-medium"
            style={{ background: `${domainColor}18`, color: domainColor, border: `1px solid ${domainColor}30` }}>
            {domain}
          </span>
          <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {skill.description && (
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {skill.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><Cpu size={11} />{skill.stats.invocations.toLocaleString()}</span>
        <span className="flex items-center gap-1"><Clock size={11} />{skill.stats.avg_latency}ms</span>
        <span className="flex items-center gap-1 ml-auto" style={{ color: successColor }}>
          {successPct >= 80 ? <CheckCircle size={11} /> : <XCircle size={11} />}
          {successPct}%
        </span>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <ErrorBoundary label="Skill stats failed">
                <SkillDetailInline skillName={skill.name} />
              </ErrorBoundary>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

function SkillDetailInline({ skillName }: { skillName: string }) {
  const { data } = useQuery({
    queryKey: ['skill-stats', skillName],
    queryFn: () => fetch(`/api/skills/${encodeURIComponent(skillName)}/stats`, { credentials: 'include' }).then(r => r.json()),
    staleTime: 30_000,
  });

  if (!data) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading stats…</p>;

  return (
    <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
      {[
        ['Total calls', (data.overall?.total ?? 0).toLocaleString()],
        ['Avg latency', `${data.overall?.avg_ms ?? 0} ms`],
        ['p99 latency', `${data.overall?.max_ms ?? 0} ms`],
        ['Failures',    String(data.overall?.failures ?? 0)],
      ].map(([label, val]) => (
        <React.Fragment key={label as string}>
          <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
          <dd className="font-mono text-right" style={{ color: '#E8EEF6' }}>{val}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
