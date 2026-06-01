/**
 * tests/e2e/kds-butcher-flow.spec.ts
 *
 * @critical
 *
 * Butcher signs in to the KDS via PIN, taps Done on a line, and
 * sees it visually mark as done.
 *
 * Prerequisites:
 *   - At least one order in 'printed' state must exist. The
 *     picking-list-print.spec.ts test creates one — run these
 *     specs in order.
 *   - E2E_PIN_BUTCHER must be set to a real butcher PIN
 *
 * The KDS doesn't use cookie auth, so no loginAs() needed —
 * just navigate to /kds and use the on-screen PIN keypad.
 */

import { test, expect } from '@playwright/test'

const BUTCHER_PIN = process.env.E2E_PIN_BUTCHER ?? ''

test.describe('@critical KDS butcher flow', () => {
  test.beforeAll(() => {
    if (!BUTCHER_PIN) {
      throw new Error('E2E_PIN_BUTCHER must be set for the KDS E2E tests')
    }
  })

  test('butcher signs in to KDS with PIN', async ({ page }) => {
    await page.goto('/kds')

    // KDS header is visible
    await expect(page.getByText(/Production queue/i)).toBeVisible()

    // Click + Sign in
    await page.getByRole('button', { name: /Sign in/i }).click()

    // PIN modal opens
    await expect(page.getByText(/Butcher sign-in/i)).toBeVisible()

    // Tap each digit on the on-screen keypad
    for (const digit of BUTCHER_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }

    // If the PIN is 4+ digits, the modal auto-submits. If less, click OK.
    if (BUTCHER_PIN.length < 4) {
      await page.getByRole('button', { name: /OK/i }).click()
    }

    // After successful sign-in the butcher pill appears in the dock
    await expect(page.locator('header').getByText(/[A-Z][a-z]+/)).toBeVisible({ timeout: 5_000 })
  })

  test('butcher taps Done on a line and it marks as done', async ({ page }) => {
    await page.goto('/kds')

    // Sign in first
    await page.getByRole('button', { name: /Sign in/i }).click()
    for (const digit of BUTCHER_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    if (BUTCHER_PIN.length < 4) {
      await page.getByRole('button', { name: /OK/i }).click()
    }
    await expect(page.locator('header').getByText(/[A-Z][a-z]+/)).toBeVisible({ timeout: 5_000 })

    // Wait for at least one card to appear
    const card = page.locator('h2').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Find the first non-done line button on the first card
    const firstLine = page
      .locator('button')
      .filter({ has: page.locator('div.bg-slate-600') })  // empty checkbox circle = not done
      .first()
    await expect(firstLine).toBeVisible()

    // Tap it
    await firstLine.click()

    // Within 3 seconds the polling should pick up the change and the
    // line should display the green tick + line-through styling
    await expect(
      page.locator('button').filter({ has: page.locator('div.bg-green-600') }).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test('PIN modal rejects wrong PIN', async ({ page }) => {
    await page.goto('/kds')
    await page.getByRole('button', { name: /Sign in/i }).click()
    // Type a wrong PIN
    for (const digit of '0000') {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    // Wait for error
    await expect(page.getByText(/No butcher matches|Invalid PIN/i)).toBeVisible({ timeout: 5_000 })
  })
})
