import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('design-system: app/globals.css token variables', () => {
  // ── Token presence — one per namespace ──────────────────────────
  it('declares --mfs-navy', () => {
    expect(/--mfs-navy:\s*#16205B/.test(css)).toBe(true)
  })

  it('declares --mfs-orange', () => {
    expect(/--mfs-orange:\s*#EB6619/.test(css)).toBe(true)
  })

  it('declares --mfs-success', () => {
    expect(/--mfs-success:\s*#16A34A/.test(css)).toBe(true)
  })

  it('declares --mfs-neutral-500', () => {
    expect(/--mfs-neutral-500:\s*#5C5648/.test(css)).toBe(true)
  })

  it('declares --mfs-kds-bg', () => {
    expect(/--mfs-kds-bg:\s*#0F172A/.test(css)).toBe(true)
  })

  it('declares --mfs-space-4', () => {
    expect(/--mfs-space-4:\s*16px/.test(css)).toBe(true)
  })

  it('declares --mfs-container-2xl', () => {
    expect(/--mfs-container-2xl:\s*1440px/.test(css)).toBe(true)
  })

  it('declares --mfs-radius-md', () => {
    expect(/--mfs-radius-md:\s*8px/.test(css)).toBe(true)
  })

  it('declares --mfs-shadow-2 with one of the locked values', () => {
    expect(
      /--mfs-shadow-2:\s*0 1px 2px rgba\(22, 32, 91, 0\.05\)|--mfs-shadow-2:\s*0 2px 8px rgba\(22, 32, 91, 0\.08\)/.test(css),
    ).toBe(true)
  })

  it('declares --mfs-duration-fast', () => {
    expect(/--mfs-duration-fast:\s*150ms/.test(css)).toBe(true)
  })

  it('declares --mfs-ease-standard as a cubic-bezier', () => {
    expect(/--mfs-ease-standard:\s*cubic-bezier/.test(css)).toBe(true)
  })

  it('declares --text-display-size (mobile default)', () => {
    expect(/--text-display-size:\s*32px/.test(css)).toBe(true)
  })

  // ── Existing-rule preservation ──────────────────────────────────
  it('preserves --mfs-neutral (body background dependency)', () => {
    expect(/--mfs-neutral:\s*#EDEAE1/.test(css)).toBe(true)
  })

  it('preserves the Plus Jakarta @import', () => {
    expect(/Plus Jakarta/i.test(css)).toBe(true)
  })

  // ── Structural blocks ───────────────────────────────────────────
  it('declares an @media (min-width: 768px) block raising display size to 40px', () => {
    expect(
      /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[\s\S]*?--text-display-size:\s*40px[\s\S]*?\}/.test(css),
    ).toBe(true)
  })

  it('declares an @font-face for GTF Adieu', () => {
    expect(/@font-face\s*\{[\s\S]*?GTF Adieu[\s\S]*?\}/.test(css)).toBe(true)
  })
})
