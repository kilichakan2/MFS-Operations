/**
 * tests/unit/adapters/browser/Printer.test.ts
 *
 * Unit tests for the pure label-response classifier (F-PROD-04 Pass 1).
 * Relocated with the classifier into the Browser adapter at Pass 2a; this is the
 * ORACLE that proves the move was behaviour-preserving — assertions unchanged.
 *
 * Written BEFORE implementation per workflow rules. Covers every shape of
 * response the print path can receive: a genuine label, a login auth-bounce,
 * hard HTTP errors, and the tricky look-alikes (an empty url, and a label url
 * that merely *contains* the string "/login" in a query param).
 *
 * The classifier is a pure function with no browser dependency — the whole
 * detection decision is testable here without an iframe or a device.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyLabelResponse, createBrowserPrinter } from '@/lib/adapters/browser/Printer'

describe('classifyLabelResponse', () => {
  it('classifies a real label (no redirect, ok) as "label"', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1&format=html',
        status: 200,
      }),
    ).toBe('label')
  })

  it('classifies a redirect to /login as "auth-bounce"', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: true,
        url: 'https://mfsops.com/login?from=/api/labels',
        status: 200,
      }),
    ).toBe('auth-bounce')
  })

  it('classifies a /login final url as "auth-bounce" even if redirected flag is false', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/login',
        status: 200,
      }),
    ).toBe('auth-bounce')
  })

  it('classifies a 401 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 401,
      }),
    ).toBe('error')
  })

  it('classifies a 404 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 404,
      }),
    ).toBe('error')
  })

  it('classifies a 500 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 500,
      }),
    ).toBe('error')
  })

  it('classifies a malformed/empty url as "error" (guarded, no throw)', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: '',
        status: 200,
      }),
    ).toBe('error')
  })

  it('does NOT misclassify a label url that merely contains "/login" in a query param', () => {
    // The path is /api/labels — the "/login" is only in the ?from= query string.
    // We match on pathname, not the raw url string, so this stays a real label.
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/api/labels?from=/login',
        status: 200,
      }),
    ).toBe('label')
  })
})

// ── URL fidelity (R1 — byte-identical /api/labels query string) ─────────────────
// The Browser adapter is the single source of truth for the /api/labels URL. These
// assertions pin the constructed string CHARACTER-FOR-CHARACTER against the exact
// literals the HACCP screens built before Pass 2a, so a param-order change or a
// `usebydays` typo (a food-safety risk on the mince label) fails the suite. We stub
// fetch to return an auth-bounce so the method short-circuits before touching the
// DOM (the unit suite runs under node, no document) — the URL passed to fetch is
// what we assert.
describe('Browser adapter URL fidelity', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  let captured: string

  beforeEach(() => {
    originalFetch = globalThis.fetch
    captured = ''
    globalThis.fetch = vi.fn(async (url: string) => {
      captured = String(url)
      // /login final url → classifier returns 'auth-bounce' → no DOM, no print.
      return { ok: true, redirected: true, url: 'https://x/login', status: 200 }
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('delivery 58mm URL is byte-identical to the pre-refactor literal', async () => {
    await createBrowserPrinter().printDeliveryLabel(
      {
        id: 'abc-123', batch_number: 'b', supplier: 's', product_category: 'lamb',
        date: '2026-06-29', temperature_c: 3, temp_status: 'pass',
        born_in: null, reared_in: null, slaughter_site: null, cut_site: null,
        width: '58mm', copies: 1,
      },
      vi.fn(),
    )
    expect(captured).toBe('/api/labels?type=delivery&id=abc-123&format=html&copies=1&width=58mm')
  })

  it('delivery 100mm URL is byte-identical to the pre-refactor literal', async () => {
    await createBrowserPrinter().printDeliveryLabel(
      {
        id: 'abc-123', batch_number: 'b', supplier: 's', product_category: 'lamb',
        date: '2026-06-29', temperature_c: 3, temp_status: 'pass',
        born_in: null, reared_in: null, slaughter_site: null, cut_site: null,
        width: '100mm', copies: 1,
      },
      vi.fn(),
    )
    expect(captured).toBe('/api/labels?type=delivery&id=abc-123&format=html&copies=1&width=100mm')
  })

  it('mince URL is byte-identical to the pre-refactor literal (usebydays + width preserved)', async () => {
    await createBrowserPrinter().printMinceLabel(
      { id: 'abc-123', usebydays: 2, width: '100mm', copies: 1 },
      vi.fn(),
    )
    expect(captured).toBe('/api/labels?type=mince&id=abc-123&format=html&copies=1&usebydays=2&width=100mm')
  })
})
