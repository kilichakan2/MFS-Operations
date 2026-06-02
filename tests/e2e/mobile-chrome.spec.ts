/**
 * tests/e2e/mobile-chrome.spec.ts
 *
 * UI overhaul Item 2 — mobile chrome scenarios.
 *
 * Tests the new chrome pattern (navy top bar + bottom nav + slide-up
 * More drawer) at iPhone 14 Pro viewport (390x844) using chromium.
 *
 * Prereqs in .env.e2e.local (gitignored):
 *   E2E_USER_SALES, E2E_PIN_SALES
 *   E2E_USER_DRIVER, E2E_PIN_DRIVER
 *   E2E_PIN_ADMIN
 *   (office / warehouse helpers exist too; not all scenarios use them)
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'

test.use({ viewport: { width: 390, height: 844 } })

test.describe('mobile chrome — bottom nav + More drawer', () => {
  test('sales: bottom nav shows Orders / Visits / Complaints / More', async ({ page }) => {
    await loginAs(page, 'sales')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()

    // The three visible tabs (case-insensitive — labels are uppercased
    // by CSS, but accessible name is the raw text).
    await expect(nav.getByRole('link', { name: /orders/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /visits/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /complaints/i })).toBeVisible()

    // The synthetic More button (button, not link)
    await expect(nav.getByRole('button', { name: /more navigation options/i })).toBeVisible()
  })
})
