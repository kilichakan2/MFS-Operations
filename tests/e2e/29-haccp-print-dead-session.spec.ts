/**
 * tests/e2e/29-haccp-print-dead-session.spec.ts
 *
 * @critical
 *
 * F-PROD-04 Pass 1 — dead-session print-regression guard.
 *
 * Reproduces the field bug: when the session cookie is expired/legacy/unverified,
 * middleware fail-closes and redirects the `/api/labels` fetch to `/login` (200
 * HTML). The OLD print client checked only `res.ok`, so it printed the login page
 * silently. After this fix the shared `printLabelInApp` classifies the response as
 * an auth-bounce and surfaces "Session expired — please log in again to print."
 * via each screen's existing `submitErr` line, WITHOUT writing login HTML into a
 * print iframe or calling window.print().
 *
 * Why no physical device is needed: the Sunmi V3 APK is a thin remote-URL shell
 * loading the live web app, so this browser-level proof covers the device path
 * (the browser/iframe fallback). The native Sunmi bridge is untouched this pass.
 *
 * Setup choice (documented per plan): there is NO delivery seed data and the
 * print strip only renders for rows that carry a `batch_number` (meat
 * categories). So the test logs ONE meat (Beef) delivery via the existing
 * happy-path UI to make a print button appear — the cheaper stable option vs
 * adding seed rows (which the plan keeps out of scope).
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAs } from './_auth'

// Numpad helper — taps each character of a temperature string, then confirms.
async function enterTemp(page: Page, temp: string) {
  await page.getByRole('button', { name: /tap to enter/i }).click()
  for (const ch of temp) {
    if (ch === '.') {
      await page.getByRole('button', { name: '.', exact: true }).click()
    } else {
      await page.getByRole('button', { name: ch, exact: true }).click()
    }
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

// Mince numpad helper — the mince screen opens a full-screen Numpad overlay when a
// temperature field is tapped. Each digit button's accessible name is the digit
// itself; the confirm button reads "Confirm <value>°C".
async function enterMinceTemp(page: Page, temp: string) {
  for (const ch of temp) {
    if (ch === '.') {
      await page.getByRole('button', { name: '.', exact: true }).click()
    } else {
      await page.getByRole('button', { name: ch, exact: true }).click()
    }
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

// Logs one all-pass mince run via the existing happy-path UI so a row with a
// PrintLabelStrip (the 100mm button) renders. Uses the "Imported / vac-packed"
// species, which carries NO enforced kill-date limit, so any past kill date is
// accepted and the run is never blocked. Source delivery batches are optional
// (the submit gate requires only species + kill date + input temp + output
// temp), so this needs no pre-seeded delivery data. Returns the batch code shown
// in the success flash.
async function logMinceRun(page: Page): Promise<string> {
  await page.goto('/haccp/mince')
  await expect(page).toHaveURL(/\/haccp\/mince/)

  // Species — Imported / vac-packed: no kill-date limit (killEnforced: false).
  await page.getByRole('button', { name: /Imported \/ vac-packed/ }).click()

  // Kill date — a recent past date (no limit for this species; field is required).
  const killDate = new Date(Date.now() - 2 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  await page.locator('input[type="date"]').fill(killDate)

  // Input temp — 5°C ≤ 7°C → pass.
  await page.getByRole('button', { name: /tap to enter/i }).first().click()
  await enterMinceTemp(page, '5')

  // Output temp — chilled default ≤2°C; enter 1°C → pass.
  await page.getByRole('button', { name: /tap to enter/i }).first().click()
  await enterMinceTemp(page, '1')

  // Submit — all-pass, so no corrective-action popup.
  await page.getByRole('button', { name: /^Submit mince log$/ }).click()

  // Success flash carries the new batch code; the run then renders in
  // "Today's mince runs" with a PrintLabelStrip.
  await expect(page.getByText(/Mince logged — /i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /100mm/i }).first()).toBeVisible({
    timeout: 10_000,
  })
  return killDate
}

// Logs one in-range Beef delivery so a row with a batch_number (and thus a
// PrintLabelStrip) renders. Returns the product MARKER used.
async function logBeefDelivery(page: Page): Promise<string> {
  const MARKER = `E2E-PRINT-${Date.now()}`
  await page.goto('/haccp/delivery')
  await expect(page).toHaveURL(/\/haccp\/delivery/)

  // Beef — a meat category (gets born/reared/slaughter/cut + a batch_number).
  await page.getByRole('button', { name: 'Beef', exact: true }).click()

  // Supplier via Other free-text (local seed has no suppliers).
  await page.getByRole('button', { name: /^Other$/ }).click()
  await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
  await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} beef carcass`)

  // In-range temp (5°C ≤ 8°C → pass for beef).
  await enterTemp(page, '5')

  // BLS traceability (meat-only, all required): born GB → reared "Same as born
  // in" → slaughter code → cut "Same as slaughter".
  await page.getByRole('button', { name: /^GB/ }).first().click()
  await page.getByRole('button', { name: /^✓ Same as born in/ }).click()
  await page.getByPlaceholder(/e\.g\. GB1234/i).fill('GB1234')
  await page.getByRole('button', { name: /^✓ Same as slaughter/ }).click()

  // Contamination + allergens both clear.
  await page.getByRole('button', { name: /^No — all clear$/ }).click()
  await page.getByRole('button', { name: /no allergens/i }).click()

  await page.getByRole('button', { name: /^Submit delivery$/ }).click()

  await expect(
    page.getByText(/delivery logged — ready for next entry/i),
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
    timeout: 10_000,
  })
  return MARKER
}

// Replaces the valid session cookie with an unverifiable value so middleware
// fail-closes and redirects /api/labels → /login (the dead-session state). We
// overwrite the EXISTING mfs_session cookie in place (same domain/path) so the
// tampered value actually wins — adding a fresh cookie with mismatched
// attributes would leave the valid one in effect. We do NOT navigate afterwards
// (that would itself redirect off the print screen).
async function killSession(page: Page): Promise<void> {
  const ctx = page.context()
  const cookies = await ctx.cookies()
  const existing = cookies.find((c) => c.name === 'mfs_session')
  if (!existing) {
    throw new Error('mfs_session cookie not found — login did not establish a session')
  }
  await ctx.addCookies([
    {
      name: 'mfs_session',
      value: 'tampered-legacy-value',
      domain: existing.domain,
      path: existing.path,
    },
  ])
}

test.describe('@critical HACCP print — dead session shows re-login, never prints login page', () => {
  test('delivery print button on a dead session surfaces re-login and suppresses printing', async ({
    page,
  }) => {
    // Record any window.print() call inside every frame so we can assert it is
    // NOT triggered on an auth bounce.
    await page.addInitScript(() => {
      ;(window as unknown as { __printCalls: number }).__printCalls = 0
      const real = window.print.bind(window)
      window.print = () => {
        ;(window as unknown as { __printCalls: number }).__printCalls++
        return real()
      }
    })

    await loginAs(page, 'warehouse')
    const marker = await logBeefDelivery(page)

    // Open the just-logged delivery's detail modal — its header carries a print
    // strip whose error line renders inside the modal (the page-level submitErr
    // line is occluded by this overlay, hence the in-modal line). Clicking the
    // row by its product marker is deterministic, vs the nested print/row
    // buttons in the collapsed list.
    await page.getByRole('button', { name: new RegExp(marker) }).first().click()
    const modal = page.getByRole('heading', { name: new RegExp(`${marker}-supplier`) })
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // Dead-session state: swap the valid cookie for an unverifiable one.
    await killSession(page)

    // Click the detail-header 100mm print button. The strip uses onPointerDown;
    // Playwright's click dispatches it.
    await page.getByRole('button', { name: /100mm/i }).last().click()

    // The re-login message appears via the existing submitErr line (in-modal).
    // `.first()` — a page may mount the shared submitErr in more than one
    // section, so scope the visibility check to a single match (strict mode).
    await expect(page.getByText(/log in again/i).first()).toBeVisible({ timeout: 10_000 })

    // No login-page HTML was printed: the helper returns before creating an
    // iframe on a bounce, and window.print() must NOT have fired.
    await expect(page.locator('iframe')).toHaveCount(0)
    const printCalls = await page.evaluate(
      () => (window as unknown as { __printCalls: number }).__printCalls,
    )
    expect(printCalls).toBe(0)
  })

  test('valid session still prints a real label (happy-path regression)', async ({
    page,
  }) => {
    // Proves the byte-identical happy path: with a live session, the shared
    // helper fetches a real label, writes it to a hidden iframe and calls
    // window.print() exactly as before — no error message.
    await loginAs(page, 'warehouse')
    const marker = await logBeefDelivery(page)

    await page.getByRole('button', { name: new RegExp(marker) }).first().click()
    await expect(
      page.getByRole('heading', { name: new RegExp(`${marker}-supplier`) }),
    ).toBeVisible({ timeout: 10_000 })

    // No session kill — print should go through. The helper reaches its print
    // branch ONLY after classifying the response as a real label, and it does so
    // by creating a hidden print iframe (window.print() itself fires inside that
    // iframe's contentWindow, which a main-frame spy cannot observe — so we prove
    // the print path positively via the iframe instead). The iframe lives ~2s
    // before cleanup, so it is reliably observable.
    await page.getByRole('button', { name: /100mm/i }).last().click()
    await expect(page.locator('iframe')).toHaveCount(1, { timeout: 5_000 })

    // No re-login / failure message on a valid print.
    await expect(page.getByText(/log in again/i)).toHaveCount(0)
  })

  test('mince print button on a dead session surfaces re-login and suppresses printing', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __printCalls: number }).__printCalls = 0
      const real = window.print.bind(window)
      window.print = () => {
        ;(window as unknown as { __printCalls: number }).__printCalls++
        return real()
      }
    })

    await loginAs(page, 'warehouse')

    // Build our own mince run via the happy-path UI so the mince print path is
    // ALWAYS exercised — never self-skipped on an empty seed (mirrors how the
    // delivery test calls logBeefDelivery to create its own data).
    await logMinceRun(page)

    await killSession(page)

    // The just-logged run's 100mm print button (first in "Today's mince runs").
    await page.getByRole('button', { name: /100mm/i }).first().click()

    // The use-by dialog opens; pick a use-by option to trigger the fetch.
    await page.getByRole('button', { name: /fresh 7 days/i }).click()

    // `.first()` — the mince page mounts the shared submitErr in multiple tab
    // sections; scope the visibility check to one match (strict mode).
    await expect(page.getByText(/log in again/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('iframe')).toHaveCount(0)
    const printCalls = await page.evaluate(
      () => (window as unknown as { __printCalls: number }).__printCalls,
    )
    expect(printCalls).toBe(0)
  })
})
