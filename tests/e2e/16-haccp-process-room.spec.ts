/**
 * tests/e2e/16-haccp-process-room.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives the Process
 * Room screen (CCP 3 + SOP 1 daily diary) in a real Chromium browser against the
 * LOCAL Supabase stack, proving the re-pointed POST /api/haccp/process-room works
 * end-to-end across its three behaviours:
 *
 *   1. Temps happy     — AM session, product core temp in range (≤4°C) + room temp
 *                        in range (≤12°C) via the Numpad, submit → "Submitted".
 *   2. Diary phase     — open the "Operational checks" phase, tick every checklist
 *                        item, issues = No, submit phase → "Submit operational
 *                        checks" succeeds (card flips to a Done state).
 *   3. Temps deviation — room temp CRITICAL (>15°C) opens the CCAPopup; pick
 *                        cause/disposition/recurrence → success. A room reading
 *                        >15°C sets management_verification_required=true (service
 *                        line 1417), so the CA lands in the admin queue → asserted
 *                        as admin. (A 12–15°C room reading is amber-only and would
 *                        NOT reach the queue — we deliberately use >15°C.)
 *
 * Screen facts (app/haccp/process-room/page.tsx, read 2026-06-23):
 *   - No tab switcher: the Temperature-check card and the daily-diary phase cards
 *     are all on the page. Session buttons "AM"/"PM".
 *   - Temp tiles: a "Product core" tile and a "Room ambient" tile, each showing
 *     "Tap" until filled; tapping opens the Numpad. Digit buttons carry the bare
 *     digit; confirm "Confirm <v>°C". Product pass ≤4°C, room pass ≤12°C, room
 *     amber 12–15°C, room critical >15°C.
 *   - Temps submit: "Submit AM temperature check" (→ "… — action required" when a
 *     deviation needs a CCA). Success flash: "Submitted".
 *   - Diary phases are collapsible cards titled "Opening checks" / "Operational
 *     checks" / "Closing checks". Each checklist item is a row with a tick button,
 *     a cross button (both icon-only), then the item label text. Issues toggle
 *     "Yes"/"No". Submit "Submit operational checks".
 *   - CCAPopup (temps): "Corrective Action Required"; "What caused this?" /
 *     "Product disposition" / "Recurrence prevention"; confirm "Confirm & submit".
 *
 * Diary CAs are management_verification_required=FALSE (service line 1470), so a
 * diary issue is NOT asserted in the admin queue — the diary path here uses the
 * clean (issues=No) happy flow; the queue assertion rides on the temps deviation.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user +
 * admin password. Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

// Operational phase checklist (verbatim from CHECKS.operational).
const OPERATIONAL_ITEMS = [
  'Products being processed within temperature limits',
  'Cleaning schedule being followed',
  'Staff following hygiene procedures',
  'No cross-contamination risks observed',
  'Equipment functioning correctly',
]

// Open the Numpad for a temp tile by its label, enter the value, confirm.
async function enterTileTemp(page: Page, tileLabel: 'Product core' | 'Room ambient', value: string) {
  await page.getByText(tileLabel, { exact: true }).click()
  for (const ch of value) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

test.describe('@critical HACCP process room (F-19 PR2 re-point)', () => {
  test('temps happy path — in-range product + room submit successfully', async ({ page }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')
    await expect(page).toHaveURL(/\/haccp\/process-room/)

    await page.getByRole('button', { name: 'AM', exact: true }).click()
    await enterTileTemp(page, 'Product core', '2')   // ≤4 pass
    await enterTileTemp(page, 'Room ambient', '10')  // ≤12 pass

    await page.getByRole('button', { name: /^Submit AM temperature check$/ }).click()
    await expect(page.getByText(/^Submitted$/)).toBeVisible({ timeout: 10_000 })
  })

  test('diary phase — operational checklist all-pass submits successfully', async ({ page }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')

    // Open the Operational phase card.
    await page.getByRole('button', { name: /operational checks/i }).click()

    // Tick every item (the first icon button in each item's row = pass/tick).
    for (const item of OPERATIONAL_ITEMS) {
      const row = page.locator('div.flex.items-center.gap-3').filter({ hasText: item })
      await row.getByRole('button').first().click()
    }

    // Issues = No (scoped inside the open phase card via the "Any issues?" row).
    const issuesRow = page
      .locator('div.flex.items-center.gap-3')
      .filter({ hasText: 'Any issues?' })
    await issuesRow.getByRole('button', { name: 'No', exact: true }).click()

    await page.getByRole('button', { name: /^Submit operational checks$/ }).click()

    // The phase card flips to a "Done" state (the submit button leaves the DOM).
    await expect(
      page.getByRole('button', { name: /^Submit operational checks$/ }),
    ).toHaveCount(0, { timeout: 10_000 })
  })

  test('temps deviation — critical room temp raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/process-room')

    // PM session — the temps-happy test already submitted AM, which makes the AM
    // tiles read-only. Use PM so the form is editable and a fresh deviation fires.
    await page.getByRole('button', { name: 'PM', exact: true }).click()

    // On a re-run/retry, PM may already be submitted (read-only); the critical CA
    // already exists and the queue check below still proves the re-point.
    const pmDone = page.getByText(/PM check submitted/i)
    if (!(await pmDone.isVisible().catch(() => false))) {
      await enterTileTemp(page, 'Product core', '2')    // product in range
      await enterTileTemp(page, 'Room ambient', '16')   // >15 → critical → queue

      // Submit reads "— action required" and opens the CCAPopup.
      await page
        .getByRole('button', { name: /Submit PM temperature check — action required/i })
        .click()

      await expect(page.getByText(/corrective action required/i).first()).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: /A\/C or cooling failure/i }).click()
      // Disposition: room-critical offers Assess/Reject.
      await page.getByRole('button', { name: /^Assess$/ }).click()
      await page.getByRole('button', { name: /schedule a\/c maintenance/i }).click()
      await page.getByRole('button', { name: /^Confirm & submit$/ }).click()

      // Submit fired: the CCAPopup closes. (The transient "Submitted" flash only
      // shows for 2s; the durable proof is the CA in the admin queue below.)
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
