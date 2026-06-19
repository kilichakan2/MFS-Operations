/**
 * tests/e2e/07-pricing-export-pdf.spec.ts
 *
 * F-22 — PdfRenderer port + jsPDF adapter. This is the NEW coverage the
 * extraction earned: a real browser clicks "Export PDF" on a price
 * agreement and we assert a download actually fires with the byte-identity
 * filename `MFS-Pricing-{ref}-{customer}.pdf`.
 *
 * Why E2E and not unit: the jsPDF routine lazy-loads `jspdf` +
 * `jspdf-autotable` via `await import()` inside the adapter, touches
 * `window.Image` / `document.createElement` / canvas, and ends with
 * `doc.save()` (a browser download). None of that runs under Vitest/jsdom —
 * only a real Chromium download event proves the path. (F-TD-26 defers the
 * Blob-returning split that would make the bytes headless-assertable; until
 * then, "a download fired with the right filename" IS the byte-identity
 * proof we can get.)
 *
 * Coverage — the tricky rendering variations the code-critic flagged, so
 * byte-identity is exercised, not just "a download happened":
 *   • Agreement A (prospect):    a PROSPECT (no saved customer) + a very
 *                                LONG customer name (truncation path) +
 *                                NO valid_until ("ongoing" date line) +
 *                                a FREETEXT line (the " *" + footnote path)
 *                                + a line carrying a NOTE + header notes.
 *   • Agreement B (existing):    a SAVED customer (ANVIL-TEST-customer) +
 *                                a fixed valid_until (dated "Valid" line) +
 *                                a catalogued product line, no notes.
 *
 * Seeding: the local/preview seed plants NO pricing fixtures (known gap
 * F-TD-25), so this spec CREATES the agreements it needs first via
 * POST /api/pricing (the same endpoint the page's create form calls),
 * reusing the session cookie set by loginAs — then drives the UI export.
 * Free-text + catalogued lines both covered; the catalogued line resolves
 * a real product_id from /api/reference so it is FK-valid.
 *
 * Tagging: NOT @critical. A new export path should run in the standard
 * E2E lane but must not gate every future Gate-4 preview smoke (the
 * @critical subset). It runs locally under `npx playwright test` and in
 * the chromium project.
 *
 * Prerequisites (same as the other order specs): ANVIL-TEST-sales user
 * (pin in gitignored .env.e2e.local) + ANVIL-TEST-customer, both planted
 * by supabase/seed.sql on a fresh `npm run db:reset`.
 */

import { test, expect } from '@playwright/test'
import { loginAs }       from './_auth'

const FILENAME_RE = /^MFS-Pricing-.+\.pdf$/

// A deliberately long prospect name to exercise the PDF's customer-name
// truncation path (doc.splitTextToSize at ~84mm in the jsPDF adapter).
const LONG_PROSPECT =
  'Really Very Extremely Long Prospect Company Trading Name Limited Partnership LLP'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Create an agreement via POST /api/pricing using the page's session
 * cookie (set by loginAs). Returns its reference_number so the spec can
 * find the card in the list. Throws loudly on a non-201 so a seeding
 * failure never masquerades as a passing export.
 */
async function createAgreement(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
): Promise<string> {
  const result = await page.evaluate(async (b) => {
    const res = await fetch('/api/pricing', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify(b),
    })
    const text = await res.text()
    return { status: res.status, text }
  }, body)

  expect(
    result.status,
    `POST /api/pricing should 201; got ${result.status}: ${result.text}`,
  ).toBe(201)

  const { reference_number } = JSON.parse(result.text) as { reference_number: string }
  expect(reference_number, 'created agreement must carry a reference_number').toBeTruthy()
  return reference_number
}

