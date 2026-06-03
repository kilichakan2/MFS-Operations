/**
 * tests/e2e/dashboard-admin-restyle.spec.ts
 *
 * Structural assertions for the /dashboard/admin restyle (UI overhaul
 * Item 5a). Verifies the surface that the chrome matrix doesn't —
 * the existence and identity of the KPI tiles, range tabs, donut
 * chart, AppHeader title, Orders KPI tap-through, the 6-card grid,
 * and the 3 stat blocks.
 *
 * Scope notes:
 *   - KPI tiles are <Link> elements, so getByRole('link') uniquely
 *     identifies them even when their label text repeats elsewhere
 *     on the page (e.g. the Open complaints card section header).
 *   - The HACCP shortcut + Refresh button live in the AppHeader's
 *     `actions` prop, which the chrome only renders on mobile
 *     viewport (md:hidden). The chrome matrix already covers their
 *     mobile presence. Here we verify the chrome's page title
 *     wiring instead (works at any viewport).
 *   - The Complaint categories donut hides entirely when there are
 *     no complaints in the current window (Q14). The card-grid and
 *     donut tests both tolerate that empty state.
 *
 * Deliberately NOT covered: exact data values, mobile-vs-desktop
 * layout deltas, donut segment count / colour, empty-state hiding
 * specifics (dev smoke + Vercel preview).
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('Dashboard admin restyle (Item 5a) — structural', () => {

  test.beforeEach(async ({ page }) => {
    const user = process.env.E2E_USER_ADMIN
    const pwd  = process.env.E2E_PASSWORD_ADMIN
    if (!user || !pwd) {
      throw new Error(
        'MISSING_CREDS: E2E_USER_ADMIN and/or E2E_PASSWORD_ADMIN not set in .env.e2e.local.',
      )
    }
    await loginAsAdmin(page, user, pwd)
    await page.goto('/dashboard/admin', { waitUntil: 'networkidle' })
  })

  // ── 1. KPI tiles ─────────────────────────────────────────────────────────

  test('renders all 5 KPI tile links', async ({ page }) => {
    // Each KPI tile is a Link with the label text inside its
    // accessible name. Selecting by role disambiguates from any
    // CardHead title that uses the same wording further down the
    // page (e.g. the Open complaints card).
    await expect(page.getByRole('link', { name: /^Open complaints/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Visits/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Discrepancies/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Active pricing/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Orders today/ })).toBeVisible()
  })

  // ── 2. Page heading — eyebrow yes, H1 no ──────────────────────────────────

  test('shows the eyebrow page heading without a duplicate H1', async ({ page }) => {
    await expect(page.getByText('Admin · Daily glance', { exact: false })).toBeVisible()
    // No <h1> in the page body. The chrome AppHeader renders the
    // page title as a <span>, not an <h1>, so a heading-level
    // selector scoped to <main> is sufficient.
    expect(await page.locator('main h1').count()).toBe(0)
  })

  // ── 3. Range tabs ─────────────────────────────────────────────────────────

  test('renders 4 RangeTabs and toggles active state on click', async ({ page }) => {
    const today    = page.getByRole('button', { name: /^Today$/ })
    const week     = page.getByRole('button', { name: /^This week$/ })
    const month    = page.getByRole('button', { name: /^This month$/ })
    const quarter  = page.getByRole('button', { name: /^This quarter$/ })

    await expect(today).toBeVisible()
    await expect(week).toBeVisible()
    await expect(month).toBeVisible()
    await expect(quarter).toBeVisible()

    await expect(today).toHaveAttribute('aria-pressed', 'true')

    await week.click()
    await expect(week).toHaveAttribute('aria-pressed', 'true')
    await expect(today).toHaveAttribute('aria-pressed', 'false')

    await quarter.click()
    await expect(quarter).toHaveAttribute('aria-pressed', 'true')
    await expect(week).toHaveAttribute('aria-pressed', 'false')
  })

  // ── 4. Donut chart (skip when card hides on empty data, per Q14) ──────────

  test('complaint-categories donut renders with at least one segment when data exists', async ({ page }) => {
    const heading = page.getByText('Complaint categories', { exact: false }).first()
    if (await heading.count() === 0) {
      test.skip(true, 'No complaint categories in current window — Q14 hides the donut; covered by dev smoke')
    }
    // Find the donut <svg> by locating an svg within the same card.
    const card = page.locator('div').filter({ has: heading }).first()
    const svg  = card.locator('svg').first()
    await expect(svg).toBeVisible()
    const segments = svg.locator('path[d]')
    expect(await segments.count()).toBeGreaterThan(0)
  })

  // ── 5. AppHeader page title wired through actions slot (Q8 indirect) ──────

  test('AppHeader carries the "Dashboard" page title', async ({ page }) => {
    // The HACCP + Refresh buttons live in the AppHeader's `actions`
    // prop, which the chrome only renders on mobile viewport
    // (`md:hidden`). Their byte-identical preservation is verified
    // by code-critic at Gate 3 + the chrome matrix's mobile clearance
    // assertions on /dashboard/admin. Here we just verify the
    // AppHeader component itself is wired and renders the title
    // ("Dashboard" — works at any viewport).
    const banner = page.getByRole('banner').first()
    await expect(banner).toBeVisible()
    await expect(banner.getByText('Dashboard', { exact: false }).first()).toBeVisible()
  })

  // ── 6. Orders KPI tap-through ───────────────────────────────────────────────

  test('Orders KPI tile taps through to /orders', async ({ page }) => {
    const ordersTile = page.getByRole('link', { name: /^Orders today/ })
    await expect(ordersTile).toBeVisible()
    await ordersTile.click()
    await page.waitForURL('**/orders', { timeout: 5_000 })
    // We don't assert page contents — /orders is paused, that's fine.
    expect(page.url()).toMatch(/\/orders(\?|#|$)/)
  })

  // ── 7. Card grid (6 cards; Complaint categories optional per Q14) ──────────

  test('renders the operational card section headers', async ({ page }) => {
    const headers = [
      { name: 'Open complaints',         required: true  },
      { name: 'At-risk accounts',        required: true  },
      { name: 'Unreviewed commitments',  required: true  },
      { name: 'Prospects this week',     required: true  },
      { name: 'Visits by rep',           required: true  },
      // The complaint-categories donut hides when total === 0 per
      // Q14. Treat as optional — its presence-with-data is asserted
      // by test 4.
      { name: 'Complaint categories',    required: false },
    ]
    for (const h of headers) {
      const hits = await page.getByText(h.name, { exact: false }).count()
      if (h.required) {
        expect(hits, `expected the "${h.name}" card header to render`).toBeGreaterThan(0)
      } else if (hits === 0) {
        // Empty-state hide. Acceptable per Q14.
      }
    }
  })

  // ── 8. Stat blocks (3) ──────────────────────────────────────────────────────

  test('renders all 3 stat block labels', async ({ page }) => {
    await expect(page.getByText('Hunter / farmer ratio',  { exact: false })).toBeVisible()
    await expect(page.getByText('Avg. resolution',         { exact: false })).toBeVisible()
    await expect(page.getByText('Complaints this week',    { exact: false })).toBeVisible()
  })
})
