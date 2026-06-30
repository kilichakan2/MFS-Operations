/**
 * tests/e2e/13z-haccp-cold-storage-phase1.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for the HACCP cold-storage UI Phase 1 rebuild (Tier B). Drives the
 * REBUILT /haccp/cold-storage screen (kit Modals + NumberPad + semantic tokens,
 * inherited dark theme) in a real Chromium browser against the LOCAL Supabase
 * stack, proving the three locked changes end-to-end at the UI layer:
 *
 *   1. BUG-FIX (headline) — a deviation reading whose corrective action cites
 *      "Defrost cycle — scheduled temperature rise" (one of the two causes the
 *      server used to reject with 400) now drives all the way to the "Session
 *      submitted" success screen. Proves the previously-rejected cause saves
 *      THROUGH the UI. (The route→service→repo save is also pinned at the
 *      integration layer in tests/integration/haccp.test.ts.)
 *   2. DRAFT-DISCARD (Guard 🟡 fix) — an out-of-range value (300 °C) typed into
 *      the NumberPad cannot be Confirmed (range-gated) AND, when the pad is
 *      dismissed via the scrim WITHOUT Confirm, the draft is discarded: the unit
 *      card never shows 300 and Submit is not enabled by it.
 *   3. DARK-MODE — the screen and all three kit Modals (NumberPad sheet,
 *      corrective-action sheet, Quick-reference sheet) render on the inherited
 *      dark theme with no light/white surfaces (no hardcoded light class survives
 *      the token sweep; the screen root resolves to a dark background).
 *   4. ONCE-PER-SESSION — re-opening a submitted session shows the read-only
 *      "already submitted" state.
 *
 * Fixture isolation: the screen renders only ACTIVE cold-storage units. This
 * file deactivates every other active unit and seeds ONE dedicated chiller
 * (target 4 / max 8) so its submit is deterministic and order-independent on a
 * shared seed (it never collides with spec 13's AM/PM submits on the 5 seed
 * units). beforeAll deactivates + seeds; afterAll restores the deactivated units
 * to active and parks the dedicated unit inactive (its readings are append-only).
 *
 * Prereqs: npm run db:up + db:reset; .env.test.local (local Supabase URL +
 * service-role key) and .env.e2e.local (warehouse PIN/user). Runs under
 * --project=chromium. A re-run on the same calendar day without db:reset will
 * find the dedicated unit's AM slot already filled — handled gracefully (the
 * read-only banner then proves a prior submit landed), exactly as spec 13 does.
 */

import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAs } from './_auth'

const DEDICATED_UNIT = 'E2E P1 Defrost Chiller'
const PROD_REF = 'uqgecljspgtevoylwkep'

