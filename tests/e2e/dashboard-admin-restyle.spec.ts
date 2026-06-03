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
    // After PR B C9 the 6 list cards also became <Link> elements,
    // so several KPI labels now match more than one link on the
    // page (e.g. "Visits" matches the KPI tile AND the "Visits by
    // rep" card). KPI tiles render above cards — `.first()` picks
    // the KPI consistently.
    await expect(page.getByRole('link', { name: /^Open complaints/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Visits/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Discrepancies/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Active pricing/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^Orders today/ }).first()).toBeVisible()
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

  // ── 6. KPI tap-through destinations ─────────────────────────────────────────

  test('Open complaints KPI taps through to /complaints?status=open', async ({ page }) => {
    // `.first()` disambiguates from the Open complaints CARD that
    // also rendered as a Link after PR B C9 (lower in the DOM).
    await page.getByRole('link', { name: /^Open complaints/ }).first().click()
    await page.waitForURL('**/complaints?status=open', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/complaints\?status=open(&|#|$)/)
  })

  test('Visits KPI taps through to /admin/visits?range={preset} (Item 5a.1 PR B amendment)', async ({ page }) => {
    // Switch preset away from default so we cover the dynamic href.
    await page.getByRole('button', { name: /^This week$/ }).click()
    await page.getByRole('link', { name: /^Visits/ }).first().click()
    await page.waitForURL('**/admin/visits?range=week', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/visits\?range=week(&|#|$)/)
  })

  test('Discrepancies KPI taps through to /admin/discrepancies?range={preset} (Item 5a.1 PR B amendment)', async ({ page }) => {
    await page.getByRole('link', { name: /^Discrepancies/ }).first().click()
    await page.waitForURL('**/admin/discrepancies?range=today', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/discrepancies\?range=today(&|#|$)/)
  })

  test('Active pricing KPI taps through to /pricing?filter=active', async ({ page }) => {
    await page.getByRole('link', { name: /^Active pricing/ }).first().click()
    await page.waitForURL('**/pricing?filter=active', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/pricing\?filter=active(&|#|$)/)
  })

  test('Orders KPI tile taps through to /orders', async ({ page }) => {
    const ordersTile = page.getByRole('link', { name: /^Orders today/ }).first()
    await expect(ordersTile).toBeVisible()
    await ordersTile.click()
    await page.waitForURL('**/orders', { timeout: 5_000 })
    // We don't assert page contents — /orders is paused, that's fine.
    expect(page.url()).toMatch(/\/orders(\?|#|$)/)
  })

  // ── Item 5a.1 PR B C9 — 6 cards become clickable ──────────────────────────

  test('Open complaints card taps through to /complaints?status=open&tab=all', async ({ page }) => {
    // Both the KPI tile and the card carry "Open complaints"; the
    // card is the later Link in the DOM. `.last()` picks it.
    await page.locator('a', { hasText: 'Open complaints' }).last().click()
    await page.waitForURL(/\/complaints\?(status=open&tab=all|tab=all&status=open)/, { timeout: 5_000 })
    expect(page.url()).toMatch(/\/complaints\?(status=open(&tab=all)?|tab=all&status=open)/)
  })

  test('At-risk accounts card taps through to /admin/at-risk', async ({ page }) => {
    await page.locator('a', { hasText: 'At-risk accounts' }).first().click()
    await page.waitForURL('**/admin/at-risk', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/at-risk(\?|#|$)/)
  })

  test('Unreviewed commitments card taps through to /admin/commitments', async ({ page }) => {
    await page.locator('a', { hasText: 'Unreviewed commitments' }).first().click()
    await page.waitForURL('**/admin/commitments', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/commitments(\?|#|$)/)
  })

  test('Prospects this week card taps through to /admin/prospects', async ({ page }) => {
    await page.locator('a', { hasText: 'Prospects this week' }).first().click()
    await page.waitForURL('**/admin/prospects', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/prospects(\?|#|$)/)
  })

  test('Visits by rep card taps through to /admin/visits', async ({ page }) => {
    await page.locator('a', { hasText: 'Visits by rep' }).first().click()
    await page.waitForURL('**/admin/visits', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/admin\/visits(\?|#|$)/)
  })

  test('Complaint categories card taps through to /complaints?tab=all (when rendered)', async ({ page }) => {
    const card = page.locator('a', { hasText: 'Complaint categories' }).first()
    if (await card.count() === 0) {
      test.skip(true, 'Complaint categories card hides on empty data per Q14 — tap-through not assertable')
    }
    await card.click()
    await page.waitForURL('**/complaints?tab=all', { timeout: 5_000 })
    expect(page.url()).toMatch(/\/complaints\?tab=all(&|#|$)/)
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
