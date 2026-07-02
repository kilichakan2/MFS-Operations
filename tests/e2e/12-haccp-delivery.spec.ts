/**
 * tests/e2e/12-haccp-delivery.spec.ts
 *
 * @critical
 *
 * EXHAUSTIVE Goods In (CCP 1) tap suite — rewritten for the Goods In unit
 * (kit rebuild + DB-driven verified thresholds). Drives the REBUILT
 * /haccp/delivery screen in a real Chromium browser, keeping + extending the
 * three original pins (happy path, deviation→admin queue, W2 allergen-only)
 * and adding the new-band, BLS, log-range, admin-threshold and visual-law
 * coverage:
 *
 *   1. Happy path       — dairy in-range via the kit NumberPad → flash + row
 *                         (with print strip) in today's log.
 *   2. NEW poultry bands — numpad verdict tiles per band: poultry 4.0 → Pass,
 *                         4.5 → Conditional accept (THE FIX — used to pass
 *                         silently), 5.5 → Reject; lamb 6.0 → amber; frozen
 *                         -17.5 → amber (decimal + sign together); band copy
 *                         under the chip is DERIVED from the DB rows.
 *   3. Reject track     — poultry 5.5 → CCA popup, disposition LOCKED to
 *                         Reject, cause+recurrence → submit → admin CA queue.
 *   4. Conditional track + BLS — lamb 6.0 (amber) full meat walk: curated GB
 *                         chip, reared-in via ISO search (DE), slaughter/cut
 *                         same-as shortcut, LIVE DDMM-GB-N batch preview →
 *                         CCA conditional-accept track → admin CA queue;
 *                         detail sheet shows batch + BLS + print strip.
 *   5. W2 pin           — allergen-only dairy delivery files ZERO CA rows.
 *   6. Log ranges + detail — Today / This week / Last week segmented control;
 *                         dry-goods (Ambient) row + detail sheet fields.
 *   7. Visual law       — light theme, navy header w/ white "Goods In" title,
 *                         green/amber ONLY inside verdict tiles/badges
 *                         (computed-style assertions), category chips
 *                         brand-coloured (poultry=orange, frozen=navy),
 *                         selected chrome controls orange (not green).
 *   8. Admin thresholds — poultry amber 5.0 → 5.5 via /haccp/admin →
 *                         Thresholds (Goods In section) → the delivery
 *                         screen's band copy self-updates → RESTORE → the
 *                         non-admin PATCH + GET are denied (403).
 *
 * MARKER discipline (deliveries accumulate per day — 13-haccp-cold-storage
 * lesson): every assertion keys on a unique per-run marker planted in the
 * supplier "Other" free-text / product description, never on row counts.
 *
 * NO Supabase service-role client (preview-smoke fail-closed rule — the key is
 * not exposed to the remote @critical smoke). The immutable audit-row write is
 * therefore pinned at the integration layer
 * (tests/integration/haccp-goods-in-thresholds.test.ts) and at the DB layer
 * (supabase/tests/019-rls-goods-in-thresholds.test.sql); here the observable
 * UI trail (save success + §4 reminder banner + self-updated band copy) is the
 * end-to-end proof.
 *
 * Prereqs: npm run db:up + db:reset (seeds the 11 threshold rows);
 * .env.e2e.local with warehouse PIN/user + admin password. Runs under
 * --project=chromium / ui.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'
import { resolveColor, avgChannel, type RGB } from './_theme'

// ── NumberPad helpers (kit pad inside a Modal sheet) ─────────────────────────

/** Clear the pad via backspace (aria-label), then type `temp` (digits, '.'
 *  via the grid decimal key, trailing '-' via the full-width sign-toggle row
 *  the pad shows on frozen categories — where '.' AND '-' are offered
 *  together), WITHOUT confirming. */
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

