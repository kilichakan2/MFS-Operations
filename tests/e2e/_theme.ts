/**
 * tests/e2e/_theme.ts
 *
 * Shared theme/colour probes for the 2026-07-01 light design-system refresh
 * (ANVIL Unit 1). These read the *rendered* DOM — the real resolved value of a
 * semantic token in a live browser — so a spec proves the paint that actually
 * shipped, not a value copied out of the CSS source.
 *
 * 🗣 In plain English: a little colour-dropper you can point at any brand
 *    "label" (e.g. the error colour) on a live page and read back the exact
 *    paint it resolves to. That is how we prove the screen went light and the
 *    danger red is the brand red, not the old crimson or pink.
 */
import { type Page, expect } from '@playwright/test'

export type RGB = { r: number; g: number; b: number }

/** Brand Mediterranean Red family (the ONE true "something is wrong" red). */
export const BRAND_RED_600: RGB = { r: 214, g: 42, b: 0 } // #d62a00
export const BRAND_RED_700: RGB = { r: 168, g: 33, b: 10 } // #a8210a
export const BRAND_RED_100: RGB = { r: 255, g: 224, b: 214 } // #ffe0d6
/** RETIRED reds — must NEVER appear on a light danger surface after this refresh. */
export const RETIRED_SCARLET_600: RGB = { r: 200, g: 16, b: 46 } // #c8102e (invented crimson)
export const RETIRED_MAROON_500: RGB = { r: 89, g: 1, b: 41 } // #590129 (old pink deviation)

/** Resolve any CSS colour value (incl. `var(--token)`) against a live page → RGB. */
export async function resolveColor(page: Page, cssValue: string): Promise<RGB> {
  const rgbStr = await page.evaluate((val) => {
    const el = document.createElement('div')
    el.style.color = val
    document.body.appendChild(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  }, cssValue)
  const m = rgbStr.match(/\d+/g)?.map(Number) ?? [0, 0, 0]
  return { r: m[0], g: m[1], b: m[2] }
}

/** WCAG relative-luminance + contrast ratio, computed on real RGB. */
function lin(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance({ r, g, b }: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** Average channel value — a cheap "is this surface light or dark?" gauge. */
export function avgChannel({ r, g, b }: RGB): number {
  return (r + g + b) / 3
}

const eq = (a: RGB, b: RGB) => a.r === b.r && a.g === b.g && a.b === b.b

/** Assert a resolved colour is in the brand-red family and NOT a retired red. */
export function expectBrandRed(actual: RGB, label: string): void {
  const isBrand =
    eq(actual, BRAND_RED_600) || eq(actual, BRAND_RED_700) || eq(actual, BRAND_RED_100)
  expect(
    isBrand,
    `${label}: expected brand Mediterranean Red family, got rgb(${actual.r},${actual.g},${actual.b})`,
  ).toBe(true)
  // Explicit "no pink, no crimson" guard — the whole point of the unification.
  expect(eq(actual, RETIRED_SCARLET_600), `${label}: must not be retired scarlet`).toBe(false)
  expect(eq(actual, RETIRED_MAROON_500), `${label}: must not be retired pink maroon`).toBe(false)
}
