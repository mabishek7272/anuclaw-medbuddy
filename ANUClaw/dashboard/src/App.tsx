import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MessageSquare, Cpu, GitBranch, CalendarClock,
  Radio, ShieldCheck, Users, Settings, LogOut, Search, Sun, Moon,
  Activity, Bell, Key, FlaskConical, Workflow, Stethoscope,
} from 'lucide-react';
import { useTheme } from './lib/theme';
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ECGPulse } from './components/ECGLine';

const Home          = lazy(() => import('./pages/Home'));
const Conversations = lazy(() => import('./pages/Conversations'));
const Skills        = lazy(() => import('./pages/Skills'));
const Hooks         = lazy(() => import('./pages/Hooks'));
const Tasks         = lazy(() => import('./pages/Tasks'));
const Channels      = lazy(() => import('./pages/Channels'));
const Audit         = lazy(() => import('./pages/Audit'));
const UsersMgmt     = lazy(() => import('./pages/Users'));
const SettingsPage  = lazy(() => import('./pages/Settings'));
const Login         = lazy(() => import('./pages/Login'));
const Welcome       = lazy(() => import('./pages/Welcome'));
const ApiKeys       = lazy(() => import('./pages/ApiKeys'));
const ELab          = lazy(() => import('./pages/ELab'));
const Pipelines     = lazy(() => import('./pages/Pipelines'));
const PatientsPage  = lazy(() => import('./pages/Patients'));
const CDS           = lazy(() => import('./pages/CDS'));

