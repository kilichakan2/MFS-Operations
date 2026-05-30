/**
 * tests/unit/orders/pickingList.test.ts
 *
 * Unit tests for lib/orders/pickingList.ts — the picking-sheet HTML
 * renderer used by the print API endpoint.
 *
 * Focuses on the output structure (correct sections, correct fields
 * rendered, escape correctness, edge cases) rather than visual layout —
 * the latter is a manual smoke test on a real A4 sheet.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB4)
 */

import { describe, it, expect } from 'vitest'
import {
  renderPickingListHtml,
  type PickingListData,
} from '../../../lib/orders/pickingList'

function makeData(overrides: Partial<PickingListData> = {}): PickingListData {
  return {
    reference:         'MFS-2026-0001',
    customer_name:     'Yakut Restaurant',
    customer_postcode: 'HD6 2PL',
    order_date:        '2026-05-30',
    delivery_date:     '2026-05-31',
    sales_rep:         'Mehmet',
    printed_at:        '2026-05-30T08:14:00Z',
    printed_by:        'Yusuf',
    delivery_notes:    null,
    order_notes:       null,
    lines: [
      {
        line_number:  1,
        product_code: '4024',
        description:  'Lamb Mince',
        quantity:     10.5,
        uom:          'kg',
        pack:         'Kg',
        notes:        null,
      },
    ],
    ...overrides,
  }
}

// ── Document structure ───────────────────────────────────────

describe('renderPickingListHtml — document structure', () => {
  it('returns a complete HTML document', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/^<!DOCTYPE html>/i)
    expect(html).toMatch(/<\/html>\s*$/)
  })

  it('sets A4 portrait page size in print CSS', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/)
  })

  it('sets the reference as the page title', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/<title>MFS-2026-0001 — Picking Form<\/title>/)
  })

  it('includes the PICKING FORM heading', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/PICKING FORM/)
  })

  it('includes the customer name as the main heading', () => {
    const html = renderPickingListHtml(makeData({ customer_name: 'Yakut Restaurant' }))
    expect(html).toMatch(/<h1[^>]*>Yakut Restaurant<\/h1>/)
  })

  it('includes the customer postcode when present', () => {
    const html = renderPickingListHtml(makeData({ customer_postcode: 'HD6 2PL' }))
    expect(html).toMatch(/HD6 2PL/)
  })

  it('omits the postcode block when postcode is null', () => {
    const html = renderPickingListHtml(makeData({ customer_postcode: null }))
    expect(html).not.toMatch(/class="address"/)
  })

  it('renders order_date and delivery_date in GB format', () => {
    const html = renderPickingListHtml(makeData({
      order_date:    '2026-05-30',
      delivery_date: '2026-05-31',
    }))
    expect(html).toMatch(/30\/05\/2026/)
    expect(html).toMatch(/31\/05\/2026/)
  })

  it('renders the sales rep name', () => {
    const html = renderPickingListHtml(makeData({ sales_rep: 'Mehmet' }))
    expect(html).toMatch(/Mehmet/)
  })

  it('renders the printed-by user in the footer', () => {
    const html = renderPickingListHtml(makeData({ printed_by: 'Yusuf' }))
    expect(html).toMatch(/Printed.*by Yusuf/)
  })
})

// ── Line items ───────────────────────────────────────────────

describe('renderPickingListHtml — line items', () => {
  it('renders a catalogued line with code + description + qty + pack', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '4024', description: 'Lamb Mince',
        quantity: 10.5, uom: 'kg', pack: 'Kg', notes: null,
      }],
    }))
    expect(html).toMatch(/4024/)
    expect(html).toMatch(/Lamb Mince/)
    expect(html).toMatch(/10\.5/)
    expect(html).toMatch(/<td class="uom">KG<\/td>/)
  })

  it('renders an ad-hoc line with empty code', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '', description: 'Mutton trim',
        quantity: 4, uom: 'kg', pack: null, notes: null,
      }],
    }))
    expect(html).toMatch(/Mutton trim/)
    expect(html).toMatch(/<td class="code"><\/td>/)
  })

  it('renders multiple lines in line_number order', () => {
    const html = renderPickingListHtml(makeData({
      lines: [
        { line_number: 3, product_code: 'C', description: 'Third',  quantity: 3, uom: 'unit', pack: null, notes: null },
        { line_number: 1, product_code: 'A', description: 'First',  quantity: 1, uom: 'kg',   pack: null, notes: null },
        { line_number: 2, product_code: 'B', description: 'Second', quantity: 2, uom: 'kg',   pack: null, notes: null },
      ],
    }))
    const firstIdx  = html.indexOf('First')
    const secondIdx = html.indexOf('Second')
    const thirdIdx  = html.indexOf('Third')
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    expect(thirdIdx).toBeGreaterThan(secondIdx)
  })

  it('renders UNIT uom in uppercase', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: 'ACH15', description: 'Charcoal',
        quantity: 1, uom: 'unit', pack: 'Each (15kg)', notes: null,
      }],
    }))
    expect(html).toMatch(/<td class="uom">UNIT<\/td>/)
  })

  it('renders line notes in a separate row below the line', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '4024', description: 'Lamb Mince',
        quantity: 5, uom: 'kg', pack: 'Kg', notes: 'extra fine',
      }],
    }))
    expect(html).toMatch(/note-row/)
    expect(html).toMatch(/extra fine/)
    expect(html).toMatch(/↳/)
  })

  it('does not render a note row when notes are null', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '4024', description: 'Lamb Mince',
        quantity: 5, uom: 'kg', pack: 'Kg', notes: null,
      }],
    }))
    // CSS contains a .note-row selector, so check for actual element markup
    expect(html).not.toMatch(/<tr class="note-row"/)
  })

  it('formats quantity without trailing zeros', () => {
    const data = makeData({
      lines: [{
        line_number: 1, product_code: '4024', description: 'Lamb Mince',
        quantity: 10, uom: 'kg', pack: null, notes: null,
      }],
    })
    expect(renderPickingListHtml(data)).toMatch(/<td class="qty">10<\/td>/)
  })
})

