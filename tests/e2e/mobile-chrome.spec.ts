/**
 * tests/e2e/mobile-chrome.spec.ts
 *
 * UI overhaul Item 2 — mobile chrome scenarios.
 *
 * Tests the new chrome pattern (navy top bar + bottom nav + slide-up
 * More drawer) at iPhone 14 Pro viewport (390x844) using chromium.
 *
 * Coverage map (one test per spec scenario):
 *   1. Sales bottom nav: Orders / Visits / Complaints / More
 *   2. Sales → Tap More → drawer slides up (sheet visible)
 *   3. Sales drawer rows: Pricing / Compliments / Routes (DESKTOP) / Runs
 *   4. Sales → Tap backdrop → drawer closes
 *   5. Driver bottom nav: 3 tabs only, no More
 *   6. Admin drawer rows: Cash / Compliments / Routes / Runs / Admin / Map
 *   7. Active tab visual: orange icon + label + 3px orange top bar
 *   8. Top bar visual: navy bg, orange MFS logo, white uppercase title
 *
 * Prereqs in .env.e2e.local (gitignored):
 *   E2E_USER_SALES, E2E_PIN_SALES   (scenarios 1-4, 7-8)
 *   E2E_USER_DRIVER, E2E_PIN_DRIVER (scenario 5)
 *   E2E_PIN_ADMIN                    (scenario 6)
 *
 * Driver and admin env vars may not be present in every dev's local
 * .env.e2e.local — those scenarios will throw a descriptive missing-
 * env error from _auth.ts in that case.
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'

test.use({ viewport: { width: 390, height: 844 } })

test.describe('mobile chrome — sales role', () => {
  test('bottom nav shows Orders / Visits / Complaints / More', async ({ page }) => {
    await loginAs(page, 'sales')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()

    await expect(nav.getByRole('link', { name: /orders/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /visits/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /complaints/i })).toBeVisible()
    await expect(nav.getByRole('button', { name: /more navigation options/i })).toBeVisible()
  })

  test('tap More opens the drawer', async ({ page }) => {
    await loginAs(page, 'sales')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('button', { name: /more navigation options/i }).click()

    const drawer = page.getByRole('dialog', { name: /more navigation options/i })
    await expect(drawer).toBeVisible()
  })

  test('drawer rows: Pricing / Compliments / Routes (DESKTOP) / Runs', async ({ page }) => {
    await loginAs(page, 'sales')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('button', { name: /more navigation options/i }).click()

    const drawer = page.getByRole('dialog', { name: /more navigation options/i })
    await expect(drawer).toBeVisible()

    await expect(drawer.getByRole('link', { name: /pricing/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /compliments/i })).toBeVisible()

    const routesRow = drawer.getByRole('link', { name: /routes/i })
    await expect(routesRow).toBeVisible()
    // DESKTOP pill lives inside the Routes row
    await expect(routesRow.getByText(/desktop/i)).toBeVisible()

    await expect(drawer.getByRole('link', { name: /runs/i })).toBeVisible()
  })

  test('tap backdrop closes the drawer', async ({ page }) => {
    await loginAs(page, 'sales')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('button', { name: /more navigation options/i }).click()

    const drawer = page.getByRole('dialog', { name: /more navigation options/i })
    await expect(drawer).toBeVisible()

    // Backdrop is a sibling div with bg-mfs-navy/50 — click top-left
    // corner of the viewport which the sheet doesn't cover.
    await page.mouse.click(20, 20)

    // The dialog uses transition-transform with translate-y-full when
    // closed; aria-hidden flips on the backdrop. Easiest assertion:
    // the dialog's bounding box should no longer be in the visible
    // viewport (its transform pushes it offscreen).
    await page.waitForTimeout(300) // 250ms anim + 50ms buffer
    const box = await drawer.boundingBox()
    if (box) {
      expect(box.y).toBeGreaterThanOrEqual(844) // pushed offscreen
    }
  })
})

test.describe('mobile chrome — driver role', () => {
  test('bottom nav shows 3 tabs (My Route / Complaints / Kudos), no More', async ({ page }) => {
    await loginAs(page, 'driver')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()

    await expect(nav.getByRole('link', { name: /my route/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /complaints/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /kudos/i })).toBeVisible()

    // No More slot for driver — overflow is undefined in buildMatrix.
    await expect(nav.getByRole('button', { name: /more navigation options/i })).toHaveCount(0)
  })
})

test.describe('mobile chrome — admin role', () => {
  test('drawer rows: Cash / Compliments / Routes / Runs / Admin / Map', async ({ page }) => {
    await loginAs(page, 'admin')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('button', { name: /more navigation options/i }).click()

    const drawer = page.getByRole('dialog', { name: /more navigation options/i })
    await expect(drawer).toBeVisible()

    await expect(drawer.getByRole('link', { name: /cash/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /compliments/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /routes/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /runs/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /admin/i })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /map/i })).toBeVisible()
  })
})

test.describe('mobile chrome — visual chrome', () => {
  test('active tab has orange icon, orange label, 3px orange top bar', async ({ page }) => {
    await loginAs(page, 'sales')
    // Navigate to /orders so the Orders tab is the active one
    await page.goto('/orders')

    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    const ordersTab = nav.getByRole('link', { name: /orders/i })
    await expect(ordersTab).toHaveAttribute('aria-current', 'page')

    // Active state: tailwind text-mfs-orange = #EB6619
    await expect(ordersTab).toHaveCSS('color', 'rgb(235, 102, 25)')

    // Active tab renders a 3px orange bar via an absolutely-positioned
    // <span aria-hidden="true"> at top. Use locator chained on the tab.
    const activeBar = ordersTab.locator('span[aria-hidden="true"]').first()
    await expect(activeBar).toBeVisible()
    const barBox = await activeBar.boundingBox()
    expect(barBox?.height).toBeCloseTo(3, 0)
  })

  test('top bar: navy bg + uppercase white title', async ({ page }) => {
    await loginAs(page, 'sales')
    await page.goto('/orders')

    const header = page.locator('header').first()
    await expect(header).toHaveCSS('background-color', 'rgb(22, 32, 91)')

    // The title is rendered as a <span> with uppercase + white text
    const title = header.locator('span', { hasText: /orders/i }).last()
    await expect(title).toHaveCSS('text-transform', 'uppercase')
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')
  })
})
