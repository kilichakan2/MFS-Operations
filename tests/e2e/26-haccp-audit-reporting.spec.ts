/**
 * tests/e2e/26-haccp-audit-reporting.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive browser-tap E2E for F-19 PR8 (Cluster E reporting re-point).
 * There was NO prior E2E for the HACCP reporting screens — this fills the gap for
 * a critical food-safety section per Hakan's standing rule (full every-button tap
 * on a prod-build target). The 6 re-pointed reporting routes are now thin doormen
 * onto haccpReportingService (PR7, proved byte-identical). This spec drives the
 * SCREENS those routes feed, in a real Chromium browser:
 *
 *   /haccp                 — home dashboard: today-status tiles render (the
 *                            today-status route), every reporting nav reachable.
 *   /haccp/audit           — the big one: heatmap (audit/heatmap route), every one
 *                            of the 11 section selectors (audit?section route),
 *                            all 3 date presets, the heatmap collapse toggle, and
 *                            the master "Export All (XLSX)" DOWNLOAD (audit/export
 *                            route) — the downloaded file is opened and asserted to
 *                            be a 14-sheet workbook in the documented order.
 *   /haccp/annual-review   — data panel renders (annual-review/data route).
 *
 * Throughout, two listeners assert the doorman promise holds in the browser:
 *   • no uncaught console error
 *   • no 5xx response from any /api/haccp/* call
 * Any of those = the re-point broke something the unit/integration layers can't
 * see (a screen wiring mismatch). Byte-identical means zero such events.
 *
 * The audit + annual-review screens are admin-only → loginAsAdmin. The audit
 * "today-status" tiles on /haccp are role-gated to warehouse|butcher|admin; admin
 * is allowed, so the single admin session taps all three screens.
 *
 * Prereqs: db:up + db:reset (local prod build) OR a healthy seeded preview branch
 * (Gate 4 — npm run test:e2e:preview). Runs under --project=chromium.
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import * as XLSX from 'xlsx'
import { loginAsAdmin } from './_auth'

// The 11 audit section tabs (label substrings) — app/haccp/audit/page.tsx SECTIONS.
const SECTION_TABS = [
  'Deliveries',
  'Cold Storage',
  'Process Room',
  'Cleaning',
  'Calibration',
  'Mince & Prep',
  'Returns',
  'Corrective Actions',
  'Reviews',
  'Health',
  'Training',
]

// The 14 export tabs, in the documented order (mirrors the PR7 unit + the PR8
// integration suite — pinned a third time here, at the real browser download).
const EXPECTED_TABS = [
  '01 Deliveries',
  '02 Cold Storage',
  '03a Process Room Temps',
  '03b Process Room Diary',
  '04 Cleaning',
  '05 Calibration',
  '06 Mince & Prep',
  '07 Product Returns',
  '08 Corrective Actions',
  '09a Weekly Reviews',
  '09b Monthly Reviews',
  '10 Health & People',
  '11a Staff Training',
  '11b Allergen Training',
]

// ── /haccp HOME — enumerated from app/haccp/page.tsx HomeScreen ───────────────
// Every tile is wired to navigate away (window.location.href). To prove each
// tile component is MOUNTED + WIRED without leaving the screen (and without
// mutating anything), every tile carries a help-icon button with the
// accessible name "Help for <label>" that opens an in-page SOP slideout and a
// close (X) control. Tapping every help icon is the non-navigating,
// non-destructive every-button proof for the home grid. Labels mirror the
// <LargeTile>/<SmallTile> `label=` props exactly. "Audit" is admin-only.
const HOME_TILE_LABELS = [
  'Cold Storage',
  'Process Room',
  'Delivery',
  'Mince / Prep',
  'Product Return',
  'Cleaning',
  'Calibration',
  'Reviews',
  'People',
  'Training',
  'Allergens',
  'Recall Contacts',
  'Product Specs',
  'Food Fraud',
  'Food Defence',
  'Audit',
]

// Header / strip navigation buttons on /haccp home that LEAVE the HACCP screens
// (window.location.href). We assert each is present + enabled rather than
// deep-navigating away from every one — except "Sign out", which is
// intentionally NEVER clicked: it ends the admin session and would break every
// later test in the file. // non-destructive: Sign out not clicked (ends session)
const HOME_NAV_BUTTONS = [
  { name: /Documents/i, href: '/haccp/documents' },
  { name: /Admin panel/i, href: '/haccp/admin' },
]

/**
 * Attach console-error + 5xx listeners that collect violations. Returns a
 * getter for the accumulated problems so each test can assert "stayed clean".
 * Filters out benign favicon 404s and the well-known React DevTools console note.
 */
