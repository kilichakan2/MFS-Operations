/**
 * tests/e2e/13-haccp-cold-storage.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives Cold Storage
 * (CCP 2) in a real Chromium browser against the LOCAL Supabase stack, proving the
 * re-pointed POST /api/haccp/cold-storage works end-to-end:
 *
 *   1. Happy path     — AM session, tap each of the 5 seeded unit cards, enter an
 *                       in-range temperature via the Numpad, add a comment, submit
 *                       → "Session submitted".
 *   2. Deviation path — one chiller reading CRITICAL (>8°C) opens the CCAPopup;
 *                       pick cause/disposition/recurrence → "Confirm corrective
 *                       action & submit" → success. A CRITICAL reading sets
 *                       management_verification_required=true (service line 1136),
 *                       so the CA lands in the admin queue → asserted as admin.
 *
 * Screen facts (app/haccp/cold-storage/page.tsx, read 2026-06-23):
 *   - Session selector buttons: "AM" / "PM".
 *   - The 5 unit cards each show the unit name (e.g. "Lamb Chiller") + a subtitle
 *     "Target ≤5°C · Max 8°C"; tapping the card opens the Numpad for that unit.
 *   - Numpad digit buttons carry the bare digit ("5"); freezer units also show a
 *     "-" toggle. Confirm button: "Confirm <v>°C".
 *   - Chiller: ≤5 pass, 5–8 amber, >8 critical. Freezer: ≤-18 pass, -18..-15 amber,
 *     >-15 critical. Comments placeholder: "Comments (optional)…".
 *   - Submit: "Submit AM check" (→ "Submitting…"). Success state shows the text
 *     "Session submitted".
 *   - CCAPopup opens whenever any reading is non-pass. Header "Corrective Action
 *     Required"; labels "What caused this?" / "Product disposition" / "Recurrence
 *     prevention"; confirm "Confirm corrective action & submit".
 *   - The 5 units are planted by supabase/seed.sql (Lamb/Beef/Dispatch/Dairy
 *     chillers + Main Freezer) — without them the form cannot render or submit.
 *
 * The on-screen reading cards do NOT render the comments field, so the deviation
 * proof goes via the admin queue (a critical reading) and the happy path via the
 * "Session submitted" success state. A unique MARKER rides in the comments (stored,
 * for audit) but the deviation CA's queue card is matched by the unit name +
 * deviation text.
 *
 * Prereqs: npm run db:up + db:reset (seeds the 5 units); .env.e2e.local with
 * warehouse PIN/user + admin password. Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

const CHILLERS = ['Lamb Chiller', 'Beef Chiller', 'Dispatch Chiller', 'Dairy Chiller']
const FREEZER = 'Main Freezer'

// Tap a unit card by its name, enter a temperature on the Numpad, confirm.
// `negative` toggles the +/- key (freezer readings are negative). The Numpad
// pre-fills any existing reading for the session, so clear it first (backspace
// up to 6 times) before typing — otherwise a re-run/retry appends to the old
// value (e.g. "4" + "12" → "412").
async function readUnit(page: Page, unit: string, temp: string, negative = false) {
  await page.getByText(unit, { exact: true }).click()
  // Clear any pre-filled value via the backspace — the LAST button inside the
  // 3-col digit grid (the Confirm button sits OUTSIDE the grid, so scope to it).
  const grid = page.locator('div.grid.grid-cols-3')
  for (let i = 0; i < 6; i++) {
    await grid.getByRole('button').last().click()
  }
  for (const ch of temp) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  if (negative) {
    await page.getByRole('button', { name: '-', exact: true }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

// Select a session AFTER the initial load has settled, and report whether it
// is already submitted (read-only). The page's `loadReadings` fetch runs
// client-side on mount, so a session click fired before it resolves races the
// render: the "already submitted" banner isn't up yet, a naive isVisible guard
// misses it, and the spec ploughs into a read-only page (no comments field / no
// Submit) → 30s timeout. Cold storage is once-per-session-per-day and the
// SHARED preview DB is never reset between runs, so a session stays read-only
// after the first submit. Waiting for the units to render before choosing the
// session removes the race and makes the outcome deterministic.
async function enterSession(page: Page, session: 'AM' | 'PM'): Promise<'editable' | 'readonly'> {
  await expect(page.getByText('Lamb Chiller', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: session, exact: true }).click()
  const banner = page.getByText(new RegExp(`${session} check already submitted`, 'i'))
  const submit = page.getByRole('button', { name: new RegExp(`^Submit ${session} check$`) })
  await expect(banner.or(submit)).toBeVisible({ timeout: 10_000 })
  return (await banner.isVisible()) ? 'readonly' : 'editable'
}

test.describe('@critical HACCP cold storage (F-19 PR2 re-point)', () => {
  test('happy path — all 5 units in range submit successfully', async ({ page }) => {
    const MARKER = `E2E-CS-OK-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await expect(page).toHaveURL(/\/haccp\/cold-storage/)

    // If AM was already submitted on the shared preview DB, the read-only
    // banner itself proves the session recorded — assert it and stop. Checked
    // BEFORE driving the form (race-proof) so a read-only page can't strand the
    // spec on a missing comments field / Submit button.
    if ((await enterSession(page, 'AM')) === 'readonly') {
      await expect(page.getByText(/AM check already submitted/i)).toBeVisible()
      return
    }

    // 4 chillers at 4°C (≤5 pass), freezer at -20°C (≤-18 pass).
    for (const c of CHILLERS) {
      await readUnit(page, c, '4')
    }
    await readUnit(page, FREEZER, '20', /* negative */ true)

    await page.getByPlaceholder(/comments \(optional\)/i).fill(`${MARKER} all good`)
    await page.getByRole('button', { name: /^Submit AM check$/ }).click()

    await expect(page.getByText(/session submitted/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('deviation path — a critical chiller reading raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    const MARKER = `E2E-CS-DEV-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')

    // PM session — independent of the happy-path test's AM readings, so no
    // pre-filled values collide on a same-DB re-run. Only drive the form if PM
    // hasn't already been submitted on a prior run (in which case the critical
    // CA already exists and the queue check below still proves the re-point).
    // enterSession waits for load first, so this can't race into a read-only
    // page and strand on a missing comments field / Submit button.
    if ((await enterSession(page, 'PM')) === 'editable') {
      // Lamb Chiller CRITICAL at 12°C (>8 → critical → management queue). The
      // other 3 chillers + freezer stay in range so only one deviation is raised.
      await readUnit(page, 'Lamb Chiller', '12')
      await readUnit(page, 'Beef Chiller', '4')
      await readUnit(page, 'Dispatch Chiller', '4')
      await readUnit(page, 'Dairy Chiller', '4')
      await readUnit(page, FREEZER, '20', true)

      await page.getByPlaceholder(/comments \(optional\)/i).fill(`${MARKER}`)
      // Submit opens the CCAPopup because a reading is non-pass.
      await page.getByRole('button', { name: /^Submit PM check$/ }).click()

      await expect(page.getByText(/corrective action required/i)).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: /equipment failure/i }).click()
      // Disposition + recurrence (Equipment failure offers Assess/Conditional/Reject).
      await page.getByRole('button', { name: /^Assess$/ }).click()
      await page
        .getByRole('button', { name: /contact refrigeration engineer/i })
        .click()
      await page
        .getByRole('button', { name: /confirm corrective action & submit/i })
        .click()

      await expect(page.getByText(/session submitted/i)).toBeVisible({
        timeout: 10_000,
      })
    }

    // Admin queue must show the critical Lamb Chiller deviation. The queue card
    // body is the deviation_description: "Lamb Chiller: 12°C (critical). Cause: …".
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')

    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Lamb Chiller: 12°C \(critical\)/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })
})
