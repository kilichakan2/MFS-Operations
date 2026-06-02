import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette (verbatim from locked spec §1.1)
        'mfs-navy':         '#16205B',
        'mfs-orange':       '#EB6619',
        'mfs-maroon':       '#590129',
        'mfs-red':          '#FF3300',
        'mfs-sand':         '#C0946F',
        'mfs-soft-neutral': '#EDEAE1',
        'mfs-black':        '#1E1E1E',
        // Functional palette (locked spec §1.4)
        'mfs-success':      '#16A34A',
        'mfs-warning':      '#B45309',
        'mfs-danger':       '#FF3300',
        // Neutral scale (locked spec §1.5)
        'mfs-neutral-50':   '#FAF8F3',
        'mfs-neutral-100':  '#EDEAE1',
        'mfs-neutral-200':  '#DDD8CB',
        'mfs-neutral-300':  '#BFB8A8',
        'mfs-neutral-400':  '#928B7A',
        'mfs-neutral-500':  '#5C5648',
        'mfs-neutral-700':  '#3A352C',
        'mfs-neutral-900':  '#1E1E1E',
        // KDS dark theme (locked spec §1.6)
        'mfs-kds-bg':             '#0F172A',
        'mfs-kds-surface':        '#1E293B',
        'mfs-kds-surface-raised': '#334155',
        'mfs-kds-border':         '#475569',
        'mfs-kds-text':           '#F1F5F9',
        'mfs-kds-text-muted':     '#94A3B8',
        'mfs-kds-line-empty':     '#475569',
        'mfs-kds-line-done':      '#16A34A',
        'mfs-kds-accent':         '#EB6619',
      },
      fontFamily: {
        'mfs-display': ['GTF Adieu', 'Inter', 'system-ui', 'sans-serif'],
        'mfs-body':    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        'mfs-mono':    ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display':  ['var(--text-display-size)',  { lineHeight: '1.1',  letterSpacing: '-0.01em' }],
        'h1':       ['var(--text-h1-size)',       { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'h2':       ['var(--text-h2-size)',       { lineHeight: '1.25', letterSpacing: '-0.005em' }],
        'h3':       ['var(--text-h3-size)',       { lineHeight: '1.3',  letterSpacing: '0' }],
        'body-lg':  ['var(--text-body-lg-size)',  { lineHeight: '1.5',  letterSpacing: '0' }],
        'body':     ['var(--text-body-size)',     { lineHeight: '1.5',  letterSpacing: '0' }],
        'body-sm':  ['var(--text-body-sm-size)',  { lineHeight: '1.4',  letterSpacing: '0' }],
        'caption':  ['var(--text-caption-size)',  { lineHeight: '1.3',  letterSpacing: '0.05em' }],
        'mono':     ['var(--text-mono-size)',     { lineHeight: '1.4',  letterSpacing: '0' }],
      },
      maxWidth: {
        'mfs-sm':   '640px',
        'mfs-md':   '768px',
        'mfs-lg':   '1024px',
        'mfs-xl':   '1280px',
        'mfs-2xl':  '1440px',
        'mfs-full': '100%',
      },
      borderRadius: {
        'mfs-sm':   '4px',
        'mfs-md':   '8px',
        'mfs-lg':   '12px',
        'mfs-pill': '9999px',
      },
      boxShadow: {
        'mfs-0': 'none',
        'mfs-1': '0 1px 2px rgba(22, 32, 91, 0.05)',
        'mfs-2': '0 2px 8px rgba(22, 32, 91, 0.08)',
        'mfs-3': '0 8px 24px rgba(22, 32, 91, 0.12)',
        'mfs-4': '0 16px 48px rgba(22, 32, 91, 0.15)',
      },
      transitionDuration: {
        'instant': '80ms',
        'fast':    '150ms',
        'medium':  '250ms',
        'slow':    '400ms',
      },
      transitionTimingFunction: {
        'standard':   'cubic-bezier(0.4, 0, 0.2, 1)',
        'accelerate': 'cubic-bezier(0.4, 0, 1, 1)',
        'decelerate': 'cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
export default config
