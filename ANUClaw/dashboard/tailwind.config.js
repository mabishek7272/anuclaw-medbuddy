/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        med: {
          950: '#030812',
          900: '#060D1A',
          850: '#091221',
          800: '#0D1A2D',
          750: '#112238',
          700: '#162A44',
          600: '#1E3A5F',
          500: '#1A4B6E',
        },
        teal: {
          950: '#001A1F',
          900: '#003640',
          700: '#007A8C',
          600: '#009AAF',
          500: '#00B8CC',
          400: '#00D4EB',
          300: '#33DDEF',
          200: '#66E8F5',
          100: '#CCFAFE',
        },
        chrome: {
          900: '#607D8B',
          700: '#90A4AE',
          500: '#B0BEC5',
          300: '#CFD8DC',
          100: '#ECEFF1',
        },
        dna: {
          green: '#00C878',
          teal:  '#00D4EB',
          blue:  '#1565C0',
        },
        status: {
          online:  '#00E676',
          warn:    '#FFB300',
          danger:  '#FF1744',
          offline: '#546E7A',
        },
      },
      fontFamily: {
        ui:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4' }],
        '3xs': ['10px', { lineHeight: '1.3' }],
      },
      backgroundImage: {
        'med-gradient': 'radial-gradient(ellipse 120% 80% at 15% -10%, rgba(0,180,200,0.08) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 85% 100%, rgba(0,100,180,0.06) 0%, transparent 55%)',
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        'teal-glow': 'radial-gradient(circle at center, rgba(0,184,204,0.15) 0%, transparent 70%)',
        'sidebar-gradient': 'linear-gradient(180deg, #060D1A 0%, #030812 100%)',
      },
      boxShadow: {
        'glass':     '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg':  '0 8px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        'teal-glow': '0 0 20px rgba(0,184,204,0.25), 0 0 60px rgba(0,184,204,0.1)',
        'teal-sm':   '0 0 10px rgba(0,184,204,0.3)',
        'inner-teal':'inset 0 0 20px rgba(0,184,204,0.05)',
        'kpi':       '0 2px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,184,204,0.08)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'glow-pulse':   'glowPulse 2s ease-in-out infinite',
        'ecg':          'ecgDraw 2.5s linear infinite',
        'float':        'float 6s ease-in-out infinite',
        'scan-line':    'scanLine 4s linear infinite',
        'data-in':      'dataIn 0.5s ease-out forwards',
        'count-in':     'countIn 0.4s ease-out forwards',
        'slide-in-left':'slideInLeft 0.4s ease-out forwards',
        'fade-up':      'fadeUp 0.5s ease-out forwards',
        'shimmer':      'shimmer 2s linear infinite',
        'rotate-slow':  'rotate 20s linear infinite',
        'border-flow':  'borderFlow 3s linear infinite',
      },
      keyframes: {
        glowPulse: {
          '0%,100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':     { opacity: '1',   transform: 'scale(1.05)' },
        },
        ecgDraw: {
          '0%':   { strokeDashoffset: '600' },
          '100%': { strokeDashoffset: '0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        dataIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        countIn: {
          '0%':   { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        borderFlow: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};