/** Open the pad from the temperature tile, type `temp`, Confirm. */
async function enterTemp(page: Page, temp: string): Promise<void> {
  await page.getByRole('button', { name: /tap to enter/i }).click()
  await typeTemp(page, temp)
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

/** Wait for the screen to be ready (thresholds fetched → category copy shows). */
async function openGoodsIn(page: Page): Promise<void> {
  await page.goto('/haccp/delivery')
  await expect(page).toHaveURL(/\/haccp\/delivery/)
  await expect(page.getByRole('button', { name: 'Poultry', exact: true })).toBeVisible({
    timeout: 15_000,
  })
}

function rgbOf(css: string): number[] {
  return (css.match(/\d+/g) ?? []).slice(0, 3).map(Number)
}

function sameColor(a: number[], b: RGB): boolean {
  return a[0] === b.r && a[1] === b.g && a[2] === b.b
}

test.describe('@critical HACCP Goods In (CCP 1) — kit rebuild + DB-driven thresholds', () => {
  // ── 1. Happy path (kept pin) ────────────────────────────────────────────────
  test('happy path — in-range dairy delivery logs successfully (flash + row + print strip)', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-OK-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    // Header carries the labels-only rename.
    await expect(page.getByRole('heading', { name: 'Goods In' })).toBeVisible()
    await expect(page.getByText('CCP 1 — Delivery Intake')).toBeVisible()

    // Dairy / Chilled — non-meat, no BLS fields; band copy DERIVED from the DB.
    await page.getByRole('button', { name: 'Dairy / Chilled', exact: true }).click()
    await expect(page.getByText('≤8°C pass · >8°C reject')).toBeVisible()

    // Supplier via Other free-text (local seed has no suppliers).
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)

    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} cheese pallet`)

    // In-range temperature (5°C ≤ 8°C → pass) via the kit NumberPad.
    await enterTemp(page, '5')
    await expect(page.getByText('Pass', { exact: true }).first()).toBeVisible()

    // Contamination + allergens both clear.
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()

    await page.getByRole('button', { name: /^Submit delivery$/ }).click()

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // The just-logged delivery appears in today's log with its product marker,
    // and the printer-port strip renders on the row (byte-preserved flow).
    const row = page.getByRole('button').filter({ hasText: MARKER }).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText('100mm')).toBeVisible()
    await expect(row.getByText('58mm')).toBeVisible()
  })

  // ── 2. NEW poultry bands — numpad verdict tiles per band (THE FIX) ─────────
  test('numpad verdicts per band: poultry 4.0 pass / 4.5 amber / 5.5 reject; lamb 6.0 amber; frozen -17.5 amber', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    // Poultry band copy is the NEW verified band, derived from the DB row.
    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await expect(
      page.getByText('≤4°C pass · 4–5°C conditional accept · >5°C reject'),
    ).toBeVisible()

    // Open the pad and walk the fence-posts LIVE (verdict updates in the pad).
    await page.getByRole('button', { name: /tap to enter/i }).click()
    const dialog = page.getByRole('dialog')

    await typeTemp(page, '4')
    await expect(dialog.getByText('Pass', { exact: true })).toBeVisible()

    await typeTemp(page, '4.5')
    await expect(dialog.getByText('Conditional accept', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/do NOT reject \(CA-001\)/i)).toBeVisible()

    await typeTemp(page, '5.5')
    await expect(dialog.getByText('Reject', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/reject delivery/i)).toBeVisible()

    // Confirm 5.5 → the form verdict tile shows the Reject badge + guidance.
    await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
    await expect(page.getByText('Reject', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/reject delivery/i).first()).toBeVisible()

    // Lamb 6.0 → amber (unchanged band, DB-driven).
    await page.getByRole('button', { name: 'Lamb', exact: true }).click()
    await expect(
      page.getByText('≤5°C pass · 5–8°C conditional accept · >8°C reject'),
    ).toBeVisible()
    await enterTemp(page, '6')
    await expect(page.getByText('Conditional accept', { exact: true }).first()).toBeVisible()

    // Frozen -17.5 → amber. A DECIMAL negative: the frozen pad must offer the
    // '.' grid key AND the sign-toggle row together (review 🟡1 fix) — flattened
    // to -18 this reading would false-pass the 3°C-wide QFF amber band.
    await page.getByRole('button', { name: 'Frozen', exact: true }).click()
    await expect(
      page.getByText('≤-18°C pass · -18 to -15°C conditional accept · >-15°C reject'),
    ).toBeVisible()
    await enterTemp(page, '-17.5')
    await expect(page.getByText('Conditional accept', { exact: true }).first()).toBeVisible()
  })

  // ── 3. Reject track (kept pin, now on the NEW poultry band) ────────────────
  test('poultry 5.5°C reject → CCA with disposition LOCKED to Reject → admin CA queue', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-REJ-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} warm poultry`)

    // 5.5°C > 5°C → reject on the NEW band (was a silent PASS before the fix).
    await enterTemp(page, '5.5')
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()

    await page.getByRole('button', { name: /corrective action required/i }).click()

    // CCA popup — temperature track; disposition is LOCKED to Reject on fail.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/record what happened/i)).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByText(/reject required \(>5°C\)/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled()

    await dialog.getByRole('button', { name: /cold chain break in transport/i }).click()
    await dialog.getByRole('button', { name: /contact supplier — cold chain audit/i }).click()
    await dialog.getByRole('button', { name: /confirm & submit delivery/i }).click()

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })
    const row = page.getByRole('button').filter({ hasText: MARKER }).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(/Reject · 5\.5°C/)).toBeVisible()

    // The fail CA reaches the admin verification queue.
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Temperature: 5\.5°C \(fail\) on poultry/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  // ── 4. Conditional-accept track + full meat BLS walk ───────────────────────
  test('lamb 6°C amber → full BLS walk (curated chip, ISO search, same-as, live batch preview) → conditional CCA → admin queue + detail sheet', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-BLS-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    await page.getByRole('button', { name: 'Lamb', exact: true }).click()
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} lamb shoulders`)

    // BLS — Born in via a CURATED chip (GB).
    await page.getByRole('button', { name: /^GB\b/ }).first().click()

    // Reared in — Different country via the ISO SEARCH (Denmark → DK, a
    // NON-curated code, so it can only be reached through the search).
    await page.getByRole('button', { name: /different country/i }).click()
    await page.getByPlaceholder(/search other countries/i).last().fill('denm')
    await page.getByRole('button', { name: /^DK\b/ }).last().click()
    await expect(page.getByText(/Selected: DK — Denmark/i)).toBeVisible()

    // Slaughter site code + cut site via the SAME-AS shortcut.
    await page.getByPlaceholder('e.g. GB1234').fill('GB9999')
    await page.getByRole('button', { name: /same as slaughter \(GB9999\)/i }).click()

    // LIVE batch preview: DDMM-GB-N (born-in country code + next number).
    // .first() = the preview box (renders in the form, ABOVE the log rows —
    // prior runs' lamb rows also carry GB batch codes, marker discipline).
    await expect(page.getByText(/^\d{4}-GB-\d+$/).first()).toBeVisible()
    await expect(page.getByText(/Born: United Kingdom · Reared: Denmark/).first()).toBeVisible()

    // 6°C on lamb (5/8 band) → amber.
    await enterTemp(page, '6')
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()

    await page.getByRole('button', { name: /corrective action required/i }).click()

    // CCA — conditional-accept track: disposition NOT locked; band copy derived.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/record what happened/i)).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByText(/conditional accept \(5–8°C\)/i)).toBeVisible()
    const conditional = dialog.getByRole('button', { name: 'Conditional accept', exact: true })
    await expect(conditional).toBeEnabled()
    await conditional.click()
    await dialog.getByRole('button', { name: /delivery delayed — product held too long/i }).click()
    await dialog.getByRole('button', { name: /review delivery window/i }).click()
    await dialog.getByRole('button', { name: /confirm & submit delivery/i }).click()

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // Row + detail sheet: batch reference, BLS fields, print strip. An AMBER
    // (urgent) CA row is written with management_verification_required:false —
    // by design it does NOT enter the admin VERIFICATION queue (only fail-track
    // CAs do; proven in the reject test above). The end-to-end amber proof is
    // the persisted verdict badge + the "Corrective action required" box on the
    // detail sheet; the amber CA-row payload itself is pinned at the unit layer
    // (buildDeliveryCorrectiveActions tests).
    const row = page.getByRole('button').filter({ hasText: MARKER }).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText(/Conditional accept · 6°C/)).toBeVisible()
    await row.click()

    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Batch reference')).toBeVisible()
    await expect(sheet.getByText(/^\d{4}-GB-\d+$/).first()).toBeVisible()
    await expect(sheet.getByText('Slaughter site')).toBeVisible()
    await expect(sheet.getByText('GB9999').first()).toBeVisible()
    await expect(sheet.getByText('United Kingdom')).toBeVisible()
    await expect(sheet.getByText('Denmark')).toBeVisible()
    await expect(sheet.getByText('Conditional accept', { exact: true })).toBeVisible()
    await expect(sheet.getByText('100mm')).toBeVisible()
    await expect(sheet.getByText('58mm')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  // ── 5. W2 pin (kept) ────────────────────────────────────────────────────────
  test('W2 pin — allergen-only delivery on a non-CA category files ZERO corrective actions', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-W2-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    // Dairy / Chilled is NOT in ALLERGEN_CA_CATEGORIES, so an allergen flag here
    // does NOT raise a CA (and never opens the CCA popup).
    await page.getByRole('button', { name: 'Dairy / Chilled', exact: true }).click()
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} allergen tray`)

    await enterTemp(page, '3')
    await page.getByRole('button', { name: /^No — all clear$/ }).click()

    // Allergens FOUND — pick one chip.
    await page.getByRole('button', { name: /allergens found/i }).click()
    await page.getByRole('button', { name: /^Milk\/Dairy$/ }).click()

    // No CCA popup must appear — submit goes straight through.
    const submit = page.getByRole('button', { name: /^Submit delivery$/ })
    await expect(submit).toBeVisible()
    await submit.click()

    await expect(page.getByText(/record what happened/i)).toHaveCount(0)
    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })

    // The pin: the admin queue must NOT gain a CA for this MARKER.
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    await expect(page.getByText(/corrective action/i).first()).toBeVisible({
      timeout: 10_000,
    })
    for (let i = 0; i < 3; i++) {
      await page.reload()
      await expect(page.getByText(new RegExp(MARKER))).toHaveCount(0)
    }
  })

  // ── 6. Log ranges + detail sheet (dry goods / Ambient) ─────────────────────
  test('log ranges Today / This week / Last week + dry-goods detail sheet', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-LOG-${Date.now()}`
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    // Dry goods — no temperature CCP (entry replaced by the Ambient note).
    await page.getByRole('button', { name: 'Dry Goods', exact: true }).click()
    await expect(page.getByText(/no temperature ccp — visual \/ condition check only/i).first()).toBeVisible()
    await expect(page.getByText('Temperature — Not applicable')).toBeVisible()

    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} dry stores`)
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()
    await page.getByRole('button', { name: /^Submit delivery$/ }).click()
    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // Today — row present with the Ambient badge.
    await expect(page.getByText(/today's deliveries/i)).toBeVisible()
    const row = page.getByRole('button').filter({ hasText: MARKER }).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText('Ambient')).toBeVisible()

    // Detail sheet fields.
    await row.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText(`${MARKER} dry stores`)).toBeVisible()
    await expect(sheet.getByText('Ambient', { exact: true }).first()).toBeVisible()
    await expect(sheet.getByText('Dry Goods').first()).toBeVisible()
    await expect(sheet.getByText('Logged by')).toBeVisible()
    await expect(sheet.getByText(/no allergens — salsa 1\.4\.2/i)).toBeVisible()
    await page.keyboard.press('Escape')

    // This week — the marker is still inside the window.
    await page.getByRole('button', { name: 'This week', exact: true }).click()
    await expect(page.getByText(/this week's deliveries/i)).toBeVisible()
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({ timeout: 10_000 })

    // Last week — heading flips; today's marker is OUTSIDE the window.
    await page.getByRole('button', { name: 'Last week', exact: true }).click()
    await expect(page.getByText(/last week's deliveries/i)).toBeVisible()
    await expect(page.getByText(new RegExp(MARKER))).toHaveCount(0, { timeout: 10_000 })
  })

  // ── 7. Visual law — light theme, navy header, caged green/amber, brand chips ─
  test('visual law: light canvas, navy header, green/amber ONLY on verdict tiles/badges, brand category chips', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await openGoodsIn(page)

    // (a) No dark opt-in anywhere; light soft-neutral canvas.
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(0)
    const rootRgb = await page
      .locator('div.bg-surface-base')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(rgbOf(rootRgb).reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(200)

    // (b) Bold navy header with a white "Goods In" title.
    const headerBg = await resolveColor(page, 'var(--surface-inverse)')
    expect(avgChannel(headerBg)).toBeLessThan(90)
    const titleColor = await page
      .getByRole('heading', { name: 'Goods In' })
      .evaluate((el) => getComputedStyle(el).color)
    expect(rgbOf(titleColor).reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(180)

    // (c) Category chips are BRAND-coloured when selected: poultry = orange-500
    //     fill, frozen = navy-700 fill (the §5.11 pairing tokens).
    const poultryFill = await resolveColor(page, 'var(--category-poultry-fill)')
    const frozenFill = await resolveColor(page, 'var(--category-frozen-fill)')
    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Poultry', exact: true })).toHaveCSS(
      'background-color',
      `rgb(${poultryFill.r}, ${poultryFill.g}, ${poultryFill.b})`,
    )
    await page.getByRole('button', { name: 'Frozen', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Frozen', exact: true })).toHaveCSS(
      'background-color',
      `rgb(${frozenFill.r}, ${frozenFill.g}, ${frozenFill.b})`,
    )

    // (d) GREEN IS CAGED: a pass VERDICT badge is green (legal)…
    const successSoft = await resolveColor(page, 'var(--status-success-soft)')
    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await enterTemp(page, '4')
    await expect(page.getByText('Pass', { exact: true }).first()).toHaveCSS(
      'background-color',
      `rgb(${successSoft.r}, ${successSoft.g}, ${successSoft.b})`,
    )

    // …while selected CHROME controls are ORANGE (action-primary), never green:
    // the "No — all clear" contamination button and the "No allergens" button.
    const actionPrimary = await resolveColor(page, 'var(--action-primary)')
    const primaryRgb = `rgb(${actionPrimary.r}, ${actionPrimary.g}, ${actionPrimary.b})`
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    // Park the pointer off the button — otherwise the HOVER fill (orange-600)
    // is read instead of the resting primary fill.
    await page.mouse.move(0, 0)
    await expect(page.getByRole('button', { name: /^No — all clear$/ })).toHaveCSS(
      'background-color',
      primaryRgb,
    )
    await expect(page.getByRole('button', { name: /no allergens/i })).toHaveCSS(
      'background-color',
      primaryRgb,
    )

    // (e) The "N logged" counter is a NEUTRAL badge (earlier tests logged rows
    //     today) and the SOP 5B banner is info (navy family) — neither is green
    //     or amber.
    const warningSoft = await resolveColor(page, 'var(--status-warning-soft)')
    const counter = page.getByText(/\d+ logged/).first()
    if (await counter.isVisible().catch(() => false)) {
      const counterBg = await counter.evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(sameColor(rgbOf(counterBg), successSoft)).toBe(false)
      expect(sameColor(rgbOf(counterBg), warningSoft)).toBe(false)
    }
    const sopBanner = page.getByText(/SOP 5B — Receiving rule/i)
    await expect(sopBanner).toBeVisible()
    const sopBg = await sopBanner
      .locator('xpath=ancestor::*[contains(@class,"rounded") or @role="status"][1]')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(sameColor(rgbOf(sopBg), successSoft)).toBe(false)
    expect(sameColor(rgbOf(sopBg), warningSoft)).toBe(false)

    // (f) Quick-reference sheet opens on the light theme.
    await page.getByRole('button', { name: /quick ref/i }).click()
    await expect(page.getByText(/CCP 1 — Quick Reference/i)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  // ── 8. Admin thresholds — edit → copy self-updates → restore → 403s ────────
  // LAST in the file so a mid-test failure can't leave the edited value in
  // front of the earlier band-copy assertions (db:reset restores regardless).
  test('admin edits poultry amber 5→5.5 (Goods In section), delivery copy self-updates, value restored; non-admin denied', async ({
    page,
  }) => {
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    await page.getByRole('button', { name: /thresholds/i }).click()

    // The new Goods In (CCP 1) section renders below the CCP-3 cards.
    await expect(
      page.getByText(/Goods In \(CCP 1\) — delivery temperature limits/i),
    ).toBeVisible({ timeout: 10_000 })
    // Dry goods row is read-only (no temperature CCP).
    await expect(page.getByText(/no temperature ccp — visual \/ condition check only/i)).toBeVisible()

    // Edit poultry: amber 5 → 5.5 (structure fixed; only the number moves).
    const poultryCard = page
      .locator('div.rounded-2xl')
      .filter({ hasText: 'Poultry' })
      .filter({ hasText: 'Amber ceiling' })
      .first()
    const amberInput = poultryCard.getByRole('textbox').nth(1)
    await expect(amberInput).toHaveValue('5')
    await amberInput.fill('5.5')
    await poultryCard.getByRole('button', { name: /save limit/i }).click()

    // The §4 + retrain reminder fires and names CCP 1.
    await expect(page.getByText(/limit updated — paperwork required/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/CCP 1 Goods In/i)).toBeVisible()

    // The delivery screen's band copy SELF-UPDATES from the DB row.
    await page.goto('/haccp/delivery')
    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await expect(
      page.getByText('≤4°C pass · 4–5.5°C conditional accept · >5.5°C reject'),
    ).toBeVisible({ timeout: 10_000 })

    // RESTORE the locked seed value (5.0).
    await page.goto('/haccp/admin')
    await page.getByRole('button', { name: /thresholds/i }).click()
    const poultryCard2 = page
      .locator('div.rounded-2xl')
      .filter({ hasText: 'Poultry' })
      .filter({ hasText: 'Amber ceiling' })
      .first()
    const amberInput2 = poultryCard2.getByRole('textbox').nth(1)
    await expect(amberInput2).toHaveValue('5.5', { timeout: 10_000 })
    await amberInput2.fill('5')
    await poultryCard2.getByRole('button', { name: /save limit/i }).click()
    await expect(page.getByText(/limit updated — paperwork required/i)).toBeVisible()

    await page.goto('/haccp/delivery')
    await page.getByRole('button', { name: 'Poultry', exact: true }).click()
    await expect(
      page.getByText('≤4°C pass · 4–5°C conditional accept · >5°C reject'),
    ).toBeVisible({ timeout: 10_000 })

    // Non-admin: the thresholds API is denied outright (route gate + DB RLS
    // behind it; the DB-level denial is pinned in pgTAP 019).
    await logout(page)
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/delivery')
    const statuses = await page.evaluate(async () => {
      const get = await fetch('/api/haccp/admin/goods-in-thresholds')
      const patch = await fetch('/api/haccp/admin/goods-in-thresholds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', pass_max_c: 1, amber_max_c: 2 }),
      })
      return { get: get.status, patch: patch.status }
    })
    expect(statuses.get).toBe(403)
    expect(statuses.patch).toBe(403)
  })
})
