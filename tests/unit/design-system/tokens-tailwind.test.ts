import { describe, expect, it } from 'vitest'
import tailwindConfig from '../../../tailwind.config'

describe('design-system: tailwind token extensions', () => {
  const extend = (tailwindConfig.theme as Record<string, unknown>)?.extend as Record<string, unknown>
  const colors = extend?.colors as Record<string, string>
  const fontFamily = extend?.fontFamily as Record<string, string[]>
  const fontSize = extend?.fontSize as Record<string, [string, { lineHeight: string; letterSpacing: string }]>
  const maxWidth = extend?.maxWidth as Record<string, string>
  const borderRadius = extend?.borderRadius as Record<string, string>
  const boxShadow = extend?.boxShadow as Record<string, string>
  const transitionDuration = extend?.transitionDuration as Record<string, string>
  const transitionTimingFunction = extend?.transitionTimingFunction as Record<string, string>

  it('exposes brand navy', () => {
    expect(colors['mfs-navy']).toBe('#16205B')
  })

  it('exposes brand orange', () => {
    expect(colors['mfs-orange']).toBe('#EB6619')
  })

  it('exposes functional success', () => {
    expect(colors['mfs-success']).toBe('#16A34A')
  })

  it('exposes neutral-500 from the warm scale', () => {
    expect(colors['mfs-neutral-500']).toBe('#5C5648')
  })

  it('exposes kds dark-theme background', () => {
    expect(colors['mfs-kds-bg']).toBe('#0F172A')
  })

  it('declares display font stack including GTF Adieu', () => {
    expect(fontFamily['mfs-display']).toContain('GTF Adieu')
  })

  it('declares body font stack including Inter', () => {
    expect(fontFamily['mfs-body']).toContain('Inter')
  })

  it('fontSize.display is a tuple referencing a css var', () => {
    const entry = fontSize['display']
    expect(Array.isArray(entry)).toBe(true)
    expect(typeof entry[0]).toBe('string')
    expect(entry[0].startsWith('var(--')).toBe(true)
  })

  it('exposes 2xl container max width', () => {
    expect(maxWidth['mfs-2xl']).toBe('1440px')
  })

  it('exposes md border radius', () => {
    expect(borderRadius['mfs-md']).toBe('8px')
  })

  it('exposes shadow level 2', () => {
    expect(boxShadow['mfs-2']).toBe('0 2px 8px rgba(22, 32, 91, 0.08)')
  })

  it('exposes fast transition duration', () => {
    expect(transitionDuration['fast']).toBe('150ms')
  })

  it('exposes standard cubic-bezier easing', () => {
    expect(transitionTimingFunction['standard']).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('does NOT extend spacing', () => {
    expect(extend.spacing).toBeUndefined()
  })

  it('does NOT extend fontWeight', () => {
    expect(extend.fontWeight).toBeUndefined()
  })

  it('does NOT extend zIndex', () => {
    expect(extend.zIndex).toBeUndefined()
  })
})
