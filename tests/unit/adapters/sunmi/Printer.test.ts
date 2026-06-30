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
import {
  formatTempStatus, formatSpecies, isSunmiNative,
  buildDeliveryPayload, buildMincePayload, buildPrepPayload,
} from '@/lib/adapters/sunmi/Printer'
import type { DeliveryLabelInput } from '@/lib/ports'
import type { MinceLabelData, PrepLabelData } from '@/lib/printing/types'

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
      allergens_flagged: false,
      allergen_notes:    null,
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

    it('sets allergens to "None" when not flagged (the common path)', () => {
      expect(buildDeliveryPayload(base, 'ACME').allergens).toBe('None')
    })

    it('carries the flagged allergen notes verbatim (F-PROD-04 Pass 3)', () => {
      const flagged = { ...base, allergens_flagged: true, allergen_notes: 'Mustard, Celery' }
      expect(buildDeliveryPayload(flagged, 'ACME').allergens).toBe('Mustard, Celery')
    })

    it('falls back to "FLAGGED - see record" when flagged with blank notes', () => {
      const flagged = { ...base, allergens_flagged: true, allergen_notes: '' }
      expect(buildDeliveryPayload(flagged, 'ACME').allergens).toBe('FLAGGED - see record')
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

  // ── buildMincePayload — native MINCE JSON contract (ADR-0013, BLS) ───────────
  // The mince native label is COUNTRY-ONLY: slaughteredIn carries "GB" (no plant
  // digits) and mincedIn is "GB". These keys mirror SunmiPrintBridge.java's
  // renderMinceLabel optString reads.
  describe('buildMincePayload — native MINCE JSON contract (country-only BLS)', () => {
    const mince: MinceLabelData = {
      batch_code:           'MINCE-3006-BEEF-001',
      product_species:      'Beef',
      output_mode:          'chilled',
      date:                 '30 Jun 2026',
      kill_date:            '26 Jun 2026',
      days_from_kill:       4,
      source_batch_numbers: ['3006-GB-1', '3006-IE-2'],
      use_by:               '07 Jul 2026',
      origins:              ['United Kingdom', 'Ireland'],
      slaughtered_in:       ['GB', 'IE'],
      minced_in:            'GB',
      allergens_present:    [],
    }

    it('emits type "mince"', () => {
      expect(buildMincePayload(mince).type).toBe('mince')
    })

    it('slaughteredIn is country-only, distinct, comma-joined (no plant digits)', () => {
      const p = buildMincePayload(mince)
      expect(p.slaughteredIn).toBe('GB, IE')
      expect(p.slaughteredIn).not.toMatch(/GB[0-9]/)
    })

    it('mincedIn is country-only GB (no plant code)', () => {
      expect(buildMincePayload(mince).mincedIn).toBe('GB')
    })

    it('bornIn carries the distinct origin country names comma-joined', () => {
      expect(buildMincePayload(mince).bornIn).toBe('United Kingdom, Ireland')
    })

    it('carries batch, productName (species), date, useBy through', () => {
      const p = buildMincePayload(mince)
      expect(p.batch).toBe('MINCE-3006-BEEF-001')
      expect(p.productName).toBe('Beef')
      expect(p.date).toBe('30 Jun 2026')
      expect(p.useBy).toBe('07 Jul 2026')
    })

    it('allergens is "None" when empty, else comma-joined', () => {
      expect(buildMincePayload(mince).allergens).toBe('None')
      expect(buildMincePayload({ ...mince, allergens_present: ['Mustard', 'Celery'] }).allergens).toBe('Mustard, Celery')
    })

    it('declares exactly the expected key set (pins the contract)', () => {
      const p = buildMincePayload(mince)
      expect(Object.keys(p).sort()).toEqual(
        [
          'type', 'batch', 'productName', 'date', 'useBy',
          'bornIn', 'slaughteredIn', 'mincedIn', 'allergens',
        ].sort(),
      )
    })
  })

  // ── buildPrepPayload — native PREP JSON contract (ADR-0013, BLS) ─────────────
  // The prep native label is COUNTRY+PLANT: slaughteredIn carries raw "GB1234",
  // cutIn carries the primary cut site, furtherCutIn is GB2946 (MFS).
  describe('buildPrepPayload — native PREP JSON contract (country+plant BLS)', () => {
    const prep: PrepLabelData = {
      batch_code:           'PREP-3006-BEEF-001',
      product_name:         'Diced beef',
      product_species:      'Beef',
      output_mode:          'prep',
      date:                 '30 Jun 2026',
      kill_date:            '26 Jun 2026',
      days_from_kill:       4,
      source_batch_numbers: ['3006-GB-1'],
      use_by:               '07 Jul 2026',
      origins:              ['United Kingdom'],
      reared_in:            ['Ireland'],
      slaughtered_in:       ['GB1234', 'IE5678'],
      cut_in:               ['GB5678'],
      further_cut_in:       'GB2946',
      allergens_present:    [],
    }

    it('emits type "prep"', () => {
      expect(buildPrepPayload(prep).type).toBe('prep')
    })

    it('slaughteredIn is country+plant, distinct, comma-joined (digits KEPT)', () => {
      expect(buildPrepPayload(prep).slaughteredIn).toBe('GB1234, IE5678')
    })

    it('cutIn carries the primary cut site country+plant', () => {
      expect(buildPrepPayload(prep).cutIn).toBe('GB5678')
    })

    it('furtherCutIn is GB2946 (MFS)', () => {
      expect(buildPrepPayload(prep).furtherCutIn).toBe('GB2946')
    })

    it('bornIn / rearedIn carry distinct country names', () => {
      const p = buildPrepPayload(prep)
      expect(p.bornIn).toBe('United Kingdom')
      expect(p.rearedIn).toBe('Ireland')
    })

    it('carries batch, productName, date, useBy through', () => {
      const p = buildPrepPayload(prep)
      expect(p.batch).toBe('PREP-3006-BEEF-001')
      expect(p.productName).toBe('Diced beef')
      expect(p.date).toBe('30 Jun 2026')
      expect(p.useBy).toBe('07 Jul 2026')
    })

    it('allergens is "None" when empty, else comma-joined', () => {
      expect(buildPrepPayload(prep).allergens).toBe('None')
      expect(buildPrepPayload({ ...prep, allergens_present: ['Sesame'] }).allergens).toBe('Sesame')
    })

    it('declares exactly the expected key set (pins the contract)', () => {
      const p = buildPrepPayload(prep)
      expect(Object.keys(p).sort()).toEqual(
        [
          'type', 'batch', 'productName', 'date', 'useBy',
          'bornIn', 'rearedIn', 'slaughteredIn', 'cutIn', 'furtherCutIn', 'allergens',
        ].sort(),
      )
    })
  })
})
