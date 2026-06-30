/**
 * tests/unit/adapters/sunmi/Printer.test.ts
 *
 * Unit tests for the Sunmi adapter's pure label-content helpers + native-bridge
 * detection (F-PROD-04 Pass 2a, ADR-0010).
 *
 * These cases were ported VERBATIM (assertions unchanged = oracle) from the
 * "Sunmi label helpers" block previously in tests/unit/labelPrinting.test.ts —
 * relocated here when lib/printing/sunmi.ts moved to lib/adapters/sunmi/Printer.ts.
 * They exercise the only unit-testable pieces of the Sunmi adapter; the native
 * bridge call (window.MFSSunmiPrint.printDeliveryLabel) and getSupplierCode fetch
 * are not unit-testable (no native bridge in CI).
 */

import { describe, it, expect } from 'vitest'
import { formatTempStatus, formatSpecies, isSunmiNative, buildDeliveryPayload } from '@/lib/adapters/sunmi/Printer'
import type { DeliveryLabelInput } from '@/lib/ports'

describe('Sunmi label helpers', () => {
  describe('formatTempStatus — value-only temperature line (no PASS/FAIL)', () => {
    it('renders numeric temperature only for pass status', () => {
      expect(formatTempStatus(3.2, 'pass')).toBe('3.2°C')
    })

    it('renders numeric temperature only for fail status (no FAIL word)', () => {
      expect(formatTempStatus(8.1, 'fail')).toBe('8.1°C')
    })

    it('renders numeric temperature only for conditional status', () => {
      expect(formatTempStatus(5.5, 'conditional')).toBe('5.5°C')
    })

    it('substitutes em-dash placeholder when temperature is null', () => {
      expect(formatTempStatus(null, 'pass')).toBe('—')
    })
  })

  describe('formatSpecies — product_category to label header', () => {
    it('uppercases a single-word category', () => {
      expect(formatSpecies('lamb')).toBe('LAMB')
    })

    it('replaces underscores with spaces for compound categories', () => {
      expect(formatSpecies('chicken_breast')).toBe('CHICKEN BREAST')
    })
  })

  describe('isSunmiNative — detection of MFSSunmiPrint bridge', () => {
    // The bridge is injected by MainActivity via webView.addJavascriptInterface.
    // Detection must be safe in SSR (no window) and on devices that lack the bridge.

    it('returns false when window is undefined (SSR)', () => {
      const originalWindow = (globalThis as { window?: unknown }).window
      delete (globalThis as { window?: unknown }).window
      try {
        expect(isSunmiNative()).toBe(false)
      } finally {
        if (originalWindow !== undefined) {
          (globalThis as { window?: unknown }).window = originalWindow
        }
      }
    })

    it('returns false when window exists but MFSSunmiPrint is absent', () => {
      const originalWindow = (globalThis as { window?: unknown }).window
      ;(globalThis as { window?: unknown }).window = {}
      try {
        expect(isSunmiNative()).toBe(false)
      } finally {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    })

    it('returns true when window.MFSSunmiPrint is present', () => {
      const originalWindow = (globalThis as { window?: unknown }).window
      ;(globalThis as { window?: unknown }).window = {
        MFSSunmiPrint: {
          isReady: () => true,
          printLabel: () => undefined,
        },
      }
      try {
        expect(isSunmiNative()).toBe(true)
      } finally {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    })
  })

  describe('buildDeliveryPayload — the version-tolerant JSON contract (ADR-0013)', () => {
    // This is the oracle for the JSON contract: the key set + value shaping that
    // SunmiPrintBridge.java#printLabel reads by name. Pins TS-side key spelling.
    const base: DeliveryLabelInput = {
      id:               'row-1',
      batch_number:     'B12345',
      supplier:         'Acme Meats Ltd',
      product_category: 'lamb_leg',
      date:             '2026-06-30',
      temperature_c:    4,
      temp_status:      'pass',
      born_in:          'GB',
      reared_in:        'IE',
      slaughter_site:   'UK1234',
      cut_site:         'UK5678',
      width:            '58mm',
      copies:           1,
    }

    it('emits type "delivery"', () => {
      expect(buildDeliveryPayload(base, 'ACME').type).toBe('delivery')
    })

    it('carries the supplier label code passed in (not the raw supplier name)', () => {
      expect(buildDeliveryPayload(base, 'ACME').supplier).toBe('ACME')
    })

    it('uses value-only temp with no PASS/FAIL word', () => {
      const p = buildDeliveryPayload(base, 'ACME')
      expect(p.temp).toBe('4°C')
      expect(p.temp).not.toMatch(/PASS|FAIL/)
    })

    it('keeps bornIn and rearedIn as SEPARATE keys carrying raw inputs', () => {
      const p = buildDeliveryPayload(base, 'ACME')
      expect(p.bornIn).toBe('GB')
      expect(p.rearedIn).toBe('IE')
    })

    it('uppercases species and replaces underscores with spaces', () => {
      expect(buildDeliveryPayload(base, 'ACME').species).toBe('LAMB LEG')
    })

    it('always sets allergens to "None"', () => {
      expect(buildDeliveryPayload(base, 'ACME').allergens).toBe('None')
    })

    it('carries batch, date, slaughterSite and cutSite through', () => {
      const p = buildDeliveryPayload(base, 'ACME')
      expect(p.batch).toBe('B12345')
      expect(p.date).toBe('2026-06-30')
      expect(p.slaughterSite).toBe('UK1234')
      expect(p.cutSite).toBe('UK5678')
    })

    it('maps null/missing inputs to empty strings (never null/undefined)', () => {
      const empty: DeliveryLabelInput = {
        ...base,
        temperature_c:  null,
        born_in:        null,
        reared_in:      null,
        slaughter_site: null,
        cut_site:       null,
      }
      const p = buildDeliveryPayload(empty, 'ACME')
      expect(p.temp).toBe('—')
      expect(p.bornIn).toBe('')
      expect(p.rearedIn).toBe('')
      expect(p.slaughterSite).toBe('')
      expect(p.cutSite).toBe('')
    })

    it('declares exactly the expected key set (pins the contract)', () => {
      const p = buildDeliveryPayload(base, 'ACME')
      expect(Object.keys(p).sort()).toEqual(
        [
          'allergens', 'batch', 'bornIn', 'cutSite', 'date',
          'rearedIn', 'slaughterSite', 'species', 'supplier', 'temp', 'type',
        ].sort(),
      )
    })
  })
})