const NAV = [
  { to: '/',              label: 'Dashboard',     Icon: LayoutDashboard, end: true },
  { to: '/conversations', label: 'Conversations', Icon: MessageSquare },
  { to: '/patients',      label: 'Patients',      Icon: Users },
  { to: '/cds',           label: 'CDS',           Icon: Stethoscope },
  { to: '/pipelines',     label: 'Pipelines',     Icon: Workflow },
  { to: '/elab',          label: 'E-LAB',         Icon: FlaskConical },
  { to: '/skills',        label: 'Skills',        Icon: Cpu },
  { to: '/hooks',         label: 'Hooks',         Icon: GitBranch },
  { to: '/tasks',         label: 'Tasks',         Icon: CalendarClock },
  { to: '/channels',      label: 'Channels',      Icon: Radio },
  { to: '/audit',         label: 'Audit',         Icon: ShieldCheck },
  { to: '/users',         label: 'Users',         Icon: Users },
  { to: '/api-keys',      label: 'API Keys',      Icon: Key },
  { to: '/settings',      label: 'Settings',      Icon: Settings },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const [cmdOpen, setCmdOpen]     = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const location = useLocation();

  // ⌘K command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(v => !v); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pulse live indicator
  useEffect(() => {
    const id = setInterval(() => { setLiveActive(true); setTimeout(() => setLiveActive(false), 800); }, 3500);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }

  return (
    <div className="flex h-screen overflow-hidden relative z-10">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col relative"
        style={{
          background: 'linear-gradient(180deg, #060D1A 0%, #040910 100%)',
          borderRight: '1px solid rgba(0,184,204,0.1)',
          zIndex: 20,
        }}
      >
        {/* Logo area */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(0,184,204,0.08)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <img
                src="/logo.png"
                alt="ANUClaw Logo"
                className="w-12 h-12 rounded-xl object-cover"
                style={{ filter: 'drop-shadow(0 0 8px rgba(0,200,200,0.4))' }}
              />
              {/* Glow ring */}
              <div
                className="absolute inset-0 rounded-xl animate-pulse-slow"
                style={{ boxShadow: '0 0 12px rgba(0,184,204,0.35)', border: '1px solid rgba(0,184,204,0.2)' }}
              />
            </div>
            <div>
              <p className="font-bold text-base tracking-wide" style={{ color: '#E8EEF6', letterSpacing: '0.05em' }}>ANUClaw</p>
              <p className="text-2xs font-medium" style={{ color: '#00B8CC', letterSpacing: '0.08em' }}>AMGI RESEARCH</p>
            </div>
          </motion.div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5" aria-label="Main navigation">
          {NAV.map(({ to, label, Icon, end }, i) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 + 0.1 }}
            >
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `nav-med${isActive ? ' active' : ''}`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        {/* System status strip */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(0,184,204,0.08)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full dot-online" />
            <span className="text-3xs font-medium" style={{ color: '#00E676', letterSpacing: '0.06em' }}>SYSTEM ONLINE</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all duration-200"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#FF1744'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,23,68,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            aria-label="Sign out"
          >
            <LogOut size={14} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Global Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="shrink-0 flex items-center gap-4 px-6 py-3 relative z-10"
          style={{
            background: 'rgba(5,10,18,0.85)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0,184,204,0.1)',
          }}
        >
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(0,184,204,0.12)',
              color: 'var(--text-muted)',
              minWidth: 220,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,184,204,0.3)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,184,204,0.12)'; }}
            aria-label="Open command palette"
          >
            <Search size={14} aria-hidden />
            <span>Search or jump to…</span>
            <kbd className="ml-auto text-3xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Live ECG indicator */}
            <div className="flex items-center gap-2">
              <ECGPulse color="#00D4EB" />
              <span
                className="text-3xs font-semibold tracking-widest uppercase"
                style={{ color: liveActive ? '#00D4EB' : '#007A8C', transition: 'color 0.3s', letterSpacing: '0.1em' }}
              >
                Live
              </span>
            </div>

            {/* Theme */}
            <button
              onClick={toggle}
              className="btn-ghost-med p-2 rounded-lg"
              aria-label="Toggle theme"
              data-tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </motion.header>

        {/* Page */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: 'transparent' }}
          id="main-content"
          tabIndex={-1}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="p-6 min-h-full"
            >
              <ErrorBoundary label="Page failed to load">
                <Suspense fallback={<MedPageSkeleton />}>
                  {children}
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

function MedPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skel h-7 w-40 rounded-lg" />
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({length: 6}).map((_,i) => (
          <div key={i} className="skel h-28 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="skel col-span-2 h-64 rounded-xl" />
        <div className="skel h-64 rounded-xl" />
      </div>
    </div>
  );
}

function TermsGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user) {
          navigate('/login', { replace: true });
        } else if (!data.user.terms_accepted_at) {
          navigate('/welcome', { replace: true });
        }
        setChecked(true);
      })
      .catch(() => { setChecked(true); });
  }, []);

  if (!checked) return null;
  return <>{children}</>;
}

export default function App() {
  useTheme();
  return (
    <Routes>
      <Route path="/login"   element={<Suspense fallback={null}><Login /></Suspense>} />
      <Route path="/welcome" element={<Suspense fallback={null}><Welcome /></Suspense>} />
      <Route path="/*" element={
        <TermsGuard>
          <Shell>
            <Routes>
              <Route index                  element={<Home />} />
              <Route path="conversations/*" element={<Conversations />} />
              <Route path="skills"          element={<Skills />} />
              <Route path="hooks"           element={<Hooks />} />
              <Route path="tasks"           element={<Tasks />} />
              <Route path="channels"        element={<Channels />} />
              <Route path="audit"           element={<Audit />} />
              <Route path="users"           element={<UsersMgmt />} />
              <Route path="api-keys"        element={<ApiKeys />} />
              <Route path="elab"            element={<ELab />} />
              <Route path="pipelines"       element={<Pipelines />} />
              <Route path="patients"        element={<PatientsPage />} />
              <Route path="cds"             element={<CDS />} />
              <Route path="settings"        element={<SettingsPage />} />
              <Route path="*"               element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        </TermsGuard>
      } />
    </Routes>
  );
}
