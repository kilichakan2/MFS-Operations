/**
 * tests/e2e/16-haccp-process-room.spec.ts
 *
 * @critical
 *
 * E2E for the /haccp/process-room screen (CCP 3 + SOP 1). Drives the rebuilt,
 * design-system screen in a real Chromium browser against the LOCAL Supabase
 * stack, proving the DB-driven-band POST /api/haccp/process-room works end-to-end:
 *
 *   1. Temps happy     — AM session, product core ≤ target + room ≤ target via the
 *                        kit NumberPad, submit → the session locks (read-only).
 *   2. Diary phase     — open "Operational checks", tick every item, issues = No,
 *                        submit → the phase flips to Done.
 *   3. Temps deviation — room CRITICAL (>max) opens the CCA sheet; pick
 *                        cause/disposition/recurrence → the CA lands in the admin
 *                        queue (management_verification_required=true for critical).
 *
 * RACE-PROOF against a never-reset shared preview DB (BACKLOG F-INFRA-08): the
 * client `loadData` fetch (which now also loads the DB thresholds) runs on mount,
 * so the temp tiles / diary cards only render once it resolves. `enterTempSession`
 * and `enterDiaryPhase` WAIT for that render before selecting, then race the
 * "submitted"/"Done" state against the editable Submit control — a session/phase
 * is once-per-(date,session/phase), so after the first run it stays read-only and
 * the spec early-returns gracefully instead of stranding on a missing Submit.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user +
 * admin password. Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

const PHASE_LABEL = {
  opening: 'Opening checks',
  operational: 'Operational checks',
  closing: 'Closing checks',
} as const

// Operational phase checklist (verbatim from CHECKS.operational).
const OPERATIONAL_ITEMS = [
  'Products being processed within temperature limits',
  'Cleaning schedule being followed',
  'Staff following hygiene procedures',
  'No cross-contamination risks observed',
  'Equipment functioning correctly',
]

// Open the NumberPad for a temp tile by its label, enter the value, confirm.
async function enterTileTemp(page: Page, tileLabel: 'Product core' | 'Room ambient', value: string) {
  await page.getByText(tileLabel, { exact: true }).click()
  for (const ch of value) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

// Select a temp session AFTER the initial load (incl. thresholds) has settled,
// and report whether it is already submitted (read-only). The `loadData` fetch
// runs client-side on mount, so a session click fired before it resolves races
// the render: the "submitted" banner isn't up yet and the spec ploughs into a
// read-only page (no tiles to tap / no Submit) → 30s timeout. Waiting for the
// "Product core" tile to render removes the race and makes it deterministic.
async function enterTempSession(page: Page, session: 'AM' | 'PM'): Promise<'editable' | 'readonly'> {
  await expect(page.getByText('Product core', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: session, exact: true }).click()
  const banner = page.getByText(new RegExp(`${session} check submitted`, 'i'))
  const submit = page.getByRole('button', { name: new RegExp(`Submit ${session} temperature check`, 'i') })
  await expect(banner.or(submit)).toBeVisible({ timeout: 10_000 })
  return (await banner.isVisible()) ? 'readonly' : 'editable'
}

// Open a diary phase AFTER load has settled, and report whether it is already
// submitted (read-only). A done phase's header carries "Done · …" in its
// accessible name; an editable one expands to a checklist with a Submit button.
async function enterDiaryPhase(
  page: Page,
  phase: 'opening' | 'operational' | 'closing',
): Promise<'editable' | 'readonly'> {
  await expect(page.getByText('Product core', { exact: true })).toBeVisible({ timeout: 15_000 })
  const label = PHASE_LABEL[phase]
  const doneHeader = page.getByRole('button', { name: new RegExp(`${label}.*Done`, 'i') })
  if (await doneHeader.isVisible().catch(() => false)) return 'readonly'
  await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click()
  await expect(
    page.getByRole('button', { name: new RegExp(`^Submit ${label.toLowerCase()}$`, 'i') }),
  ).toBeVisible({ timeout: 10_000 })
  return 'editable'
}

test.describe('@critical HACCP process room (UI Phase 1 rebuild)', () => {
  test('temps happy path — in-range product + room submit successfully', async ({ page }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')
    await expect(page).toHaveURL(/\/haccp\/process-room/)

    // If AM was already submitted on the shared preview DB, the read-only banner
    // itself proves the session recorded — assert it and stop (race-proof).
    if ((await enterTempSession(page, 'AM')) === 'readonly') {
      await expect(page.getByText(/AM check submitted/i)).toBeVisible()
      return
    }

    await enterTileTemp(page, 'Product core', '2')   // ≤ target pass
    await enterTileTemp(page, 'Room ambient', '10')  // ≤ target pass

    await page.getByRole('button', { name: /^Submit AM temperature check$/ }).click()

    // After submit the page reloads and the session locks — the durable proof.
    await expect(page.getByText(/AM check submitted/i)).toBeVisible({ timeout: 10_000 })
  })

  test('diary phase — operational checklist all-pass submits successfully', async ({ page }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')

    if ((await enterDiaryPhase(page, 'operational')) === 'readonly') {
      await expect(page.getByRole('button', { name: /Operational checks.*Done/i })).toBeVisible()
      return
    }

    // Tick every item (the first button in each item's row = pass/tick).
    for (const item of OPERATIONAL_ITEMS) {
      const row = page.locator('div.flex.items-center.gap-3').filter({ hasText: item })
      await row.getByRole('button').first().click()
    }

    // Issues = No (SegmentedControl scoped inside the open phase card).
    const issuesRow = page.locator('div.flex.items-center.gap-3').filter({ hasText: 'Any issues?' })
    await issuesRow.getByRole('button', { name: 'No', exact: true }).click()

    await page.getByRole('button', { name: /^Submit operational checks$/ }).click()

    // The phase card flips to Done (the submit button leaves the DOM).
    await expect(
      page.getByRole('button', { name: /^Submit operational checks$/ }),
    ).toHaveCount(0, { timeout: 10_000 })
  })

  test('temps deviation — critical room temp raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')

    // PM session — AM is used by the happy-path test. If PM was already submitted
    // on the shared preview DB, the critical CA already exists and the queue check
    // below still proves the flow. enterTempSession waits for load first, so this
    // can't race into a read-only page.
    if ((await enterTempSession(page, 'PM')) === 'editable') {
      await enterTileTemp(page, 'Product core', '2')    // product in range
      await enterTileTemp(page, 'Room ambient', '16')   // > max → critical → queue

      await page
        .getByRole('button', { name: /Submit PM temperature check — action required/i })
        .click()

      await expect(page.getByText(/corrective action required/i).first()).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: /A\/C or cooling failure/i }).click()
      await page.getByRole('button', { name: /^Assess$/ }).click()
      await page.getByRole('button', { name: /schedule a\/c maintenance/i }).click()
      await page.getByRole('button', { name: /^Confirm & submit$/ }).click()

      // The CCA sheet closes on submit. (The "Submitted" flash is transient; the
      // durable proof is the CA in the admin queue below.)
      await expect(
        page.getByRole('button', { name: /^Confirm & submit$/ }),
      ).toHaveCount(0, { timeout: 10_000 })
    }

    // Admin queue: the critical room deviation CA must surface. Its
    // deviation_description: "Room: 16°C (limit ≤12°C). Cause: …".
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')

    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Room: 16°C \(limit ≤12°C\)/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })
})
