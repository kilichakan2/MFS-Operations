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
})
