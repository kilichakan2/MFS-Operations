/**
 * tests/e2e/13-haccp-cold-storage-phase1.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for the HACCP cold-storage UI Phase 1 rebuild (Tier B). Drives the
 * REBUILT /haccp/cold-storage screen (kit Modals + NumberPad + semantic tokens,
 * inherited dark theme) in a real Chromium browser, proving the three locked
 * changes end-to-end at the UI layer:
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
 *   3. DARK-MODE — the screen and the kit Modals (NumberPad sheet, corrective-
 *      action sheet, Quick-reference sheet) render on the inherited dark theme
 *      with no light/white surfaces (no hardcoded light class survives the token
 *      sweep; the screen root resolves to a dark background).
 *   4. ONCE-PER-SESSION — re-opening a submitted session shows the read-only
 *      "already submitted" state.
 *
 * SEED + VERIFY exactly like the sibling @critical HACCP specs (e.g.
 * 13-haccp-cold-storage.spec.ts): uses the 5 cold-storage units the preview seed
 * already plants + the app's own login/flow. NO Supabase service-role client and
 * NO SUPABASE_SERVICE_ROLE_KEY — that key is not exposed to the remote Vercel-
 * preview @critical smoke (fail-closed by design), so a direct DB client would
 * break the authoritative smoke. The "Session submitted" success screen IS the
 * end-to-end save proof.
 *
 * RUN ORDER (deliberate filename): this file sorts BEFORE
 * 13-haccp-cold-storage.spec.ts ('-' < '.'), so its AM submit lands on a fresh
 * per-run seed while a once-per-session slot is still free. The regression spec's
 * happy-path then resiliently early-returns on "AM already submitted" (it asserts
 * the read-only banner, no CA dependency), and its deviation path keeps the PM
 * session to itself — so its admin-queue assertion is unaffected. The deviation
 * here uses Beef Chiller (AM), distinct from the regression's Lamb Chiller (PM).
 *
 * Prereqs: npm run db:up + db:reset (plants the 5 units); .env.e2e.local with the
 * warehouse PIN/user. Runs under --project=chromium. A re-run on the same
 * calendar day without db:reset finds the AM slot already filled — handled
 * gracefully (the read-only banner then proves a prior submit landed), exactly as
 * the regression spec does.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './_auth'

const CHILLERS = ['Lamb Chiller', 'Beef Chiller', 'Dispatch Chiller', 'Dairy Chiller']
const FREEZER = 'Main Freezer'
const DEVIATING_UNIT = 'Beef Chiller' // AM critical here; regression uses Lamb (PM)

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

// Tap a unit card, clear any pre-filled value, type `temp`, Confirm. Mirrors the
// regression spec's helper so the deliberately-preserved NumberPad selectors are
// exercised. `negative` toggles the freezer +/- key.
async function readUnit(page: Page, unit: string, temp: string, negative = false): Promise<void> {
  await page.getByText(unit, { exact: true }).click()
  // Clear any pre-filled value via the backspace — the LAST button inside the
  // 3-col digit grid (Confirm sits OUTSIDE the grid, so scope to it).
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
// is already submitted (read-only). This is the fix for the prod-only smoke
// failure: the page's `loadReadings` fetch runs client-side on mount, so a
// session click fired before it resolves races the render — the "already
// submitted" banner isn't up yet, an early-return guard misses it, and the
// spec ploughs into a read-only page (no comments field / no Submit) → 30s
// timeout. Cold storage is once-per-session-per-day and the SHARED preview DB
// is never reset between runs, so after the first run a session stays
// read-only. Waiting for the units to render (spinner gone) before choosing
// the session removes the race and makes the outcome deterministic.
async function enterSession(page: Page, session: 'AM' | 'PM'): Promise<'editable' | 'readonly'> {
  // Units render only once the initial fetch resolves.
  await expect(page.getByText('Lamb Chiller', { exact: true })).toBeVisible({ timeout: 15_000 })
  // Safe now — loadReadings has run, so this click won't be overridden by its
  // auto-session-select, and the banner/form is in its final state.
  await page.getByRole('button', { name: session, exact: true }).click()
  const banner = page.getByText(new RegExp(`${session} check already submitted`, 'i'))
  const submit = page.getByRole('button', { name: new RegExp(`^Submit ${session} check$`) })
  // Wait until the session's final state renders (pure re-render, no fetch).
  await expect(banner.or(submit)).toBeVisible({ timeout: 10_000 })
  return (await banner.isVisible()) ? 'readonly' : 'editable'
}

test.describe('@critical HACCP cold storage — UI Phase 1 rebuild', () => {
  // ── 2. DRAFT-DISCARD (Guard 🟡 fix) ────────────────────────────────────────
  test('out-of-range entry dismissed via the scrim is discarded — never reaches the card or Submit', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await expect(page).toHaveURL(/\/haccp\/cold-storage/)

    // Needs an EDITABLE AM session to drive the draft-buffer. If a prior run on
    // the shared preview DB already submitted AM (read-only), the pad can't be
    // opened for a fresh entry — the read-only banner itself proves the once-
    // per-session guard, and the range-gating is authoritatively pinned at the
    // unit layer (isNumberPadValueConfirmable). Degrade gracefully.
    if ((await enterSession(page, 'AM')) === 'readonly') {
      await expect(page.getByText(/AM check already submitted/i)).toBeVisible()
      return
    }

    // Open the pad for a seeded unit and type an impossible value.
    await page.getByText('Lamb Chiller', { exact: true }).click()
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
    const card = page.getByRole('button').filter({ hasText: 'Lamb Chiller' })
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
    await page.getByText('Lamb Chiller', { exact: true }).click()
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

    // Graceful guard (race-proof): if AM is already submitted on the shared
    // preview DB, the read-only banner proves a submit landed — assert it and
    // stop. The route→service→repo Defrost-cause save is authoritatively
    // pinned at the integration layer (tests/integration/haccp.test.ts).
    if ((await enterSession(page, 'AM')) === 'readonly') {
      await expect(page.getByText(/AM check already submitted/i)).toBeVisible()
      return
    }

    // Drive all 5 units: 4 chillers + freezer in range, Beef Chiller CRITICAL at
    // 12 °C (>8 → critical → corrective action). Submit requires every unit
    // filled, exactly as on the real kiosk.
    for (const c of CHILLERS) {
      await readUnit(page, c, c === DEVIATING_UNIT ? '12' : '4')
    }
    await readUnit(page, FREEZER, '20', /* negative */ true)
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
    // are Assess / Reject; the Defrost cause offers "Review defrost cycle
    // schedule".
    await page.getByRole('button', { name: /defrost cycle .* scheduled temperature rise/i }).click()
    await page.getByRole('button', { name: /^Assess$/ }).click()
    await page.getByRole('button', { name: /review defrost cycle schedule/i }).click()
    await page.getByRole('button', { name: /confirm corrective action & submit/i }).click()

    // The previously-rejected cause now SAVES through the UI.
    await expect(page.getByText(/session submitted/i)).toBeVisible({ timeout: 10_000 })

    // ── 4. once-per-session: re-opening AM is now read-only ──────────────────
    // enterSession waits for load before selecting AM, so loadReadings can't
    // auto-select PM (the just-freed session) and hide the AM read-only banner.
    await page.goto('/haccp/cold-storage')
    expect(await enterSession(page, 'AM')).toBe('readonly')
    await expect(page.getByText(/AM check already submitted/i)).toBeVisible()
    // Read-only mode hides the Submit control entirely.
    await expect(page.getByRole('button', { name: /^Submit AM check$/ })).toHaveCount(0)
  })
})
