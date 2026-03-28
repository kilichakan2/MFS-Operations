/**
 * tests/e2e/route-manager.spec.ts
 *
 * Playwright E2E tests for Sprint 3 — Route Manager (/runs).
 *
 * Prerequisites to run locally:
 *   npx playwright install chromium
 *   npm run dev          (in a separate terminal, or use webServer config below)
 *   npx playwright test  (in the project root)
 *
 * These tests use a real browser against the running dev server.
 * They require a logged-in admin session — the LOGIN_PIN env var
 * must match a real admin PIN in the database.
 *
 * Run with:
 *   LOGIN_PIN=your_admin_pin npx playwright test tests/e2e/route-manager.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

const BASE_URL  = process.env.BASE_URL  ?? 'http://localhost:3000'
const LOGIN_PIN = process.env.LOGIN_PIN ?? ''

// ── Login helper ─────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  // Select "Team login"
  await page.getByRole('button', { name: /team/i }).click()
  // Select admin role
  await page.getByRole('button', { name: /admin/i }).click()
  // Enter PIN
  await page.getByLabel(/password|pin/i).fill(LOGIN_PIN)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  // Wait for redirect to admin home (/screen4)
  await page.waitForURL('**/screen4', { timeout: 10_000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Route Manager — /runs', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // ── Visibility ──────────────────────────────────────────────────────────────

  test('Admin can navigate to /runs via nav tab', async ({ page }) => {
    // Click the "Runs" tab in the bottom/desktop nav
    await page.getByRole('link', { name: /runs/i }).click()
    await page.waitForURL('**/runs', { timeout: 5_000 })
    // The week label and route count should be visible
    await expect(page.getByText(/route/i)).toBeVisible()
  })

  test('/runs page shows week navigator with ← and → buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/runs`)
    const prevBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
    await expect(prevBtn).toBeVisible()
  })

  // ── Edit flow ───────────────────────────────────────────────────────────────

  test('Clicking Edit button navigates to Route Planner with ?editId= param', async ({ page }) => {
    await page.goto(`${BASE_URL}/runs`)

    // Find the first Edit link (there may be no routes — skip test if none)
    const editLink = page.getByRole('link', { name: /^edit$/i }).first()
    const count = await editLink.count()
    if (count === 0) {
      test.skip(true, 'No routes in current week — create a route first')
      return
    }

    // Get the href to confirm it contains ?editId=
    const href = await editLink.getAttribute('href')
    expect(href).toMatch(/\/routes\?editId=/)

    await editLink.click()
    await page.waitForURL('**/routes?editId=**', { timeout: 5_000 })

    // Edit mode banner must be visible
    await expect(page.getByText(/editing existing route/i)).toBeVisible({ timeout: 8_000 })

    // Save button must say "Update Route" not "Save & Assign"
    await expect(page.getByRole('button', { name: /update route/i })).toBeVisible({ timeout: 8_000 })

    // "Back to Runs" link must be visible in the banner
    await expect(page.getByRole('button', { name: /back to runs/i })
      .or(page.getByText(/back to runs/i))).toBeVisible()
  })

  // ── Delete flow ─────────────────────────────────────────────────────────────

  test('Clicking trash icon shows inline delete confirmation', async ({ page }) => {
    await page.goto(`${BASE_URL}/runs`)

    // Find the first trash/delete button — it has title="Delete route" on desktop
    const trashBtn = page.locator('button[title="Delete route"]').first()
    const count = await trashBtn.count()
    if (count === 0) {
      // Mobile: no title attr — find by svg path (trash icon)
      const anyTrash = page.locator('button').filter({
        has: page.locator('svg path[d*="M6.5 1h3"]'),
      }).first()
      if (await anyTrash.count() === 0) {
        test.skip(true, 'No routes in current week — create a route first')
        return
      }
      await anyTrash.click()
    } else {
      await trashBtn.click()
    }

    // Inline confirm text must appear
    await expect(page.getByText(/delete.*route\?|delete this route/i)).toBeVisible()
    // Yes/Delete and No/Cancel buttons must appear
    await expect(page.getByRole('button', { name: /^yes$|^delete$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^no$|^cancel$/i }).first()).toBeVisible()
  })

  test('Cancelling delete confirmation hides the confirm UI', async ({ page }) => {
    await page.goto(`${BASE_URL}/runs`)

    const trashBtn = page.locator('button[title="Delete route"]').first()
    if (await trashBtn.count() === 0) {
      test.skip(true, 'No routes in current week')
      return
    }

    await trashBtn.click()
    await expect(page.getByText(/delete.*route\?|delete this route/i)).toBeVisible()

    // Click Cancel / No
    await page.getByRole('button', { name: /^no$|^cancel$/i }).first().click()

    // Confirm text should disappear
    await expect(page.getByText(/delete.*route\?|delete this route/i)).not.toBeVisible()
  })
})

// ── Routing engine guard ──────────────────────────────────────────────────────

test.describe('Route Planner — edit mode guard', () => {

  test('Visiting /routes without ?editId shows "Route Planner" title', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/routes`)
    await expect(page.getByText('Route Planner')).toBeVisible({ timeout: 5_000 })
    // No edit banner should be visible
    await expect(page.getByText(/editing existing route/i)).not.toBeVisible()
  })
})