function watchForErrors(page: Page): () => string[] {
  const problems: string[] = []

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Benign noise: favicon, DevTools suggestion.
    if (/favicon|Download the React DevTools/i.test(text)) return
    problems.push(`console.error: ${text}`)
  }
  page.on('console', onConsole)

  page.on('response', (res) => {
    const url = res.url()
    if (res.status() >= 500 && /\/api\/haccp\//.test(url)) {
      problems.push(`5xx ${res.status()} from ${url}`)
    }
  })

  return () => problems
}

test.describe('@critical HACCP audit + reporting (F-19 PR8 re-point)', () => {
  // ── 1. /haccp home — today-status tiles render ──────────────────────────────

  test('home dashboard renders today-status tiles with no console error / no 5xx', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp')
    // The home screen tile grid mounts once the role cookie is read. The
    // "Audit" / record-review entry and the daily-check tiles share the grid;
    // wait for any HACCP tile to confirm the today-status fetch resolved.
    await expect(page.getByText(/Cold Storage/i).first()).toBeVisible({ timeout: 15_000 })

    // Give the today-status fetch a beat to settle, then assert clean.
    await page.waitForLoadState('networkidle')
    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 1b. /haccp home — tap EVERY tile's help icon (every-button proof) ────────
  // Each of the 16 tiles is wired to NAVIGATE on tap (window.location.href), so
  // tapping the tile body would leave the screen. The help icon on every tile
  // opens an in-page SOP slideout (no navigation, no mutation) and closes it —
  // proving every tile component mounted and its handler is wired, and that
  // opening every panel raises no console error / no 5xx.

  test('home dashboard — every tile help icon opens + closes with no console error / no 5xx', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp')
    await expect(page.getByText(/Cold Storage/i).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    for (const label of HOME_TILE_LABELS) {
      // Help icon accessible name is `Help for ${label}` (aria-label on the
      // <button> inside Large/SmallTile). Tap it → SOP slideout opens.
      const helpBtn = page.getByRole('button', { name: `Help for ${label}`, exact: true })
      await expect(helpBtn).toBeVisible()
      await helpBtn.click()

      // The SOP slideout mounts inside the `.z-50` overlay (HelpPanel). Several
      // small tiles intentionally share the same "people" SOP section, so the
      // panel content may repeat — what matters is the overlay opened and its
      // single close (X) control works. Wait for the overlay, then close it.
      const overlay = page.locator('.z-50')
      await expect(overlay).toBeVisible()
      // HelpPanel's only <button> is the close X (onClick → setHelp(null)).
      await overlay.locator('button').first().click()
      // Overlay must unmount before the next tile's help icon is tapped.
      await expect(page.locator('.z-50')).toHaveCount(0)
    }

    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 1c. /haccp home — navigation buttons present + enabled, reachable ────────
  // Header "Documents", admin-strip "Admin panel": assert present + enabled,
  // then deep-navigate each and confirm the destination mounts, returning to
  // /haccp between. "Sign out" is asserted present but NEVER clicked.
  // non-destructive: Sign out not clicked (would end the admin session).

  test('home dashboard — nav buttons present + enabled and destinations mount', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp')
    await expect(page.getByText(/Cold Storage/i).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // Sign out is present + enabled but intentionally not clicked.
    const signOut = page.getByRole('button', { name: /Sign out/i })
    await expect(signOut).toBeVisible()
    await expect(signOut).toBeEnabled()

    for (const nav of HOME_NAV_BUTTONS) {
      const btn = page.getByRole('button', { name: nav.name })
      await expect(btn).toBeVisible()
      await expect(btn).toBeEnabled()
      // Deep-navigate to confirm the destination mounts, then come back to
      // /haccp for the next button.
      await btn.click()
      await page.waitForURL(new RegExp(nav.href.replace('/', '\\/')), { timeout: 15_000 })
      // Destination mounted (URL changed + body present). Return home.
      await page.goto('/haccp')
      await expect(page.getByText(/Cold Storage/i).first()).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    }

    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 2. /haccp/audit — heatmap + every section tab + presets + export ────────

  test('audit screen — tap every section, both heatmap states, all 3 presets', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp/audit')
    await expect(page.getByRole('heading', { name: /Audit View/i })).toBeVisible({
      timeout: 15_000,
    })

    // Heatmap is open by default (audit/heatmap route already fired). Collapse +
    // re-expand the coverage heatmap.
    const heatmapToggle = page.getByRole('button', { name: /Coverage heatmap/i })
    await heatmapToggle.click() // collapse
    await heatmapToggle.click() // expand again

    // Tap all 3 date presets — each re-fires audit/heatmap + the active section.
    for (const preset of ['7 days', '30 days', '90 days']) {
      await page.getByRole('button', { name: preset, exact: true }).click()
      await page.waitForLoadState('networkidle')
    }

    // Tap every one of the 11 section selectors. Each click fires the
    // audit?section=<key> route and renders that section's table/summary.
    for (const label of SECTION_TABS) {
      // Section buttons combine label + a small sub tag (e.g. "Deliveries CCP 1");
      // match on the label substring.
      await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click()
      // Wait for the section's fetch to settle before the next tap.
      await page.waitForLoadState('networkidle')
      // The section content area must not show a hard error string.
      await expect(page.getByText(/Server error|Failed to load/i)).toHaveCount(0)
    }

    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 3. /haccp/audit — the master export DOWNLOAD is a 14-sheet workbook ──────

  test('audit export — "Export All (XLSX)" downloads a 14-sheet workbook in order', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp/audit')
    await expect(page.getByRole('heading', { name: /Audit View/i })).toBeVisible({
      timeout: 15_000,
    })

    // Trigger the real browser download and capture the file.
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: /Export All \(XLSX\)/i }).click()
    const download = await downloadPromise

    // Filename matches the route's Content-Disposition shape.
    expect(download.suggestedFilename()).toMatch(/^MFS_HACCP_Audit_.+\.xlsx$/)

    // Read the downloaded bytes and open as a workbook — assert 14 tabs in order.
    const path = await download.path()
    expect(path).toBeTruthy()
    const wb = XLSX.readFile(path!)
    expect(wb.SheetNames).toEqual(EXPECTED_TABS)
    expect(wb.SheetNames).toHaveLength(14)

    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 4. /haccp/annual-review — data panel renders ────────────────────────────

  test('annual-review screen renders with no console error / no 5xx', async ({ page }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp/annual-review')
    // The annual-review page lists reviews + a "+ New review" control; wait for
    // that unambiguous button to confirm the screen mounted + data fetch ran.
    await expect(
      page.getByRole('button', { name: /New review/i }),
    ).toBeVisible({ timeout: 15_000 })

    await page.waitForLoadState('networkidle')
    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })

  // ── 4b. /haccp/annual-review — tap interactive controls (non-destructive) ────
  // Enumerated from app/haccp/annual-review/page.tsx AnnualReviewPage (list
  // view). Interactive controls and how each is exercised WITHOUT writing to
  // the shared preview DB:
  //   • "+ New review"   → OPEN modal, assert it rendered (year/period fields +
  //                        "Start review"), then CANCEL. // non-destructive:
  //                        "Start review" (POST create) is never clicked.
  //   • each review row  → openReview() switches to the in-page editing view
  //                        (no mutation). We open the first row, confirm the
  //                        editing view mounted, expand one section card
  //                        (collapsible — no save), then go Back. The OK/NA/
  //                        Action item buttons, Action Plan status toggles and
  //                        Sign off all auto-save / mutate, so they are NOT
  //                        clicked. // non-destructive: editing-view save
  //                        controls (PATCH) not clicked.
  //   • Back chevron     → returns to /haccp; asserted reachable.

  test('annual-review — New review modal opens + cancels, a review opens read-only', async ({
    page,
  }) => {
    const getProblems = watchForErrors(page)
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    await page.goto('/haccp/annual-review')
    const newReviewBtn = page.getByRole('button', { name: /New review/i })
    await expect(newReviewBtn).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // ── "+ New review" → modal opens → assert rendered → Cancel (no create) ──
    await newReviewBtn.click()
    // Modal heading + the create submit confirm it mounted.
    await expect(page.getByText(/New annual review/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Start review/i })).toBeVisible()
    // Cancel closes the modal WITHOUT creating a review. // non-destructive.
    await page.getByRole('button', { name: /^Cancel$/i }).click()
    await expect(page.getByText(/New annual review/i)).toHaveCount(0)

    // ── A review row → open read-only, expand a section, go back ─────────────
    // The seeded preview may or may not have an existing review. If one exists,
    // open it (no mutation) and confirm the editing view mounted; otherwise the
    // "no reviews yet" empty state is the expected render.
    const reviewRows = page.getByRole('button', { name: /Draft|Signed off/i })
    const rowCount = await reviewRows.count()
    if (rowCount > 0) {
      await reviewRows.first().click()
      // Editing view header shows "<year>  Draft|Signed off" + sections counter.
      await expect(page.getByText(/\d+\/\d+ sections/i)).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')

      // Expand the first collapsible SectionCard header (toggles open state only
      // — no save fires until an item status is set, which we do NOT do).
      const sectionHeaders = page.locator('button:has-text("items answered")')
      if (await sectionHeaders.count() > 0) {
        await sectionHeaders.first().click()
        await page.waitForLoadState('networkidle')
      }

      // Back chevron returns to the list view (setView('list')). It's the first
      // header button with the chevron-left icon.
      await page.locator('.bg-white.border-b button').first().click()
      await expect(page.getByRole('button', { name: /New review/i })).toBeVisible({
        timeout: 15_000,
      })
    } else {
      await expect(page.getByText(/No annual reviews yet/i)).toBeVisible()
    }

    expect(getProblems(), getProblems().join('\n')).toEqual([])
  })
})
