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
import { formatTempStatus, formatSpecies, isSunmiNative } from '@/lib/adapters/sunmi/Printer'

describe('Sunmi label helpers', () => {
  describe('formatTempStatus — temperature value only (ADR-0012: no PASS/FAIL)', () => {
    it('renders numeric temperature value only (no PASS/FAIL)', () => {
      expect(formatTempStatus(3.2, 'pass')).toBe('3.2°C')
    })

    it('still value-only on a failed temperature (fail lives in the diary, not the label)', () => {
      expect(formatTempStatus(8.1, 'fail')).toBe('8.1°C')
    })

    it('value-only for conditional status', () => {
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
          printDeliveryLabel: () => undefined,
        },
      }
      try {
        expect(isSunmiNative()).toBe(true)
      } finally {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    })
  })
})
