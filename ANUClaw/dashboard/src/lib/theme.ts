import { create } from 'zustand';

type Theme = 'dark' | 'light';

function getInitial(): Theme {
  const saved = localStorage.getItem('anuclaw-theme') as Theme | null;
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('anuclaw-theme', theme);
}

interface ThemeStore { theme: Theme; toggle: () => void; }

export const useTheme = create<ThemeStore>((set, get) => {
  const initial = getInitial();
  apply(initial);
  return {
    theme: initial,
    toggle: () => {
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
      apply(next);
      set({ theme: next });
    },
  };
});
