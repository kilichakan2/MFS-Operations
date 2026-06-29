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
    await expect(page.getByText(/log in again/i)).toBeVisible({ timeout: 10_000 })

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

    await page.getByRole('button', { name: new RegExp(marker) }).first().click()
    await expect(
      page.getByRole('heading', { name: new RegExp(`${marker}-supplier`) }),
    ).toBeVisible({ timeout: 10_000 })

    // No session kill — print should go through and fire window.print().
    await page.getByRole('button', { name: /100mm/i }).last().click()

    await expect(async () => {
      const printCalls = await page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      )
      expect(printCalls).toBeGreaterThan(0)
    }).toPass({ timeout: 10_000 })

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
    await page.goto('/haccp/mince')
    await expect(page).toHaveURL(/\/haccp\/mince/)

    // The mince history list only shows print buttons when a mince run exists.
    // If none is present in the local seed for today, skip — the delivery case
    // above already pins the shared helper; this is the extra mince-path proof
    // when data is available.
    const printBtn = page.getByRole('button', { name: /100mm/i }).first()
    const hasPrintable = await printBtn.isVisible().catch(() => false)
    test.skip(!hasPrintable, 'no mince run with a printable label present in this run')

    await killSession(page)
    await printBtn.click()

    // The use-by dialog opens; pick a use-by option to trigger the fetch.
    await page.getByRole('button', { name: /fresh 7 days/i }).click()

    await expect(page.getByText(/log in again/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('iframe')).toHaveCount(0)
    const printCalls = await page.evaluate(
      () => (window as unknown as { __printCalls: number }).__printCalls,
    )
    expect(printCalls).toBe(0)
  })
})