// Light/hardcoded classes the token sweep was supposed to remove. Any element
// carrying one of these under the dark theme would render a white/light box —
// the exact dark-mode regression the plan flags. Asserting ZERO is the
// structural "no white boxes" proof (covers Radix-portaled modals too, since
// page.locator searches the whole document).
const LIGHT_SELECTOR = [
  '[class*="bg-white"]',
  '[class*="bg-slate-50"]',
  '[class*="bg-slate-100"]',
  '[class*="bg-green-50"]',
  '[class*="bg-green-100"]',
  '[class*="bg-amber-50"]',
  '[class*="bg-red-50"]',
  '[class*="bg-black/75"]',
  '[class*="bg-black/50"]',
].join(', ')

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY missing — set it in .env.test.local for the ' +
        'cold-storage Phase 1 E2E fixtures.',
    )
  }
  if (url.includes(PROD_REF)) {
    throw new Error('⛔ Refusing to seed E2E fixtures against production Supabase.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Tap a unit card, clear any pre-filled value, type `temp`, Confirm. Mirrors
// spec 13's helper so the deliberately-preserved NumberPad selectors are
// exercised. Chiller pad → decimal key present, no sign key.
async function enterReading(page: Page, unit: string, temp: string): Promise<void> {
  await page.getByText(unit, { exact: true }).click()
  const grid = page.locator('div.grid.grid-cols-3')
  for (let i = 0; i < 6; i++) {
    await grid.getByRole('button').last().click()
  }
  for (const ch of temp) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

let supa: SupabaseClient
let dedicatedId: string
let deactivatedIds: string[] = []

test.describe('@critical HACCP cold storage — UI Phase 1 rebuild', () => {
  test.beforeAll(async () => {
    supa = serviceClient()

    // Seed (idempotently) the dedicated chiller and make sure it is active.
    const { data: existing } = await supa
      .from('haccp_cold_storage_units')
      .select('id')
      .eq('name', DEDICATED_UNIT)
      .maybeSingle()
    if (existing) {
      dedicatedId = existing.id
      await supa
        .from('haccp_cold_storage_units')
        .update({ active: true })
        .eq('id', dedicatedId)
    } else {
      const { data, error } = await supa
        .from('haccp_cold_storage_units')
        .insert({
          name: DEDICATED_UNIT,
          unit_type: 'chiller',
          target_temp_c: 4,
          max_temp_c: 8,
          active: true,
        })
        .select('id')
        .single()
      if (error) throw new Error(`seed dedicated unit failed: ${error.message}`)
      dedicatedId = data.id
    }

    // Deactivate every OTHER active unit so the screen shows only ours.
    const { data: others } = await supa
      .from('haccp_cold_storage_units')
      .select('id')
      .eq('active', true)
      .neq('id', dedicatedId)
    deactivatedIds = (others ?? []).map((r) => r.id as string)
    if (deactivatedIds.length) {
      await supa
        .from('haccp_cold_storage_units')
        .update({ active: false })
        .in('id', deactivatedIds)
    }
  })

  test.afterAll(async () => {
    // Restore the units we deactivated; park the dedicated unit inactive (its
    // append-only readings can't be deleted, so leaving it active would leak it
    // onto the live screen).
    if (deactivatedIds.length) {
      await supa
        .from('haccp_cold_storage_units')
        .update({ active: true })
        .in('id', deactivatedIds)
    }
    if (dedicatedId) {
      await supa
        .from('haccp_cold_storage_units')
        .update({ active: false })
        .eq('id', dedicatedId)
    }
  })

  // ── 2. DRAFT-DISCARD (Guard 🟡 fix) ────────────────────────────────────────
  test('out-of-range entry dismissed via the scrim is discarded — never reaches the card or Submit', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await expect(page).toHaveURL(/\/haccp\/cold-storage/)
    await page.getByRole('button', { name: 'AM', exact: true }).click()

    // Open the pad for the dedicated unit and type an impossible value.
    await page.getByText(DEDICATED_UNIT, { exact: true }).click()
    const grid = page.locator('div.grid.grid-cols-3')
    for (let i = 0; i < 6; i++) {
      await grid.getByRole('button').last().click()
    }
    for (const ch of '300') {
      await page.getByRole('button', { name: ch, exact: true }).click()
    }

    // 300 > 30 max → Confirm is range-gated and CANNOT commit the value.
    await expect(page.getByRole('button', { name: /^Confirm/ })).toBeDisabled()

    // Dismiss via the scrim (overlay), NOT Confirm.
    await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 8, y: 8 } })
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The draft is discarded: the unit card never shows 300, stays "Tap"
    // (unrecorded), and Submit is disabled (no committed reading).
    await expect(page.getByText('300°C')).toHaveCount(0)
    const card = page.getByRole('button').filter({ hasText: DEDICATED_UNIT })
    await expect(card).toContainText(/Tap/i)
    await expect(page.getByRole('button', { name: /^Submit AM check$/ })).toBeDisabled()
  })

  // ── 3. DARK-MODE render (screen + NumberPad + Quick-ref sheets) ────────────
  test('screen, number pad and quick-reference render on the dark theme with no light surfaces', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await page.getByRole('button', { name: 'AM', exact: true }).click()

    // Dark theme is applied on the kiosk shell.
    await expect(page.locator('[data-theme="dark"]').first()).toBeAttached()

    // The screen root resolves to a genuinely dark background (not white).
    const rootBg = await page
      .locator('div.bg-surface-base')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    const channels = (rootBg.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const avg = channels.reduce((a, b) => a + b, 0) / 3
    expect(avg).toBeLessThan(128) // dark, not a light/white box

    // No hardcoded light class anywhere on the page (token sweep proof).
    await expect(page.locator(LIGHT_SELECTOR)).toHaveCount(0)

    // NumberPad sheet — open, assert dark (no light surfaces), then close.
    await page.getByText(DEDICATED_UNIT, { exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator(LIGHT_SELECTOR)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Quick-reference sheet — open, assert dark, then close.
    await page.getByRole('button', { name: /quick ref/i }).click()
    await expect(page.getByText(/CCP 2 — Quick Reference/i)).toBeVisible()
    await expect(page.locator(LIGHT_SELECTOR)).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  // ── 1. BUG-FIX end-to-end + CCA modal dark + 4. once-per-session ───────────
  test('Defrost-cycle deviation saves through the UI to "Session submitted" (the bug-fix proof)', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await page.getByRole('button', { name: 'AM', exact: true }).click()

    // Graceful guard: if a prior run already submitted AM for the dedicated
    // unit (re-run without db:reset), the read-only banner itself proves a
    // submit landed — assert it and stop (the integration layer is the
    // authoritative Defrost-save proof).
    const alreadyDone = page.getByText(/AM check already submitted/i)
    if (await alreadyDone.isVisible().catch(() => false)) {
      await expect(alreadyDone).toBeVisible()
      return
    }

    // Drive a CRITICAL reading (12 °C on a target-4 / max-8 chiller → >8).
    await enterReading(page, DEDICATED_UNIT, '12')
    await page.getByPlaceholder(/comments \(optional\)/i).fill(`E2E-P1-DEFROST-${Date.now()}`)

    // Submit opens the corrective-action sheet (a reading is non-pass).
    await page.getByRole('button', { name: /^Submit AM check$/ }).click()
    await expect(page.getByText(/corrective action required/i)).toBeVisible({
      timeout: 10_000,
    })

    // The corrective-action sheet also renders on the dark theme (no light box).
    await expect(page.locator(LIGHT_SELECTOR)).toHaveCount(0)

    // Pick the formerly-rejected cause (em-dash variant), a disposition and a
    // recurrence, then confirm. Critical + non-equipment → disposition options
    // are Assess / Reject; Defrost recurrence offers "Review defrost cycle
    // schedule".
    await page.getByRole('button', { name: /defrost cycle .* scheduled temperature rise/i }).click()
    await page.getByRole('button', { name: /^Assess$/ }).click()
    await page.getByRole('button', { name: /review defrost cycle schedule/i }).click()
    await page.getByRole('button', { name: /confirm corrective action & submit/i }).click()

    // The previously-rejected cause now SAVES through the UI.
    await expect(page.getByText(/session submitted/i)).toBeVisible({ timeout: 10_000 })

    // ── 4. once-per-session: re-opening AM is now read-only ──────────────────
    await page.goto('/haccp/cold-storage')
    await page.getByRole('button', { name: 'AM', exact: true }).click()
    await expect(page.getByText(/AM check already submitted/i)).toBeVisible({
      timeout: 10_000,
    })
    // Read-only mode hides the Submit control entirely.
    await expect(page.getByRole('button', { name: /^Submit AM check$/ })).toHaveCount(0)
  })
})