/** Read a real, FK-valid customer + product id from /api/reference. */
async function pickReference(page: import('@playwright/test').Page): Promise<{
  customerId: string
  productId:  string
}> {
  const ref = await page.evaluate(async () => {
    const res = await fetch('/api/reference', { credentials: 'include' })
    if (!res.ok) throw new Error(`/api/reference returned ${res.status}`)
    const { customers, products } = await res.json() as {
      customers: Array<{ id: string; name: string }>
      products:  Array<{ id: string; name: string }>
    }
    const customer = customers.find(c => /ANVIL-TEST-customer/i.test(c.name)) ?? customers[0]
    const product  = products.find(p => /ANVIL-TEST-product/i.test(p.name))  ?? products[0]
    return { customerId: customer?.id ?? null, productId: product?.id ?? null }
  })
  expect(ref.customerId, 'ANVIL-TEST-customer must exist (seed)').toBeTruthy()
  expect(ref.productId,  'ANVIL-TEST-product must exist (seed)').toBeTruthy()
  return ref as { customerId: string; productId: string }
}

/**
 * From the /pricing list, open the agreement whose reference_number matches,
 * then click the named "Export PDF" button on the detail view and return
 * the fired download. The detail-view button is the only one with an
 * accessible text label ("Export PDF"); the per-card icon button is an
 * SVG-only control, so we drive the detail view deliberately.
 */
async function exportFromDetail(
  page: import('@playwright/test').Page,
  referenceNumber: string,
): Promise<import('@playwright/test').Download> {
  await page.goto('/pricing')
  await expect(page).toHaveURL(/\/pricing(\?|$)/)

  // The reference number renders as mono text inside the card's view
  // button. Click the card to open the detail view.
  const refLocator = page.getByText(referenceNumber, { exact: true })
  await expect(refLocator).toBeVisible({ timeout: 10_000 })
  await refLocator.click()

  // Detail view shows the prominent orange "Export PDF" button.
  const exportBtn = page.getByRole('button', { name: /export pdf/i }).first()
  await expect(exportBtn).toBeVisible({ timeout: 10_000 })

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    exportBtn.click(),
  ])
  return download
}

test.describe('pricing PDF export (F-22 PdfRenderer port)', () => {

  test('exports a prospect / long-name / ongoing / freetext+note agreement to a PDF download', async ({ page }) => {
    await loginAs(page, 'sales')

    // Agreement A — prospect, long name (truncation), no valid_until
    // (ongoing), a freetext line (the " *" footnote path) + a line note +
    // header notes. One agreement exercises five of the tricky paths.
    const refA = await createAgreement(page, {
      prospect_name: LONG_PROSPECT,
      valid_from:    today(),
      valid_until:   null, // "ongoing"
      notes:         'Agreed at trade visit — standing orders only (E2E note path).',
      lines: [
        {
          product_name_override: 'Bespoke mutton trim — E2E freetext',
          price:                 12.5,
          unit:                  'per_kg',
          notes:                 'Min order 5 boxes (E2E line-note path)',
          position:              0,
        },
      ],
    })

    const download = await exportFromDetail(page, refA)
    const filename = download.suggestedFilename()

    expect(filename, `download filename should match ${FILENAME_RE}`).toMatch(FILENAME_RE)
    // Reference number is part of the byte-identity filename contract:
    // MFS-Pricing-{ref}-{customer}.pdf
    expect(filename).toContain(refA)
    // The long customer name is sanitised ([^a-zA-Z0-9] → '-') in the
    // filename — the leading word survives, proving the customer segment.
    expect(filename).toContain('Really')
  })

  test('exports an existing-customer / dated / catalogued agreement to a PDF download', async ({ page }) => {
    await loginAs(page, 'sales')

    const { customerId, productId } = await pickReference(page)

    // Agreement B — saved customer, a fixed valid_until (dated "Valid"
    // line, not "ongoing"), one catalogued product line, no notes.
    const refB = await createAgreement(page, {
      customer_id: customerId,
      valid_from:  today(),
      valid_until: '2099-12-31', // dated path, not ongoing
      notes:       null,
      lines: [
        {
          product_id: productId,
          price:      8.25,
          unit:       'per_box',
          position:   0,
        },
      ],
    })

    const download = await exportFromDetail(page, refB)
    const filename = download.suggestedFilename()

    expect(filename, `download filename should match ${FILENAME_RE}`).toMatch(FILENAME_RE)
    expect(filename).toContain(refB)
    // ANVIL-TEST-customer sanitises to a segment beginning "ANVIL-TEST"
    expect(filename).toContain('ANVIL-TEST')
  })
})
