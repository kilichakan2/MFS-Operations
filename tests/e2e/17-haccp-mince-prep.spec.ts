/**
 * tests/e2e/17-haccp-mince-prep.spec.ts
 *
 * @critical
 *
 * EXHAUSTIVE Mince & Meat Prep (CCP-M1/M2, MP1/MP2) tap suite — rewritten for
 * the mince unit (kit rebuild + DB-driven thresholds + display-only amber).
 * Drives the REBUILT /haccp/mince screen in a real Chromium browser, keeping
 * the original pins (happy path, prep + allergen gate, timesep, deviation →
 * admin queue) and adding the amber-band, dual-channel, kill-date, bug-fix,
 * admin-threshold and visual-law coverage:
 *
 *   1. Happy path        — lamb within kill limit, temps in range via the kit
 *                          NumberPad → MINCE-DDMM-LAMB-N flash + row + strip.
 *   2. AMBER = DISPLAY ONLY (the unit's #1 risk) — mince input 7.5°C shows the
 *                          WARNING colour (not red, not green — computed-style)
 *                          but STILL opens the CCA popup on submit and the CA
 *                          lands in the admin queue: the register never went
 *                          quiet for an amber reading.
 *   3. Fail band + frozen amber — output 3.5°C chilled → danger colour → CCA →
 *                          queue; frozen output -17.5°C (decimal + sign toggle
 *                          together on the pad) → amber colour.
 *   4. Dual-channel CCA (bug 3) — input 9 AND output 4 → ONE popup listing
 *                          BOTH channel banners with a COMBINED deduped cause
 *                          list (an output-only cause is offered; one Other).
 *   5. Kill-date hard block — lamb 8 days back → DO NOT MINCE + submit
 *                          disabled; imported_vac same date → informational,
 *                          submits fine (no form changes for that species).
 *   6. Meat prep         — product, mince-batch source picker consumes run #1's
 *                          batch code, allergen pick + label-check gate blocks
 *                          then unblocks submit → PREP flash + row + strip.
 *   7. Time-sep (bugs 1+2) — WITH corrective text → saved + the MMP-TS entry
 *                          reaches the admin queue; history header honours
 *                          This week / Last week; WITHOUT text → no queue row.
 *   8. submitErr single render (bug 4) — a forced 400 renders EXACTLY ONE
 *                          error paragraph on the mince tab.
 *   9. Admin thresholds  — mince_output_chilled warning 3.0 → 3.5 via
 *                          /haccp/admin → Thresholds (new CCP-M section) → the
 *                          mince screen's band copy self-updates → RESTORE →
 *                          non-admin GET/PATCH denied (403). The imported_vac
 *                          row is read-only ("no kill-day limit").
 *  10. Visual law        — light theme, navy header white title, green/amber
 *                          ONLY inside temp tiles/verdicts + pass/warn/fail
 *                          badges (computed-style via _theme), selected chrome
 *                          orange.
 *
 * MARKER discipline: every assertion keys on a unique per-run marker (product
 * name / verifier / allergens free text), never on row counts. Colour reads
 * park the pointer at (0,0) first (hover-fill lesson) and use the retrying
 * toHaveCSS. list rows never assert corrective_action_required (not in the
 * list select).
 *
 * NO Supabase service-role client (preview-smoke fail-closed rule). The
 * persisted `input_temp_pass:false` for an amber reading and the audit-row
 * immutability are pinned at the integration layer
 * (tests/integration/haccp-mince-thresholds.test.ts) and the DB layer
 * (supabase/tests/020-rls-mince-thresholds.test.sql); here the observable UI
 * trail (warning colour + CCA popup + admin-queue row) is the end-to-end
 * proof.
 *
 * Prereqs: npm run db:up + db:reset (seeds the 9 threshold rows);
 * .env.e2e.local with warehouse PIN/user + admin password. Runs under
 * --project=chromium / ui.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'
import { resolveColor, avgChannel, type RGB } from './_theme'

// ── NumberPad helpers (kit pad inside a Modal sheet) ─────────────────────────

/** Clear the pad via backspace, then type `temp` (digits, '.' via the grid
 *  key, trailing '-' via the sign-toggle row shown in frozen mode — where '.'
 *  AND '-' are offered together), WITHOUT confirming. */
