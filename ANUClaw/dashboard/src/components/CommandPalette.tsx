import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LayoutDashboard, MessageSquare, Cpu, GitBranch, CalendarClock, Radio, ShieldCheck, Users, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard',     description: 'KPI overview & live activity stream', icon: <LayoutDashboard size={15} />, path: '/' },
  { label: 'Conversations', description: 'Browse all conversation groups',        icon: <MessageSquare size={15} />,  path: '/conversations' },
  { label: 'Skills',        description: '1,100+ domain skills with analytics',   icon: <Cpu size={15} />,            path: '/skills' },
  { label: 'Hooks',         description: 'Hook config & event stream',            icon: <GitBranch size={15} />,      path: '/hooks' },
  { label: 'Tasks',         description: 'Scheduled tasks & cron automation',     icon: <CalendarClock size={15} />,  path: '/tasks' },
  { label: 'Channels',      description: '14-channel real-time status board',     icon: <Radio size={15} />,          path: '/channels' },
  { label: 'Audit',         description: 'Filterable audit trail & HMAC export',  icon: <ShieldCheck size={15} />,    path: '/audit' },
  { label: 'Users',         description: 'RBAC user management',                  icon: <Users size={15} />,          path: '/users' },
  { label: 'Settings',      description: 'Provider, memory, SOUL, channels',      icon: <Settings size={15} />,      path: '/settings' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery]     = useState('');
  const [focused, setFocused] = useState(0);
  const navigate  = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);

  const filtered = NAV_ITEMS.filter(
    item => !query || item.label.toLowerCase().includes(query.toLowerCase()) ||
            (item.description ?? '').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open) { setQuery(''); setFocused(0); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  function select(item: (typeof NAV_ITEMS)[0]) { navigate(item.path); onClose(); }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter')     { if (filtered[focused]) select(filtered[focused]); }
    if (e.key === 'Escape')    { onClose(); }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
          role="dialog" aria-modal aria-label="Command palette">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-lg overflow-hidden glass"
            style={{ padding: 0 }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <Search size={15} style={{ color: 'var(--text-muted)' }} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setFocused(0); }}
                onKeyDown={onKeyDown}
                placeholder="Jump to page or action…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: '#E8EEF6' }}
                aria-label="Command palette search"
              />
              <kbd className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Esc
              </kbd>
            </div>

            {/* Results */}
            <ul className="py-1.5 max-h-72 overflow-y-auto" role="listbox">
              {filtered.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>No results</li>
              )}
              {filtered.map((item, i) => (
                <li key={item.path}>
                  <button
                    onClick={() => select(item)}
                    onMouseEnter={() => setFocused(i)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                    style={{
                      background: i === focused ? 'rgba(0,184,204,0.08)' : 'transparent',
                      borderLeft: i === focused ? '2px solid #00B8CC' : '2px solid transparent',
                    }}
                    role="option"
                    aria-selected={i === focused}
                  >
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: i === focused ? 'rgba(0,184,204,0.12)' : 'rgba(255,255,255,0.04)', color: i === focused ? '#00D4EB' : 'var(--text-muted)' }}>
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#E8EEF6' }}>{item.label}</p>
                      {item.description && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* Footer hints */}
            <div className="px-4 py-2.5 flex gap-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> select</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
