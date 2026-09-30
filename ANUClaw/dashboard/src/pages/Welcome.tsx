import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Cpu, Shield, Globe, Brain, Activity, Lock, CheckCircle,
  ChevronRight, Dna, Zap, Users, Server,
} from 'lucide-react';
import { ECGLine } from '../components/ECGLine';

const CAPABILITIES = [
  {
    icon: <Cpu size={22} />, color: '#00B8CC',
    title: '1,100+ Domain Skills',
    desc: 'Medical, legal, finance, genomics, oncology, radiology, pharmacology and more — all accessible via natural language.',
  },
  {
    icon: <Globe size={22} />, color: '#00C878',
    title: '14 Messaging Channels',
    desc: 'WhatsApp, Telegram, Discord, Slack, Signal, Gmail, Matrix and 7 more — one unified AI across every platform.',
  },
  {
    icon: <Brain size={22} />, color: '#9C27B0',
    title: 'Dual-Layer Memory',
    desc: 'AGENTS.md + SQLite structured facts. The assistant remembers patients, cases and context across sessions.',
  },
  {
    icon: <Shield size={22} />, color: '#FFB300',
    title: 'Medical-Grade Security',
    desc: 'HMAC-signed audit logs, RBAC with 5 roles, HTTP-only JWT cookies, and country-scoped patient UIDs.',
  },
  {
    icon: <Dna size={22} />, color: '#00D4EB',
    title: 'AMGI Research Platform',
    desc: 'Purpose-built for Abi and Anu Research Initiative. Operates within ethical and compliance boundaries by design.',
  },
  {
    icon: <Zap size={22} />, color: '#FF6D00',
    title: 'Hook Engine',
    desc: '5 lifecycle hooks — BeforeMessage, BeforeLLMCall, BeforeToolCall, AfterToolCall, AfterMessage — for full control.',
  },
];

const TERMS = [
  'This platform processes sensitive medical and research data. You agree to use it only for authorised research and clinical purposes.',
  'All activity is logged and cryptographically signed. Audit trails are retained and may be reviewed by compliance officers.',
  'Patient UIDs (AMGI-CC-YYYY-NNNNNNN) are issued exclusively through EHR/PMR skills and must not be manually constructed.',
  'API keys generated on this platform carry your identity. You are responsible for all actions made with your keys.',
  'Do not share credentials or API keys. Report any suspected compromise to the AMGI security team immediately.',
  'Use of this system constitutes acceptance of AMGI\'s data governance and acceptable use policies.',
];

export default function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'terms'>('intro');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      fetch('/auth/accept-terms', { method: 'POST', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => navigate('/', { replace: true }),
  });

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Radial bg */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 90% 60% at 50% -10%, rgba(0,184,204,0.10) 0%, transparent 65%), radial-gradient(ellipse 60% 40% at 80% 90%, rgba(0,200,120,0.05) 0%, transparent 55%)',
      }} />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="inline-block relative mb-6"
          >
            <img
              src="/logo.png"
              alt="ANUClaw"
              className="w-24 h-24 mx-auto rounded-2xl object-cover"
              style={{ filter: 'drop-shadow(0 0 24px rgba(0,184,204,0.6))' }}
            />
            <div className="absolute inset-0 rounded-2xl animate-pulse"
              style={{ boxShadow: '0 0 40px rgba(0,184,204,0.2)', border: '1px solid rgba(0,184,204,0.25)' }} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold tracking-tight mb-2"
            style={{ color: '#E8EEF6' }}
          >
            Welcome to ANUClaw
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="text-base font-medium tracking-widest uppercase"
            style={{ color: '#00B8CC', letterSpacing: '0.15em' }}
          >
            AMGI Research Initiative · Unified AI Platform
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex justify-center mt-5"
          >
            <ECGLine width={160} height={48} color="#00D4EB" />
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === 'intro' ? (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-8"
            >
              {/* Intro text */}
              <div className="glass p-6 text-center space-y-3">
                <p className="text-lg font-semibold" style={{ color: '#E8EEF6' }}>
                  Before you begin, take a moment to understand what you're accessing.
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  ANUClaw is a medical-grade AI research and clinical assistant platform with over 1,100 domain skills,
                  real-time messaging across 14 channels, and a full audit trail. It is designed for authorised AMGI
                  research staff and approved clinical teams only.
                </p>
              </div>

              {/* Capability cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {CAPABILITIES.map(({ icon, color, title, desc }, i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 + 0.2, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    className="glass p-5 flex flex-col gap-3 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-[2px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                      {icon}
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1" style={{ color: '#E8EEF6' }}>{title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex justify-center"
              >
                <button
                  onClick={() => setStep('terms')}
                  className="btn-med flex items-center gap-3 px-8 py-3 text-base"
                >
                  Continue to Terms
                  <ChevronRight size={18} />
                </button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="terms"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-6"
            >
              <div className="glass p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Shield size={20} style={{ color: '#00B8CC' }} />
                  <h2 className="font-bold text-base" style={{ color: '#E8EEF6' }}>Acceptable Use & Data Governance</h2>
                </div>

                {/* Scrollable terms */}
                <div
                  className="rounded-xl p-5 space-y-4 max-h-72 overflow-y-auto"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)' }}
                  onScroll={e => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setScrolled(true); }}
                >
                  {TERMS.map((t, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3"
                    >
                      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                        style={{ background: 'rgba(0,184,204,0.12)', color: '#00B8CC', border: '1px solid rgba(0,184,204,0.2)', minWidth: 20 }}>
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: '#C8D8E8' }}>{t}</p>
                    </motion.div>
                  ))}
                </div>
                {!scrolled && (
                  <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                    Scroll to read all terms before accepting
                  </p>
                )}
              </div>

              {/* Checkbox + Accept */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: scrolled ? 1 : 0.4 }}
                transition={{ duration: 0.4 }}
                className="glass p-5 space-y-5"
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => scrolled && setChecked(v => !v)}
                    className="w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      borderColor: checked ? '#00B8CC' : 'rgba(255,255,255,0.2)',
                      background: checked ? '#00B8CC' : 'transparent',
                    }}
                  >
                    {checked && <CheckCircle size={13} style={{ color: '#fff' }} />}
                  </div>
                  <p className="text-sm" style={{ color: '#E8EEF6' }}>
                    I have read and understand the acceptable use policy. I confirm I am an authorised AMGI
                    research or clinical team member and will use ANUClaw only for approved purposes.
                  </p>
                </label>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setStep('intro')}
                    className="btn-ghost-med px-4 py-2 text-sm"
                  >
                    ← Back
                  </button>
                  <button
                    disabled={!checked || accept.isPending}
                    onClick={() => accept.mutate()}
                    className="btn-med flex items-center gap-2 px-8 py-3 text-base ml-auto"
                    style={{ opacity: checked ? 1 : 0.4, cursor: checked ? 'pointer' : 'not-allowed' }}
                  >
                    {accept.isPending ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Activating…
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Accept & Enter Dashboard
                      </>
                    )}
                  </button>
                </div>
                {accept.isError && (
                  <p className="text-xs text-center" style={{ color: '#FF1744' }}>
                    Failed to save. Please try again.
                  </p>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-xs mt-10"
          style={{ color: 'var(--text-dim)' }}
        >
          ANUClaw · AMGI Research Initiative · All activity is cryptographically audited
        </motion.p>
      </div>
    </div>
  );
}
