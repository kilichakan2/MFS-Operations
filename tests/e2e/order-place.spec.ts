/**
 * tests/e2e/order-place.spec.ts
 *
 * @critical
 *
 * Sales rep places an order end-to-end via the UI:
 *   1. Login as sales
 *   2. Navigate to /orders/new
 *   3. Pick a customer
 *   4. Add a catalogued line + an ad-hoc line
 *   5. Submit
 *   6. Verify the order appears on /orders dashboard
 *
 * Prerequisites:
 *   - Vercel preview URL (or local dev server) in BASE_URL
 *   - E2E_PIN_SALES with the test sales rep's real PIN
 *   - E2E_USER_SALES (optional) with the test sales rep's name
 *   - A customer exists in the DB whose name starts with letter "A"
 *     or similar so it appears at the top of the picker
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_auth'

test.describe('@critical order placement flow', () => {
  test('sales rep places an order with catalogued + ad-hoc lines', async ({ page }) => {
    await loginAs(page, 'sales')

    // ── 1. Navigate to /orders/new ───────────────────────────
    await page.goto('/orders/new')
    await expect(page.getByText(/New order/i)).toBeVisible()

    // ── 2. Pick a customer ──────────────────────────────────
    await page.getByText(/Tap to choose a customer/i).click()
    // Bottom-sheet opens — pick the first customer in the list
    await page
      .getByRole('button')
      .filter({ hasText: /[A-Z]/ })
      .filter({ hasNotText: /search|cancel|new/i })
      .first()
      .click()

    // ── 3. Set delivery date (defaults to tomorrow, leave as is) ─

    // ── 4. Add a catalogued product on line 1 ───────────────
    // Line 1 starts on the Catalogue tab by default — open the picker
    const lineCards = page.locator('text=/^Line \\d+$/').locator('..').locator('..')
    const line1 = lineCards.first()

    // Tap the catalogue-picker button (the placeholder text says "Catalogue")
    await line1.getByText(/Catalogue/i).first().click({ force: true })
    // Open product picker — the catalogue placeholder is a button after pill
    await line1.locator('button').filter({ hasText: /catalogue|tap/i }).first().click()
    // Wait for the sheet
    await page.waitForTimeout(300)
    // Pick the first product
    await page
      .getByRole('button')
      .filter({ hasText: /[a-z]{3,}/ })
      .filter({ hasNotText: /search|cancel/i })
      .nth(1)
      .click()

    // Fill quantity
    await line1.getByPlaceholder('Qty').fill('10.5')

    // ── 5. Add second line (ad-hoc) ─────────────────────────
    await page.getByRole('button', { name: /Add line/i }).click()
    const line2 = lineCards.nth(1)
    await line2.getByRole('button', { name: /Ad-hoc/i }).click()
    await line2.getByPlaceholder(/free-text/i).fill('Mutton trim — E2E test')
    await line2.getByPlaceholder('Qty').fill('4')
    await line2.getByRole('button', { name: /^unit$/i }).click()

    // ── 6. Submit ───────────────────────────────────────────
    await page.getByRole('button', { name: /Confirm order/i }).click()

    // Redirected to /orders/[id]
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 10_000 })

    // ── 7. Verify the reference is displayed ────────────────
    await expect(page.locator('text=/^MFS-\\d{4}-\\d{4}$/')).toBeVisible()
    await expect(page.getByText(/Placed/i)).toBeVisible()
  })

  test('dashboard shows the new order under "Today + tomorrow"', async ({ page }) => {
    await loginAs(page, 'sales')
    await page.goto('/orders')

    await expect(page.getByText(/Orders/).first()).toBeVisible()
    // The newly-placed order from the previous test should be visible
    // (assuming Playwright is run sequentially against the same DB)
    await expect(page.locator('text=/^MFS-\\d{4}-\\d{4}$/').first()).toBeVisible()
  })
})