async function typeTemp(page: Page, temp: string): Promise<void> {
  const dialog = page.getByRole('dialog')
  for (let i = 0; i < 8; i++) {
    await dialog.getByRole('button', { name: /delete last digit/i }).click()
  }
  const negative = temp.startsWith('-')
  const body = negative ? temp.slice(1) : temp
  for (const ch of body) {
    await dialog.getByRole('button', { name: ch, exact: true }).click()
  }
  if (negative) {
    await dialog.getByRole('button', { name: /toggle negative/i }).click()
  }
}

async function confirmPad(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

/** Open the INPUT temperature pad (its tile carries "limit ≤…°C"), type, confirm. */
async function enterInputTemp(page: Page, temp: string): Promise<void> {
  await page.getByRole('button', { name: /limit ≤\d+(\.\d+)?°C/i }).click()
  await typeTemp(page, temp)
  await confirmPad(page)
}

/** Open the OUTPUT temperature pad (its tile carries "Check after …"), type, confirm. */
async function enterOutputTemp(page: Page, temp: string): Promise<void> {
  await page.getByRole('button', { name: /Check after (chilling|freezing)/i }).click()
  await typeTemp(page, temp)
  await confirmPad(page)
}

/** Wait for the screen to be ready (thresholds fetched → derived species copy). */
async function openMince(page: Page): Promise<void> {
  await page.goto('/haccp/mince')
  await expect(page).toHaveURL(/\/haccp\/mince/)
  // The species sublabel is DERIVED from the DB rows — visible = thresholds loaded.
  await expect(page.getByText('max 6d · ≤7°C').first()).toBeVisible({ timeout: 15_000 })
}

const todayISO = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
function nDaysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

function rgbOf(css: string): number[] {
  return (css.match(/\d+/g) ?? []).slice(0, 3).map(Number)
}
function cssOf({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`
}

/** Fill a clean in-range lamb mince form (species + kill today + 5/1). */
async function fillHappyMince(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Lamb/ }).click()
  await page.locator('input[type="date"]').first().fill(todayISO())
  await enterInputTemp(page, '5')
  await enterOutputTemp(page, '1')
}

test.describe('@critical HACCP mince / prep / time-sep — kit rebuild + DB-driven CCP-M thresholds', () => {
  // ── 1. Happy path ───────────────────────────────────────────────────────────
  test('happy path — lamb in-range run logs (MINCE batch flash + row + print strip)', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    // Header carries the kit ScreenHeader.
    await expect(page.getByRole('heading', { name: 'Mince & Meat Prep' })).toBeVisible()
    await expect(page.getByText('CCP-M1 · CCP-M2 · CCP-MP1 · CCP-MP2')).toBeVisible()

    await fillHappyMince(page)
    await page.getByRole('button', { name: /^Submit mince log$/ }).click()

    // Batch-code format unchanged: MINCE-DDMM-LAMB-N.
    await expect(page.getByText(/Mince logged — MINCE-\d{4}-LAMB-\d+/)).toBeVisible({
      timeout: 10_000,
    })

    // The run appears in today's log with the printer-port strip (byte-preserved).
    const row = page
      .locator('div.rounded-xl')
      .filter({ hasText: /MINCE-\d{4}-LAMB-\d+/ })
      .filter({ hasText: '100mm' })
      .first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText('All pass')).toBeVisible()
    await expect(row.getByText('100mm')).toBeVisible()
    await expect(row.getByText('58mm')).toBeVisible()
  })

  // ── 2. AMBER = DISPLAY ONLY (spec-critical, plan risk R1) ───────────────────
  test('amber 7.5°C input: WARNING colour on pad + tile, CCA still demanded, CA reaches the admin queue', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    const warningSoft = await resolveColor(page, 'var(--status-warning-soft)')
    const successSoft = await resolveColor(page, 'var(--status-success-soft)')
    const errorSoft = await resolveColor(page, 'var(--status-error-soft)')

    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.locator('input[type="date"]').first().fill(todayISO())

    // In the pad: 7.5 shows the WARNING badge (amber — not green, not red).
    await page.getByRole('button', { name: /limit ≤7°C/i }).click()
    await typeTemp(page, '7.5')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Warning', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Warning', { exact: true })).toHaveCSS(
      'background-color',
      cssOf(warningSoft),
    )
    // The amber band changes NOTHING about the paperwork — the pad says so.
    await expect(dialog.getByText(/corrective action will be required/i)).toBeVisible()
    await confirmPad(page)

    // Tile carries the warning fill (park the pointer first — hover lesson).
    await page.mouse.move(0, 0)
    const inputTile = page.getByRole('button', { name: /limit ≤7°C/i })
    await expect(inputTile).toHaveCSS('background-color', cssOf(warningSoft))
    const tileBg = await inputTile.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(rgbOf(tileBg)).not.toEqual([successSoft.r, successSoft.g, successSoft.b])
    expect(rgbOf(tileBg)).not.toEqual([errorSoft.r, errorSoft.g, errorSoft.b])

    await enterOutputTemp(page, '1')

    // Submit OPENS THE CCA POPUP — amber still demands the corrective action.
    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    const cca = page.getByRole('dialog')
    await expect(cca.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(cca.getByText('CCP-M1 — Input temperature exceeded', { exact: true })).toBeVisible()

    await cca.getByRole('button', { name: /supplier delivered product above temperature/i }).click()
    await cca.getByRole('button', { name: 'Assess', exact: true }).click()
    await cca.getByRole('button', { name: /request temperature records on next delivery/i }).click()
    await cca.getByRole('button', { name: /^Confirm & submit$/ }).click()

    await expect(page.getByText(/Mince logged — MINCE-/)).toBeVisible({ timeout: 10_000 })

    // The register never went quiet: the amber CA reaches the admin queue.
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Mince input temp: 7\.5°C \(limit ≤7°C, lamb\)/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  // ── 3. Fail band + frozen amber (decimal + sign together) ──────────────────
  test('output 3.5°C chilled → danger → CCA → queue; frozen -17.5°C → amber colour', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    const warningSoft = await resolveColor(page, 'var(--status-warning-soft)')
    const errorSoft = await resolveColor(page, 'var(--status-error-soft)')

    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.locator('input[type="date"]').first().fill(todayISO())
    await enterInputTemp(page, '5')

    // 3.5°C chilled (> the 3.0 warning ceiling) → DANGER colour.
    await enterOutputTemp(page, '3.5')
    await page.mouse.move(0, 0)
    await expect(
      page.getByRole('button', { name: /Check after chilling/i }),
    ).toHaveCSS('background-color', cssOf(errorSoft))

    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    const cca = page.getByRole('dialog')
    await expect(cca.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(cca.getByText('CCP-M1 — Output temperature exceeded', { exact: true })).toBeVisible()
    await cca.getByRole('button', { name: /insufficient chilling time after mincing/i }).click()
    await cca.getByRole('button', { name: 'Conditional accept', exact: true }).click()
    await cca.getByRole('button', { name: /increase chilling time before dispatch/i }).click()
    await cca.getByRole('button', { name: /^Confirm & submit$/ }).click()
    await expect(page.getByText(/Mince logged — MINCE-/)).toBeVisible({ timeout: 10_000 })

    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Mince output temp: 3\.5°C \(limit ≤2°C, chilled\)/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    // Frozen mode: -17.5°C sits in the -18 → -17 amber band. The pad offers
    // '.' AND the sign-toggle row together; rounded to -18 it would false-pass.
    await logout(page)
    await loginAs(page, 'warehouse')
    await openMince(page)
    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.getByRole('button', { name: /^Frozen/ }).click()
    await enterOutputTemp(page, '-17.5')
    await page.mouse.move(0, 0)
    await expect(
      page.getByRole('button', { name: /Check after freezing/i }),
    ).toHaveCSS('background-color', cssOf(warningSoft))
  })

  // ── 4. Dual-channel CCA — combined deduped cause list (bug 3) ──────────────
  test('input 9°C AND output 4°C → ONE popup, BOTH banners, combined deduped causes', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.locator('input[type="date"]').first().fill(todayISO())
    await enterInputTemp(page, '9')   // > 8 → fail
    await enterOutputTemp(page, '4')  // > 3 → fail (chilled)

    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    const cca = page.getByRole('dialog')
    await expect(cca.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })

    // ONE popup, BOTH channel banners.
    await expect(cca.getByText('CCP-M1 — Input temperature exceeded', { exact: true })).toBeVisible()
    await expect(cca.getByText('CCP-M1 — Output temperature exceeded', { exact: true })).toBeVisible()

    // COMBINED cause list: an input-only cause AND an output-only cause are
    // both offered (before the fix only the first channel's list rendered)…
    await expect(
      cca.getByRole('button', { name: /intake temperature probe fault/i }),
    ).toBeVisible()
    await expect(
      cca.getByRole('button', { name: /insufficient chilling time after mincing/i }),
    ).toBeVisible()
    // …and deduped: exactly ONE "Other" cause chip.
    await expect(cca.getByRole('button', { name: 'Other', exact: true })).toHaveCount(1)

    // Complete with the OUTPUT-only cause (proves it is selectable).
    await cca.getByRole('button', { name: /insufficient chilling time after mincing/i }).click()
    await cca.getByRole('button', { name: 'Assess', exact: true }).click()
    await cca.getByRole('button', { name: /use blast chiller for mince output/i }).click()
    await cca.getByRole('button', { name: /^Confirm & submit$/ }).click()
    await expect(page.getByText(/Mince logged — MINCE-/)).toBeVisible({ timeout: 10_000 })
  })

  // ── 5. Kill-date hard block vs imported_vac informational ──────────────────
  test('kill date 8 days back: lamb hard-blocks (DO NOT MINCE); imported_vac informational + submits', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    // Lamb → hard block: badge + disabled submit with the blocked label.
    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.locator('input[type="date"]').first().fill(nDaysAgoISO(8))
    await expect(page.getByText('DO NOT MINCE')).toBeVisible()
    await expect(
      page.getByText(/segregate product\. return to supplier or dispose as category 3 abp/i),
    ).toBeVisible()
    const blocked = page.getByRole('button', { name: /blocked — kill date exceeded/i })
    await expect(blocked).toBeVisible()
    await expect(blocked).toBeDisabled()

    // Imported / vac-packed, SAME date → informational only, no block, submits
    // fine (no 15-day clock, no toggle — the documented deviation).
    await page.getByRole('button', { name: /^Imported \/ vac-packed/ }).click()
    await expect(page.getByText('Informational')).toBeVisible()
    await expect(page.getByText(/recorded for traceability only/i)).toBeVisible()
    await enterInputTemp(page, '5')
    await enterOutputTemp(page, '1')
    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    await expect(page.getByText(/Mince logged — MINCE-\d{4}-IMPVAC-\d+/)).toBeVisible({
      timeout: 10_000,
    })
  })

  // ── 6. Meat prep — mince-batch source + allergen label-check gate ───────────
  test('meat prep consumes a mince batch, allergen label-check gate blocks then unblocks submit', async ({
    page,
  }) => {
    const MARKER = `E2E-PREP-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openMince(page)

    // Run #1: a quick in-range mince run whose batch code the prep will consume.
    await fillHappyMince(page)
    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    const flash = page.getByText(/Mince logged — MINCE-\d{4}-LAMB-\d+/)
    await expect(flash).toBeVisible({ timeout: 10_000 })
    const batchCode = ((await flash.textContent()) ?? '').replace('Mince logged — ', '').trim()
    expect(batchCode).toMatch(/^MINCE-\d{4}-LAMB-\d+$/)

    // Meat Prep tab.
    await page.getByRole('button', { name: /^Meat Prep/ }).click()
    await page.getByPlaceholder(/marinated lamb leg/i).fill(`${MARKER} seasoned mince`)

    // Source mince batches — today's runs include run #1; select it.
    await page.locator('button').filter({ hasText: batchCode }).first().click()
    await expect(page.getByText('Selected mince batches:')).toBeVisible()
    await expect(page.getByText(batchCode).nth(1)).toBeVisible()

    // Temps in range.
    await enterInputTemp(page, '5')
    await enterOutputTemp(page, '3')

    // Allergen picked WITHOUT the label check → submit is BLOCKED.
    await page.getByRole('button', { name: 'Mustard', exact: true }).click()
    const submit = page.getByRole('button', { name: /^Submit meat prep log$/ })
    await expect(submit).toBeDisabled()

    // Complete the label check → unblocked.
    await page.getByRole('button', { name: /label check completed/i }).click()
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText(/Prep logged — PREP-\d{4}-\w+-\d+/)).toBeVisible({
      timeout: 10_000,
    })

    // Row in today's log with the print strip + allergen note.
    const row = page
      .locator('div.rounded-xl')
      .filter({ hasText: MARKER })
      .filter({ hasText: '100mm' })
      .first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(/Allergens: Mustard/)).toBeVisible()
    await expect(row.getByText('100mm')).toBeVisible()
    await expect(row.getByText('58mm')).toBeVisible()
  })

  // ── 7. Time-sep — CA text persists + registers (bug 1), date filter (bug 2) ─
  test('time-sep with corrective text → record + MMP-TS queue entry; history honours the date filter; no text → no CA', async ({
    page,
  }) => {
    const TS = Date.now()
    const VERIFIER = `E2E-TSEP-${TS}-verifier`
    const CA_TEXT = `E2E-TSCA-${TS} re-cleaned the bench`
    const ALLERGENS_A = `E2E-TSAL-${TS} Mustard`
    const ALLERGENS_B = `E2E-TSNOCA-${TS} Gluten`

    await loginAs(page, 'warehouse')
    await openMince(page)
    await page.getByRole('button', { name: /^Time Sep/ }).click()

    // Submit WITH the corrective-action free text (bug fix 1).
    const times = page.locator('input[type="time"]')
    await times.nth(0).fill('09:00')
    await times.nth(1).fill('10:00')
    await times.nth(2).fill('11:00')
    await page.getByPlaceholder(/name of person who visually verified the clean/i).fill(VERIFIER)
    await page.getByPlaceholder(/e\.g\. Mustard, Gluten, Soya/i).fill(ALLERGENS_A)
    await page.getByPlaceholder(/any issues or actions taken/i).fill(CA_TEXT)
    await page.getByRole('button', { name: /^Submit time separation log$/ }).click()
    await expect(page.getByText(/time separation logged/i)).toBeVisible({ timeout: 10_000 })

    // The record (incl. the CA text) shows in today's history.
    const rec = page.locator('div.rounded-xl').filter({ hasText: VERIFIER }).first()
    await expect(rec).toBeVisible({ timeout: 10_000 })
    await expect(rec.getByText(new RegExp(`Corrective action: E2E-TSCA-${TS}`))).toBeVisible()

    // Bug fix 2: the header + records honour the date filter on THIS tab.
    await expect(page.getByText(/today's time separation records/i)).toBeVisible()
    await page.getByRole('button', { name: 'This week', exact: true }).click()
    await expect(page.getByText(/this week's time separation records/i)).toBeVisible()
    await expect(page.getByText(new RegExp(VERIFIER)).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Last week', exact: true }).click()
    await expect(page.getByText(/last week's time separation records/i)).toBeVisible()
    await expect(page.getByText(new RegExp(VERIFIER))).toHaveCount(0, { timeout: 10_000 })
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(page.getByText(/today's time separation records/i)).toBeVisible()

    // Submit WITHOUT text → record saved, but NO register entry.
    await times.nth(1).fill('12:00')
    await page.getByPlaceholder(/name of person who visually verified the clean/i).fill(`${VERIFIER}-b`)
    await page.getByPlaceholder(/e\.g\. Mustard, Gluten, Soya/i).fill(ALLERGENS_B)
    await page.getByRole('button', { name: /^Submit time separation log$/ }).click()
    await expect(page.getByText(/time separation logged/i)).toBeVisible({ timeout: 10_000 })

    // Admin queue: the MMP-TS entry for run A exists (labelled), run B absent.
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    const tsCard = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: new RegExp(`E2E-TSAL-${TS}`) })
    await expect(async () => {
      await page.reload()
      await expect(tsCard.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(tsCard.first().getByText('Time Separation', { exact: true })).toBeVisible()

    for (let i = 0; i < 3; i++) {
      await page.reload()
      await expect(page.getByText(new RegExp(`E2E-TSNOCA-${TS}`))).toHaveCount(0)
    }
  })

  // ── 8. submitErr renders EXACTLY ONCE on the mince tab (bug 4) ──────────────
  test('a submit error renders exactly one error paragraph on the mince tab', async ({
    page,
  }) => {
    const ERR = `E2E-ERR-${Date.now()} forced failure`
    await loginAs(page, 'warehouse')
    await openMince(page)

    await fillHappyMince(page)

    // Force the POST to 400 with a marker error (GET passes through).
    await page.route('**/api/haccp/mince-prep', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: ERR }),
        })
      } else {
        await route.continue()
      }
    })

    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    await expect(page.getByText(ERR).first()).toBeVisible({ timeout: 10_000 })
    // Bug fix 4: the old page rendered submitErr TWICE (form + history header).
    await expect(page.getByText(ERR)).toHaveCount(1)
    await page.unroute('**/api/haccp/mince-prep')
  })

  // ── 9. Admin thresholds — edit → copy self-updates → restore → 403s ────────
  // LAST-but-one so a mid-test failure can't leave the edited value in front of
  // the earlier band assertions (db:reset restores regardless).
  test('admin edits mince_output_chilled warning 3→3.5 (CCP-M section), mince copy self-updates, restored; non-admin denied', async ({
    page,
  }) => {
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    await page.getByRole('button', { name: /thresholds/i }).click()

    // The new CCP-M section renders below the Goods In section.
    await expect(
      page.getByText(/Mince & Meat Prep \(CCP-M1 \/ M2 \/ MP1 \/ MP2\)/i),
    ).toBeVisible({ timeout: 10_000 })
    // The imported_vac no-limit row is READ-ONLY (documented deviation).
    await expect(
      page.getByText(/no kill-day limit — documented deviation, recorded for traceability only/i),
    ).toBeVisible()

    // Edit mince output (chilled): warning ceiling 3 → 3.5.
    const card = page
      .locator('div.rounded-2xl')
      .filter({ hasText: 'Mince output — chilled' })
      .filter({ hasText: 'Warning ceiling' })
      .first()
    const warnInput = card.getByRole('textbox').nth(1)
    // Self-heal a dirty start (goods-in ANVIL lesson): legal values here are
    // only 3 (seed) or 3.5 (ours) — restore the seed first if needed.
    await expect(warnInput).toHaveValue(/^3(\.5)?$/)
    if ((await warnInput.inputValue()) !== '3') {
      await warnInput.fill('3')
      await card.getByRole('button', { name: /save limit/i }).click()
      await expect(page.getByText(/limit updated — paperwork required/i)).toBeVisible({
        timeout: 10_000,
      })
    }
    await expect(warnInput).toHaveValue('3')
    await warnInput.fill('3.5')
    await card.getByRole('button', { name: /save limit/i }).click()

    // The §4 + retrain reminder fires and names CCP-M.
    await expect(page.getByText(/limit updated — paperwork required/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/CCP-M mince\/meat-prep/i)).toBeVisible()

    // The mince screen's band copy SELF-UPDATES (numpad description derives
    // from the DB row).
    await openMince(page)
    await page.getByRole('button', { name: /Check after chilling/i }).click()
    await expect(
      page.getByText('Bands: ≤2°C pass · 2–3.5°C warning · >3.5°C deviation'),
    ).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')

    // RESTORE the locked seed value (3.0).
    await page.goto('/haccp/admin')
    await page.getByRole('button', { name: /thresholds/i }).click()
    const card2 = page
      .locator('div.rounded-2xl')
      .filter({ hasText: 'Mince output — chilled' })
      .filter({ hasText: 'Warning ceiling' })
      .first()
    const warnInput2 = card2.getByRole('textbox').nth(1)
    await expect(warnInput2).toHaveValue('3.5', { timeout: 10_000 })
    await warnInput2.fill('3')
    await card2.getByRole('button', { name: /save limit/i }).click()
    await expect(page.getByText(/limit updated — paperwork required/i)).toBeVisible()

    await openMince(page)
    await page.getByRole('button', { name: /Check after chilling/i }).click()
    await expect(
      page.getByText('Bands: ≤2°C pass · 2–3°C warning · >3°C deviation'),
    ).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')

    // Non-admin: the thresholds API is denied outright (route gate + DB RLS
    // behind it; the DB-level denial is pinned in pgTAP 020).
    await logout(page)
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/mince')
    const statuses = await page.evaluate(async () => {
      const get = await fetch('/api/haccp/admin/mince-thresholds')
      const patch = await fetch('/api/haccp/admin/mince-thresholds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', pass_max: 1, amber_max: 2 }),
      })
      return { get: get.status, patch: patch.status }
    })
    expect(statuses.get).toBe(403)
    expect(statuses.patch).toBe(403)
  })

  // ── 10. Visual law — light theme, navy header, caged green/amber ────────────
  test('visual law: light canvas, navy header, green/amber ONLY on temp tiles/verdicts + badges, orange chrome', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openMince(page)

    // (a) No dark opt-in anywhere; light soft-neutral canvas.
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(0)
    const rootRgb = await page
      .locator('div.bg-surface-base')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(rgbOf(rootRgb).reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(200)

    // (b) Bold navy header with a white title.
    const headerBg = await resolveColor(page, 'var(--surface-inverse)')
    expect(avgChannel(headerBg)).toBeLessThan(90)
    const titleColor = await page
      .getByRole('heading', { name: 'Mince & Meat Prep' })
      .evaluate((el) => getComputedStyle(el).color)
    expect(rgbOf(titleColor).reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(180)

    // (c) Selected CHROME is ORANGE (action-primary), never green: the active
    //     tab and a selected species chip.
    const actionPrimary = await resolveColor(page, 'var(--action-primary)')
    const successSoft = await resolveColor(page, 'var(--status-success-soft)')
    const warningSoft = await resolveColor(page, 'var(--status-warning-soft)')
    await page.mouse.move(0, 0)
    await expect(page.getByRole('button', { name: /^Mince Log/ })).toHaveCSS(
      'background-color',
      cssOf(actionPrimary),
    )
    await page.getByRole('button', { name: /^Lamb/ }).click()
    await page.mouse.move(0, 0)
    // After selection the input tile's name ALSO starts with "Lamb …" — pin
    // the chip by its full derived name.
    await expect(
      page.getByRole('button', { name: 'Lamb max 6d · ≤7°C' }),
    ).toHaveCSS('background-color', cssOf(actionPrimary))
    // Output-mode toggle selected = orange too (was green/blue chrome before).
    await expect(page.getByRole('button', { name: /^Chilled/ })).toHaveCSS(
      'background-color',
      cssOf(actionPrimary),
    )

    // (d) GREEN IS CAGED: a pass verdict on the temp tile is green (legal)…
    await enterInputTemp(page, '5')
    await page.mouse.move(0, 0)
    await expect(page.getByRole('button', { name: /limit ≤7°C/i })).toHaveCSS(
      'background-color',
      cssOf(successSoft),
    )
    await expect(page.getByText('Pass', { exact: true }).first()).toBeVisible()

    // …and the kill-day verdict badge may be green/amber (a pass/fail badge),
    // but the FORM CARD chrome around it is neutral.
    const formCard = page.locator('div.rounded-2xl').filter({ hasText: 'Mincing Production Log' }).first()
    const cardBg = await formCard.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(rgbOf(cardBg)).not.toEqual([successSoft.r, successSoft.g, successSoft.b])
    expect(rgbOf(cardBg)).not.toEqual([warningSoft.r, warningSoft.g, warningSoft.b])

    // (e) Print strip present on a logged row (earlier tests logged runs today).
    await expect(page.getByText('100mm').first()).toBeVisible({ timeout: 10_000 })
  })
})
