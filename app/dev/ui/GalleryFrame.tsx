'use client'

import { type ReactNode } from 'react'

const PANELS: Array<{
  theme: 'light' | 'dark'
  density: 'comfortable' | 'compact'
  label: string
}> = [
  { theme: 'light', density: 'comfortable', label: 'Light · Comfortable' },
  { theme: 'light', density: 'compact', label: 'Light · Compact' },
  { theme: 'dark', density: 'comfortable', label: 'Dark · Comfortable' },
  { theme: 'dark', density: 'compact', label: 'Dark · Compact' },
]

/**
 * The theme × density harness. Renders its children four times, each panel
 * carrying data-theme / data-density so every combination shows side-by-side.
 * Each panel paints its own surface/text from the semantic tokens so the dark
 * panels render dark.
 */
export function GalleryFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-base p-6">
      <header className="mb-6">
        <div className="font-text text-[12px] font-semibold uppercase tracking-[0.24em] text-action-primary mb-2">
          Components · Phase 0b · Wave 1
        </div>
        <h1 className="font-display text-[32px] leading-none text-body">
          Forms — component gallery
        </h1>
        <p className="mt-3 max-w-[66ch] font-text text-[15px] leading-relaxed text-muted">
          Dev-only showroom. Every Wave-1 form primitive rendered in all states
          across the four theme × density combinations. Not linked from any
          staff navigation; 404s in a production build.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {PANELS.map((panel) => (
          <section
            key={panel.label}
            data-theme={panel.theme}
            data-density={panel.density}
            className="rounded-[14px] border border-default bg-surface-base p-5 text-body shadow-sm"
            style={{
              background: 'var(--surface-base)',
              color: 'var(--text-body)',
            }}
          >
            <div className="mb-4 font-text text-[11px] font-semibold uppercase tracking-[0.13em] text-subtle">
              {panel.label}
            </div>
            {children}
          </section>
        ))}
      </div>
    </div>
  )
}
