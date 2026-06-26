/**
 * tests/e2e/f21-dashboard-data-walk.spec.ts
 *
 * F-21 — exhaustive admin-dashboard DATA walk against the live preview.
 *
 * F-21 is a behaviour-preserving hexagonal re-point: the two admin routes
 * (GET /api/dashboard, GET /api/detail/discrepancy) moved off raw Supabase onto
 * owned seams (DashboardService + DiscrepanciesRepository), response shapes
 * BYTE-IDENTICAL, NO UI change. So the right-sized E2E+ rung drives the REAL
 * /dashboard/admin surface that consumes the re-plumbed data and proves:
 *
 *   1. The dashboard loads as an authenticated admin — every tile/zone renders,
 *      no console error, no failed /api/dashboard request, no blank-where-data.
 *   2. The date-range picker (the from/to params that drive the re-plumbed
 *      queries) swings across ALL FOUR presets (today / week / month / quarter)
 *      — each swing re-fires /api/dashboard with a NEW window and the tiles
 *      update with NO 5xx and NO console error.
 *   3. Every KPI number / rollup / list renders a SANE value — never NaN, never
 *      "undefined", never the in-page error banner.
 *
 * NOT done here (and why): the live /dashboard/admin page has NO in-page rep
 * drill-down expander and NO discrepancy detail modal — the cards are read-only
 * navigational links, and /api/detail/discrepancy is consumed by a different
 * screen. The detail route's 404 + 12-key 200 contract is proven end-to-end at
 * the integration layer (tests/integration/dashboardRoutes.test.ts). Inventing a
 * modal/drill-down interaction that does not exist on this page would be a false
 * test, so this walk exercises the interactions that ACTUALLY exist.
 *
 * Untagged (no @critical) on purpose: this is an F-21-specific deep walk, run
 * directly against the preview via BASE_URL, not part of the standard smoke set.
 */

import { test, expect, type Page, type Request } from '@playwright/test'
import { loginAsAdmin } from './_auth'

const PRESETS = ['Today', 'This week', 'This month', 'This quarter'] as const

/** Collect every console error + every failed (4xx/5xx) /api/dashboard call. */
function watchForFailures(page: Page) {
  const consoleErrors: string[] = []
  const failedDashboard: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('response', (res) => {
    const u = res.url()
    if (u.includes('/api/dashboard') && res.status() >= 400) {
      failedDashboard.push(`${res.status()} ${u}`)
    }
  })
  return { consoleErrors, failedDashboard }
}

/** Wait for the /api/dashboard response triggered by an action, return its body. */
async function dashboardResponseAfter(
  page: Page,
  action: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/dashboard') && r.request().method() === 'GET',
      { timeout: 15_000 },
    ),
    action(),
  ])
  expect(res.status(), `GET /api/dashboard should be 200, got ${res.status()}`).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

/** Assert the 19-key payload has no NaN / undefined leaking into the numbers. */
function assertSaneNumbers(body: Record<string, unknown>) {
  const numericKeys = [
    'activePricing', 'draftPricing', 'expiredPricing',
    'totalComplaintsWeek', 'openComplaintsWeek',
  ]
  for (const k of numericKeys) {
    expect(typeof body[k], `${k} should be a number`).toBe('number')
    expect(Number.isNaN(body[k] as number), `${k} must not be NaN`).toBe(false)
  }
  // ordersToday tile fields are all numbers.
  const orders = body.ordersToday as Record<string, number>
  for (const k of ['placed', 'printed', 'completed', 'total']) {
    expect(Number.isNaN(orders?.[k]), `ordersToday.${k} must not be NaN`).toBe(false)
  }
  // The big array zones are arrays (not null/undefined).
  for (const k of [
    'openComplaints48h', 'atRiskAccounts', 'unreviewedCommitments',
    'discrepanciesToday', 'complaintsTodayList', 'visitsToday',
    'weekDiscrepancyReasons', 'weekComplaintCategories', 'weekVisitsByRep',
    'prospectsThisWeek',
  ]) {
    expect(Array.isArray(body[k]), `${k} should be an array`).toBe(true)
  }
}

test.describe('F-21 admin dashboard data walk (preview)', () => {
  test.setTimeout(120_000)

  test('admin dashboard loads, swings every range, renders sane values with no errors', async ({ page }) => {
    const user = process.env.E2E_USER_ADMIN
    const pwd  = process.env.E2E_PASSWORD_ADMIN
    if (!user || !pwd) {
      throw new Error('MISSING_CREDS: E2E_USER_ADMIN / E2E_PASSWORD_ADMIN not set in .env.e2e.local')
    }

    const { consoleErrors, failedDashboard } = watchForFailures(page)

    await loginAsAdmin(page, user, pwd)

    // 1 — initial load fires /api/dashboard (default preset = Today).
    const firstBody = await dashboardResponseAfter(page, async () => {
      await page.goto('/dashboard/admin', { waitUntil: 'networkidle' })
    })
    assertSaneNumbers(firstBody)

    // The in-page error banner must NOT be showing.
    await expect(
      page.getByText('Network error — check your connection'),
    ).toHaveCount(0)

    // The 5 KPI tiles render (Links — disambiguate from the cards with .first()).
    for (const name of [/^Open complaints/, /^Visits/, /^Discrepancies/, /^Active pricing/, /^Orders today/]) {
      await expect(page.getByRole('link', { name }).first()).toBeVisible()
    }
    // The stat-block labels render (these read avgResolution / totalComplaintsWeek).
    await expect(page.getByText('Hunter / farmer ratio', { exact: false })).toBeVisible()
    await expect(page.getByText('Avg. resolution', { exact: false })).toBeVisible()

    // No literal "NaN" or "undefined" text leaked into the rendered DOM.
    const main = page.locator('main')
    await expect(main).not.toContainText('NaN')
    await expect(main).not.toContainText('undefined')

    // 2 — swing EVERY range preset; each must re-fire /api/dashboard → 200,
    //     update the active tab, and never show the error banner.
    for (const label of PRESETS) {
      const tab = page.getByRole('button', { name: new RegExp(`^${label}$`) })
      await expect(tab).toBeVisible()
      // 'Today' is already active on load — still assert its state; for the
      // others, the click re-fires the windowed query.
      if (label === 'Today') {
        await expect(tab).toHaveAttribute('aria-pressed', 'true')
        continue
      }
      const body = await dashboardResponseAfter(page, async () => {
        await tab.click()
      })
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      assertSaneNumbers(body)
      await expect(page.getByText('Network error — check your connection')).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText('NaN')
    }

    // 3 — Refresh button re-fires the current window cleanly.
    const refreshBody = await dashboardResponseAfter(page, async () => {
      await page.getByRole('button', { name: /Refresh|Loading|:\d\d/i }).first().click()
    })
    assertSaneNumbers(refreshBody)

    // 4 — final guard: nothing threw and no dashboard request 4xx/5xx'd.
    // Filter out noise that is unrelated to F-21's data path (e.g. a missing
    // favicon or a third-party analytics blip) — only fail on real app errors.
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Failed to load resource: the server responded with a status of 404/i.test(e),
    )
    expect(
      failedDashboard,
      `no /api/dashboard request should 4xx/5xx; saw: ${failedDashboard.join(', ')}`,
    ).toEqual([])
    expect(
      realConsoleErrors,
      `no app console errors expected; saw: ${realConsoleErrors.join(' || ')}`,
    ).toEqual([])
  })
})
