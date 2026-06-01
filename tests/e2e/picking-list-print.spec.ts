/**
 * tests/e2e/picking-list-print.spec.ts
 *
 * @critical
 *
 * Office prints a picking list. Verifies the print action triggers
 * the state transition, the order detail page reflects the new
 * state, and the EditLockBanner appears when a sales rep
 * subsequently tries to edit.
 *
 * Prerequisites:
 *   - At least one order in 'placed' state must exist before this
 *     test runs. The order-place.spec.ts test creates one — run
 *     these two specs in order, or run order-place first.
 *
 * Env:
 *   E2E_PIN_OFFICE, E2E_USER_OFFICE (optional)
 *   E2E_PIN_SALES,  E2E_USER_SALES  (optional)
 */

import { test, expect } from '@playwright/test'
import { loginAs, logout } from './_auth'

test.describe('@critical picking-list print flow', () => {
  test('office prints picking list and the order transitions to printed', async ({ page, context }) => {
    await loginAs(page, 'office')

    // Open the dashboard, click the first placed order
    await page.goto('/orders')
    await page
      .locator('a[href^="/orders/"]')
      .filter({ has: page.getByText(/Placed/i) })
      .first()
      .click()

    // Detail page loaded
    await expect(page.getByText(/Reference/i)).toBeVisible()

    // The print button intercepts default popup behaviour by injecting
    // into an iframe. To prevent the test from actually printing or
    // opening a print dialog, intercept window.print BEFORE the click.
    await page.addInitScript(() => {
      // Stub print so the print dialog never opens
      window.print = () => {}
    })

    // Click Print picking list
    const printButton = page.getByRole('button', { name: /Print picking list/i })
    await expect(printButton).toBeVisible()
    await printButton.click()

    // Page reloads ~1s after the print is triggered. Wait for the
    // post-reload state.
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    // Verify the order now shows the Printed chip
    await expect(page.getByText(/Printed/i).first()).toBeVisible({ timeout: 10_000 })

    // Verify the Reprint button now replaces the Print button
    await expect(page.getByRole('button', { name: /Reprint picking list/i })).toBeVisible()
  })

  test('sales rep sees lock banner when opening a printed order', async ({ page }) => {
    await loginAs(page, 'sales')

    await page.goto('/orders')
    // Find a printed order and open it
    const printedRow = page
      .locator('a[href^="/orders/"]')
      .filter({ has: page.getByText(/Printed/i) })
      .first()
    await expect(printedRow).toBeVisible({ timeout: 10_000 })
    await printedRow.click()

    // Open the edit page directly (button on detail says "View / amend (office only)")
    const orderUrl = page.url()
    await page.goto(`${orderUrl}/edit`)

    // Lock banner is visible
    await expect(page.getByText(/Order locked/i)).toBeVisible()

    // No save button (sales is locked out)
    await expect(page.getByRole('button', { name: /Save changes/i })).toHaveCount(0)
  })

  test('reprint warning shows on a second print attempt', async ({ page }) => {
    await loginAs(page, 'office')

    await page.goto('/orders')
    await page
      .locator('a[href^="/orders/"]')
      .filter({ has: page.getByText(/Printed/i) })
      .first()
      .click()

    // The button label is "Reprint picking list" and the helper text
    // mentions retrieving the old sheet first.
    await expect(page.getByText(/retrieve the old one from the butcher/i)).toBeVisible()
  })
})