// ── Order-level notes block ──────────────────────────────────

describe('renderPickingListHtml — notes block', () => {
  it('renders delivery_notes when present', () => {
    const html = renderPickingListHtml(makeData({ delivery_notes: 'Before 11am' }))
    expect(html).toMatch(/Before 11am/)
    expect(html).toMatch(/<strong>Delivery:<\/strong>/)
  })

  it('renders order_notes when present', () => {
    const html = renderPickingListHtml(makeData({ order_notes: 'No bone' }))
    expect(html).toMatch(/No bone/)
    expect(html).toMatch(/<strong>Order:<\/strong>/)
  })

  it('renders both notes when both present', () => {
    const html = renderPickingListHtml(makeData({
      delivery_notes: 'Before 11am',
      order_notes:    'No bone',
    }))
    expect(html).toMatch(/Before 11am/)
    expect(html).toMatch(/No bone/)
  })

  it('omits the notes-block entirely when both are null', () => {
    const html = renderPickingListHtml(makeData({ delivery_notes: null, order_notes: null }))
    // CSS contains a .notes-block selector, so check for actual element markup
    expect(html).not.toMatch(/<div class="notes-block"/)
  })
})

// ── Barcode ──────────────────────────────────────────────────

describe('renderPickingListHtml — barcode', () => {
  it('renders an SVG barcode encoding the reference', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  })

  it('shows the reference as plain text above the barcode', () => {
    const html = renderPickingListHtml(makeData({ reference: 'MFS-2026-0042' }))
    expect(html).toMatch(/<div class="ref">MFS-2026-0042<\/div>/)
  })

  it('barcode SVG contains rect elements (i.e. bars were generated)', () => {
    const html = renderPickingListHtml(makeData())
    // Use [\s\S] instead of . with /s flag — works without es2018 target
    const barcodeMatch = html.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
    expect(barcodeMatch).not.toBeNull()
    if (barcodeMatch) {
      expect(barcodeMatch[1]).toMatch(/<rect/)
    }
  })
})

// ── HTML escaping ────────────────────────────────────────────

describe('renderPickingListHtml — HTML escaping', () => {
  it('escapes ampersands in customer names', () => {
    const html = renderPickingListHtml(makeData({ customer_name: 'M & S Foods' }))
    expect(html).toMatch(/M &amp; S Foods/)
    expect(html).not.toMatch(/M & S Foods/)
  })

  it('escapes angle brackets in ad-hoc descriptions', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '', description: '<script>alert("x")</script>',
        quantity: 1, uom: 'kg', pack: null, notes: null,
      }],
    }))
    expect(html).not.toMatch(/<script>alert/)
    expect(html).toMatch(/&lt;script&gt;/)
  })

  it('escapes quotes in notes', () => {
    const html = renderPickingListHtml(makeData({
      lines: [{
        line_number: 1, product_code: '4024', description: 'Lamb',
        quantity: 1, uom: 'kg', pack: null, notes: 'Chef said "extra trim"',
      }],
    }))
    expect(html).toMatch(/Chef said &quot;extra trim&quot;/)
  })
})

// ── Auto-print on iframe load ────────────────────────────────

describe('renderPickingListHtml — auto-print script', () => {
  it('includes the iframe-only auto-print script', () => {
    const html = renderPickingListHtml(makeData())
    expect(html).toMatch(/window\s*!==\s*window\.parent/)
    expect(html).toMatch(/window\.print/)
  })
})
