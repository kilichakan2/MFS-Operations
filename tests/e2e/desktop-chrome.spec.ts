/**
 * tests/e2e/desktop-chrome.spec.ts
 *
 * UI overhaul Item 3 — desktop chrome scenarios.
 *
 * Tests the new desktop chrome (navy top bar + collapsible left
 * sidebar) at 1440×900 using chromium. Final regression scenario
 * swaps to 390×844 to confirm Item 2's mobile chrome still wins
 * below md.
 *
 * Prereqs in .env.e2e.local (gitignored):
 *   E2E_USER_SALES,  E2E_PIN_SALES   (scenarios 1-7, 10-13)
 *   E2E_USER_ADMIN,  E2E_PIN_ADMIN   (scenario 8)
 *   E2E_USER_DRIVER, E2E_PIN_DRIVER  (scenario 9)
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'

test.use({ viewport: { width: 1440, height: 900 } })

test.describe('desktop chrome — sales role @1440', () => {
  test('sidebar renders 7 nav items, collapsed by default', async ({ page }) => {
    await loginAs(page, 'sales')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeVisible()

    const links = sidebar.getByRole('link')
    await expect(links).toHaveCount(7)

    const width = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(width).toBe(64)
  })

  test('hover expands sidebar to 240px, mouse-leave collapses back to 64px', async ({ page }) => {
    await loginAs(page, 'sales')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeVisible()

    // Hover-peek delay is 300ms; wait 400ms for the timer + width transition.
    await sidebar.hover()
    await page.waitForTimeout(700) // 300ms enter + 250ms width + 150ms buffer
    const expandedWidth = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(expandedWidth).toBe(240)

    // Move mouse off (to top-right corner — well outside the sidebar).
    await page.mouse.move(1400, 50)
    await page.waitForTimeout(700) // 300ms leave + 250ms width + 150ms buffer
    const collapsedWidth = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(collapsedWidth).toBe(64)
  })

  test('chevron pin: click pins expanded, click again pins collapsed', async ({ page }) => {
    await loginAs(page, 'sales')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeVisible()

    // Pin expanded — chevron currently says "Pin sidebar expanded" (collapsed state).
    await page.getByRole('button', { name: /pin sidebar expanded/i }).click()
    await page.waitForTimeout(400)
    let width = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(width).toBe(240)

    // Mouse-leave should NOT collapse it (pinned state ignores hover).
    await page.mouse.move(1400, 50)
    await page.waitForTimeout(700)
    width = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(width).toBe(240)

    // Click chevron again — now it says "Pin sidebar collapsed".
    await page.getByRole('button', { name: /pin sidebar collapsed/i }).click()
    await page.waitForTimeout(400)
    width = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(width).toBe(64)

    // Hover should NOT expand it (still pinned, just pinned the other way).
    await sidebar.hover()
    await page.waitForTimeout(700)
    width = await sidebar.evaluate(el => (el as HTMLElement).clientWidth)
    expect(width).toBe(64)
  })

  test('clicking Orders navigates to /orders', async ({ page }) => {
    await loginAs(page, 'sales')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await sidebar.getByRole('link', { name: /orders/i }).click()

    await page.waitForURL(/\/orders/)
    expect(page.url()).toMatch(/\/orders$/)
  })

  test('active item has 3px orange edge bar', async ({ page }) => {
    await loginAs(page, 'sales')
    await page.goto('/orders')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    const ordersLink = sidebar.getByRole('link', { name: /orders/i })
    await expect(ordersLink).toHaveAttribute('aria-current', 'page')

    // 3px orange bar is an aria-hidden span absolutely positioned at left:0.
    const activeBar = ordersLink.locator('span[aria-hidden="true"]').first()
    await expect(activeBar).toBeVisible()
    const box = await activeBar.boundingBox()
    expect(box?.width).toBeCloseTo(3, 0)
    // bg-mfs-orange = #EB6619 = rgb(235, 102, 25)
    await expect(activeBar).toHaveCSS('background-color', 'rgb(235, 102, 25)')
  })

  test('body padding-left is 64px on desktop with RoleNav', async ({ page }) => {
    await loginAs(page, 'sales')

    const padding = await page.evaluate(() =>
      getComputedStyle(document.body).paddingLeft
    )
    expect(padding).toBe('64px')
  })
})

test.describe('desktop chrome — admin role @1440', () => {
  test('9 sidebar items render without scroll', async ({ page }) => {
    await loginAs(page, 'admin')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeVisible()

    const links = sidebar.getByRole('link')
    await expect(links).toHaveCount(9)

    // Inner <nav> is the scroll container; 48px per row × 9 = 432px, well under 836px (900-64).
    const innerNav = sidebar.locator('nav').first()
    const { sh, ch } = await innerNav.evaluate(el => ({
      sh: (el as HTMLElement).scrollHeight,
      ch: (el as HTMLElement).clientHeight,
    }))
    expect(sh).toBe(ch)
  })
})

test.describe('desktop chrome — driver role @1440', () => {
  test('3 sidebar items render', async ({ page }) => {
    await loginAs(page, 'driver')

    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeVisible()

    const links = sidebar.getByRole('link')
    await expect(links).toHaveCount(3)

    await expect(sidebar.getByRole('link', { name: /my route/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /complaints/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /kudos/i })).toBeVisible()
  })
})

test.describe('desktop chrome — top bar @1440', () => {
  test('avatar dropdown: Logout enabled, Settings disabled', async ({ page }) => {
    await loginAs(page, 'sales')

    await page.getByRole('button', { name: /account menu/i }).click()

    const logout = page.getByRole('button', { name: /^logout$/i })
    await expect(logout).toBeVisible()
    await expect(logout).toBeEnabled()

    const settings = page.getByText(/^settings$/i)
    await expect(settings).toBeVisible()
    // Settings placeholder lives on a div[aria-disabled="true"] wrapper.
    const settingsRow = page.locator('[aria-disabled="true"]', { hasText: /^settings$/i })
    await expect(settingsRow).toBeVisible()
  })

  test('language pill: clicking TR sets aria-pressed correctly', async ({ page }) => {
    await loginAs(page, 'sales')

    const en = page.getByRole('button', { name: /switch to english/i })
    const tr = page.getByRole('button', { name: /switch to turkish/i })

    await tr.click()
    await expect(tr).toHaveAttribute('aria-pressed', 'true')
    await expect(en).toHaveAttribute('aria-pressed', 'false')

    await en.click()
    await expect(en).toHaveAttribute('aria-pressed', 'true')
    await expect(tr).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('desktop chrome — mobile regression', () => {
  test('viewport swap to 390 hides sidebar, shows BottomNav', async ({ page }) => {
    await loginAs(page, 'sales')

    // Switch to mobile viewport.
    await page.setViewportSize({ width: 390, height: 844 })
    // Brief wait for tailwind's responsive classes to take effect (layout reflow).
    await page.waitForTimeout(200)

    // Sidebar wrapper is hidden md:block — at 390 viewport it stays display:none.
    const sidebar = page.getByRole('complementary', { name: /primary navigation/i })
    await expect(sidebar).toBeHidden()

    // Mobile BottomNav (the original) is visible at the bottom.
    const bottomNav = page.getByRole('navigation', { name: /main navigation/i })
    await expect(bottomNav).toBeVisible()
  })
})
