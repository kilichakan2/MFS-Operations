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
        // ── Tier-2 SEMANTIC scale (for 0b components; named by purpose) ──
        surface: {
          base:    'var(--surface-base)',
          raised:  'var(--surface-raised)',
          sunken:  'var(--surface-sunken)',
          overlay: 'var(--surface-overlay)',
          inverse: 'var(--surface-inverse)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          strong:  'var(--border-strong)',
          subtle:  'var(--border-subtle)',
        },
        action: {
          primary:            'var(--action-primary)',
          'primary-hover':    'var(--action-primary-hover)',
          'primary-active':   'var(--action-primary-active)',
          'primary-disabled': 'var(--action-primary-disabled)',
          secondary:            'var(--action-secondary)',
          'secondary-hover':    'var(--action-secondary-hover)',
          'secondary-active':   'var(--action-secondary-active)',
          'secondary-disabled': 'var(--action-secondary-disabled)',
          'ghost-fg':     'var(--action-ghost-fg)',
          'ghost-border': 'var(--action-ghost-border)',
          danger:            'var(--action-danger)',
          'danger-hover':    'var(--action-danger-hover)',
          'danger-active':   'var(--action-danger-active)',
          'danger-disabled': 'var(--action-danger-disabled)',
          // Per-action-fill label colours (spec §6 — one blanket "on action"
          // colour can't serve an ink-label fill AND white-label fills).
          'primary-fg':   'var(--action-primary-fg)',
          'secondary-fg': 'var(--action-secondary-fg)',
          'danger-fg':    'var(--action-danger-fg)',
        },
        status: {
          'success-fill':   'var(--status-success-fill)',
          'success-soft':   'var(--status-success-soft)',
          'success-text':   'var(--status-success-text)',
          'success-border': 'var(--status-success-border)',
          'warning-fill':   'var(--status-warning-fill)',
          'warning-soft':   'var(--status-warning-soft)',
          'warning-text':   'var(--status-warning-text)',
          'warning-border': 'var(--status-warning-border)',
          'error-fill':   'var(--status-error-fill)',
          'error-soft':   'var(--status-error-soft)',
          'error-text':   'var(--status-error-text)',
          'error-border': 'var(--status-error-border)',
          'info-fill':   'var(--status-info-fill)',
          'info-soft':   'var(--status-info-soft)',
          'info-text':   'var(--status-info-text)',
          'info-border': 'var(--status-info-border)',
          'deviation-fill':   'var(--status-deviation-fill)',
          'deviation-soft':   'var(--status-deviation-soft)',
          'deviation-text':   'var(--status-deviation-text)',
          'deviation-border': 'var(--status-deviation-border)',
          'neutral-fill':   'var(--status-neutral-fill)',
          'neutral-soft':   'var(--status-neutral-soft)',
          'neutral-text':   'var(--status-neutral-text)',
          'neutral-border': 'var(--status-neutral-border)',
        },
        sync: {
          syncing: 'var(--sync-syncing)',
          stuck:   'var(--sync-stuck)',
          clear:   'var(--sync-clear)',
        },
        'focus-ring': 'var(--focus-ring)',

        // ── Tier-1 LEGACY brand names (retained so existing screens stay
        //    painted; retired screen-by-screen in Phase 1). Values now read
        //    the design tokens. Two need channel form for opacity modifiers. ──
        'mfs-navy':         'rgb(var(--mfs-navy-rgb) / <alpha-value>)',
        'mfs-orange':       'var(--mfs-orange-500)',
        'mfs-maroon':       'var(--mfs-maroon-500)',
        'mfs-red':          'var(--mfs-red-500)',
        'mfs-sand':         'var(--mfs-sand-500)',
        'mfs-soft-neutral': 'var(--mfs-soft-200)',
        'mfs-black':        'var(--mfs-ink-900)',
        // Functional (values shift to the new brand status hues)
        'mfs-success':      'var(--status-success-fill)',
        'mfs-warning':      'var(--status-warning-fill)',
        'mfs-danger':       'rgb(var(--mfs-danger-rgb) / <alpha-value>)',
        // Neutral scale → nearest warm neutral / semantic text
        'mfs-neutral-50':   'var(--mfs-soft-100)',
        'mfs-neutral-100':  'var(--mfs-soft-200)',
        'mfs-neutral-200':  'var(--mfs-soft-300)',
        'mfs-neutral-300':  'var(--mfs-soft-400)',
        'mfs-neutral-400':  'var(--mfs-ink-400)',
        'mfs-neutral-500':  'var(--text-muted)',
        'mfs-neutral-700':  'var(--text-body)',
        'mfs-neutral-900':  'var(--mfs-ink-900)',
        // KDS dark theme — keep literal hex (byte-identical; migrates in Phase 1)
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
      // ── Semantic TEXT colours (F-TD-40 fix) ─────────────────────────────
      // Dedicated theme key: entries here generate ONLY `text-*` utilities,
      // so they can never leak `bg-*`/`border-*` variants and never collide
      // with the fontSize namespace (guarded by
      // tests/unit/lint/tailwind-namespace-collision.test.ts).
      textColor: {
        heading: 'var(--text-heading)',
        body:    'var(--text-body)',
        muted:   'var(--text-muted)',
        subtle:  'var(--text-subtle)',
        inverse: 'var(--text-inverse)',
        link:    'var(--text-link)',
        icon:    'var(--icon-default)',
      },
      // ── Semantic BORDER colours (F-TD-40 border-namespace fix) ──────────
      // Lower-case `default` is a legal key (only upper-case DEFAULT is
      // special), so `border-default` compiles exactly as call sites spell it.
      borderColor: {
        default: 'var(--border-default)',
        // NO `strong` here: --border-strong is decorative-only at 1.8:1 (fails
        // the 3:1 outline bar, spec §5.4) — it keeps its token + bg-border-strong
        // (colors namespace) but gets no border-* outline utility.
        subtle:  'var(--border-subtle)',
        input:   'var(--border-input)',
      },
      fontFamily: {
        // Semantic aliases for 0b
        display: ['var(--font-display)'],
        text:    ['var(--font-text)'],
        // Legacy names retained → read the next/font variables
        'mfs-display': ['var(--font-display)'],
        'mfs-body':    ['var(--font-text)'],
        'mfs-mono':    ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display':  ['var(--text-display-size)',  { lineHeight: '1.1',  letterSpacing: '-0.01em' }],
        'h1':       ['var(--text-h1-size)',       { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'h2':       ['var(--text-h2-size)',       { lineHeight: '1.25', letterSpacing: '-0.005em' }],
        'h3':       ['var(--text-h3-size)',       { lineHeight: '1.3',  letterSpacing: '0' }],
        'body-lg':  ['var(--text-body-lg-size)',  { lineHeight: '1.5',  letterSpacing: '0' }],
        // `body-md` (was `body`): the bare name is reserved for the COLOUR
        // utility `text-body` — a shared key would re-open F-TD-40.
        'body-md':  ['var(--text-body-size)',     { lineHeight: '1.5',  letterSpacing: '0' }],
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
        // Semantic scale
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        // Legacy names retained
        'mfs-sm':   'var(--radius-sm)',
        'mfs-md':   'var(--radius-md)',
        'mfs-lg':   'var(--radius-lg)',
        'mfs-pill': 'var(--radius-pill)',
      },
      boxShadow: {
        // Semantic scale
        sm:     'var(--shadow-sm)',
        md:     'var(--shadow-md)',
        lg:     'var(--shadow-lg)',
        accent: 'var(--shadow-accent)',
        // Legacy names retained → nearest semantic shadow
        'mfs-0': 'none',
        'mfs-1': 'var(--shadow-sm)',
        'mfs-2': 'var(--shadow-md)',
        'mfs-3': 'var(--shadow-lg)',
        'mfs-4': 'var(--shadow-lg)',
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
