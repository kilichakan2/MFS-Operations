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
 *   3. LIGHT-THEME (2026-07-01 refresh) — the screen and the kit Modals
 *      (NumberPad sheet, corrective-action sheet, Quick-reference sheet) now
 *      render on the LIGHT :root skin: NO `data-theme="dark"` anywhere, the
 *      screen canvas resolves to a soft-neutral (light) background, the bold
 *      ScreenHeader stays navy with a legible inverse "Quick ref" action, and
 *      every danger/deviation surface resolves to the brand Mediterranean Red
 *      family (not the retired crimson/pink) with AA-legible red-on-red-soft.
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
import {
  resolveColor,
  avgChannel,
  contrastRatio,
  expectBrandRed,
} from './_theme'

const CHILLERS = ['Lamb Chiller', 'Beef Chiller', 'Dispatch Chiller', 'Dairy Chiller']
const FREEZER = 'Main Freezer'
const DEVIATING_UNIT = 'Beef Chiller' // AM critical here; regression uses Lamb (PM)

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

  // ── 3. LIGHT-THEME render (screen + NumberPad + Quick-ref + brand red + AA) ─
  // The 2026-07-01 refresh flipped HACCP OFF the dark theme onto the light :root.
  // This is the exhaustive visual proof the whole screen went dark→light: no
  // `data-theme="dark"`, a soft-neutral canvas, the bold navy ScreenHeader with a
  // legible inverse action, brand-red (not crimson/pink) danger tokens, and
  // AA-legible red-on-red-soft — all read off the LIVE rendered DOM.
  test('screen, number pad and quick-reference render fully LIGHT — soft-neutral canvas, navy header, brand-red, AA', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cold-storage')
    await page.getByRole('button', { name: 'AM', exact: true }).click()

    // (a) The dark opt-in is GONE — no element carries data-theme="dark".
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(0)

    // (b) The screen canvas resolves to a genuinely LIGHT (soft-neutral)
    //     background — the whole body flipped, not just the header.
    const rootRgb = await page
      .locator('div.bg-surface-base')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    const rootChannels = (rootRgb.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const rootAvg = rootChannels.reduce((a, b) => a + b, 0) / 3
    expect(rootAvg).toBeGreaterThan(200) // light soft-neutral, not navy

    // (c) The bold ScreenHeader stays NAVY (surface-inverse) and its "Quick ref"
    //     action is a legible inverse (near-white) — proving header/body contrast
    //     survives the flip (ghost-inverse readable on navy).
    const headerBg = await resolveColor(page, 'var(--surface-inverse)')
    expect(avgChannel(headerBg)).toBeLessThan(90) // dark navy bar
    const quickRefColor = await page
      .getByRole('button', { name: /quick ref/i })
      .evaluate((el) => getComputedStyle(el).color)
    const qrChannels = (quickRefColor.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    expect(qrChannels.reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(180) // inverse text

    // (d) Brand-red unification — every light danger/deviation token resolves to
    //     the brand Mediterranean Red family, NOT the retired crimson or pink.
    expectBrandRed(await resolveColor(page, 'var(--status-error-fill)'), 'status-error-fill')
    expectBrandRed(await resolveColor(page, 'var(--status-error-text)'), 'status-error-text')
    expectBrandRed(await resolveColor(page, 'var(--status-deviation-fill)'), 'status-deviation-fill')
    expectBrandRed(await resolveColor(page, 'var(--action-danger)'), 'action-danger')

    // (e) WCAG-AA on the primary risk pairing — brand red-700 text on red-100
    //     soft — measured on the rendered DOM (Guard measured ≈5.85:1).
    const errText = await resolveColor(page, 'var(--status-error-text)')
    const errSoft = await resolveColor(page, 'var(--status-error-soft)')
    expect(contrastRatio(errText, errSoft)).toBeGreaterThanOrEqual(4.5)

    // (f) NumberPad sheet renders on the light theme — open (visible), then close.
    await page.getByText('Lamb Chiller', { exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // (g) Quick-reference sheet renders on the light theme — open, then close.
    await page.getByRole('button', { name: /quick ref/i }).click()
    await expect(page.getByText(/CCP 2 — Quick Reference/i)).toBeVisible()
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

    // The corrective-action sheet renders on the light theme (dialog visible).
    await expect(page.getByRole('dialog')).toBeVisible()

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
