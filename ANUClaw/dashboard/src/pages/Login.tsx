import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';
import { ECGLine } from '../components/ECGLine';

export default function Login() {
  const [email, setEmail]       = useState('admin@anuclaw.local');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();
  useTheme();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed.'); return; }
      navigate('/', { replace: true });
    } catch {
      setError('Network error — is ANUClaw running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>
      {/* Background radial */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,184,204,0.08), transparent)',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="inline-block relative mb-4"
          >
            <img
              src="/logo.png"
              alt="ANUClaw"
              className="w-20 h-20 mx-auto rounded-2xl object-cover"
              style={{ filter: 'drop-shadow(0 0 16px rgba(0,184,204,0.5))' }}
            />
            <div className="absolute inset-0 rounded-2xl"
              style={{ boxShadow: '0 0 24px rgba(0,184,204,0.2)', border: '1px solid rgba(0,184,204,0.2)' }} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#E8EEF6' }}>ANUClaw</h1>
            <p className="text-sm mt-1 font-medium tracking-wide" style={{ color: '#00B8CC', letterSpacing: '0.1em' }}>AMGI RESEARCH INITIATIVE</p>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="flex justify-center mt-3">
            <ECGLine width={120} height={36} color="#00D4EB" />
          </motion.div>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="glass p-7"
        >
          <h2 className="text-base font-semibold mb-5" style={{ color: '#E8EEF6' }}>
            Sign in to control panel
          </h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              role="alert"
              className="mb-4 px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(255,23,68,0.08)', border: '1px solid rgba(255,23,68,0.25)', color: '#FF1744' }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                Email
              </label>
              <input
                id="email" type="email" required autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-med w-full"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                Password
              </label>
              <input
                id="password" type="password" required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-med w-full"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-med w-full justify-center text-center mt-2"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Authenticating…
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </motion.div>

        <p className="text-center mt-4 text-xs" style={{ color: 'var(--text-dim)' }}>
          Default: admin@anuclaw.local · Set your password in Users after first login.
        </p>
      </motion.div>
    </div>
  );
}
