/**
 * tests/e2e/kds-butcher-flow.spec.ts
 *
 * @critical
 *
 * The KDS kiosk is a shared, public-route screen in the production
 * room. There's no per-user session; butchers PIN-authenticate per
 * action via the on-page modal. This spec exercises:
 *
 *   1. The kiosk PIN sign-in flow (butcher signs in via the modal)
 *   2. Tapping Done on a line — verifies the line transitions to
 *      a done state visually (green tick / line-through)
 *   3. Wrong-PIN rejection
 *
 * Selectors captured by Playwright snapshot on 2026-06-01:
 *   - The KDS PIN keypad uses PLAIN digit names ('1','2'...), NOT
 *     'Digit 1' like the team-login keypad. There's an explicit
 *     'OK' submit button (no auto-submit at length 4).
 *   - The /kds page is PUBLIC (no team login needed; no IndexedDB
 *     sync). Product names come embedded in /api/kds/orders.
 */

import { test, expect } from '@playwright/test'

const BUTCHER_PIN = process.env.E2E_PIN_BUTCHER ?? ''

test.describe('@critical KDS butcher flow', () => {

  test.beforeAll(() => {
    if (!BUTCHER_PIN) {
      throw new Error('E2E_PIN_BUTCHER must be set for the KDS E2E tests')
    }
  })

  async function signIn(page: import('@playwright/test').Page, pin: string) {
    // Open the PIN modal
    await page.getByRole('button', { name: /Sign in/i }).click()
    // Modal title (verifies modal is open)
    await expect(page.getByText(/Butcher sign-in/i)).toBeVisible()
    // Tap each digit — keypad buttons are named by the digit itself.
    // The KDS keypad AUTO-SUBMITS at length 4 (see PinKeypad
    // pressDigit handler) — don't click OK afterwards or the test
    // will time out waiting for OK to be enabled (it's disabled
    // immediately after auto-submit fires).
    for (const digit of pin) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
  }

  test('butcher signs in to KDS with PIN', async ({ page }) => {
    await page.goto('/kds')

    // KDS header
    await expect(page.getByText(/Production queue/i)).toBeVisible()

    await signIn(page, BUTCHER_PIN)

    // After successful sign-in the butcher pill appears in the header
    // dock. The "+ Sign in" button STAYS visible because the KDS
    // design supports multiple butchers signed in simultaneously
    // (each kiosk shift might have 2-3 butchers). So we assert the
    // butcher's name appears, NOT that Sign in disappears.
    await expect(
      page.getByRole('button', { name: /ANVIL-TEST-butcher/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('butcher taps Done on a line and it marks as done', async ({ page }) => {
    await page.goto('/kds')
    await signIn(page, BUTCHER_PIN)

    // Wait for at least one order card to be visible. KDS renders
    // each order with an order reference (MFS-YYYY-NNNN) somewhere
    // visible, so we wait for any matching text rather than guessing
    // at the card wrapper element.
    await expect(
      page.getByText(/MFS-\d{4}-\d{4}/).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Find the first non-done line button. The KDS rendering uses
    // bg-slate-600 for the empty checkbox circle on a not-done line,
    // bg-green-600 for the done state.
    const firstLine = page
      .locator('button')
      .filter({ has: page.locator('div.bg-slate-600') })
      .first()
    await expect(firstLine).toBeVisible({ timeout: 5_000 })
    await firstLine.click()

    // Within 5 seconds the polling refresh should pick up the change
    // and at least one done-line indicator should appear.
    await expect(
      page.locator('button').filter({ has: page.locator('div.bg-green-600') }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('PIN modal rejects wrong PIN', async ({ page }) => {
    await page.goto('/kds')

    await page.getByRole('button', { name: /Sign in/i }).click()
    // Type a wrong PIN — keypad auto-submits at length 4
    for (const digit of '0000') {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }

    await expect(
      page.getByText(/No butcher matches|Invalid PIN|Incorrect/i),
    ).toBeVisible({ timeout: 5_000 })
  })
})
