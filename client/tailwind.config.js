/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['"Space Grotesk"', 'sans-serif'],
      },
      colors: {
        obsidian: {
          DEFAULT: '#07080d',
          50: '#161822',
          100: '#12141c',
          200: '#0e1017',
          300: '#0b0c12',
          400: '#07080d',
          card: 'rgba(18, 20, 30, 0.7)',
          glass: 'rgba(255, 255, 255, 0.03)',
        },
        cinema: {
          border: 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(255, 255, 255, 0.16)',
          'border-active': 'rgba(99, 102, 241, 0.4)',
          glow: 'rgba(99, 102, 241, 0.15)',
        },
        background: '#07080d',
        surface: '#0d0f17',
        'surface-hover': '#141724',
        'surface-card': '#11131f',
        border: 'rgba(255, 255, 255, 0.08)',
        'border-subtle': 'rgba(255, 255, 255, 0.04)',
        muted: '#71717a',
        'muted-light': '#94a3b8',
      },
      boxShadow: {
        'glass-glow': '0 0 25px -5px rgba(99, 102, 241, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.45), inset 0 1px 1px 0 rgba(255, 255, 255, 0.06)',
        'emerald-glow': '0 0 20px -3px rgba(16, 185, 129, 0.35)',
        'purple-glow': '0 0 25px -3px rgba(168, 85, 247, 0.35)',
        'deck-glow': '0 12px 40px -10px rgba(0, 0, 0, 0.7), 0 0 20px -5px rgba(99, 102, 241, 0.2)',
      },
      animation: {
        'float-up': 'floatUp 2.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'blink': 'blink 1s step-start infinite',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'ripple': 'ripple 0.6s linear',
        'speaking-wave': 'speakingWave 1.2s infinite ease-in-out',
      },
      keyframes: {
        floatUp: {
          '0%': { opacity: '0', transform: 'translateY(15px) scale(0.7)' },
          '15%': { opacity: '1', transform: 'translateY(0px) scale(1.1)' },
          '80%': { opacity: '1', transform: 'translateY(-100px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-150px) scale(0.8)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0%)' },
        },
        slideDown: {
          '0%': { opacity: '1', transform: 'translateY(0%)' },
          '100%': { opacity: '0', transform: 'translateY(100%)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        speakingWave: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        }
      }
    },
  },
  plugins: [],
}
