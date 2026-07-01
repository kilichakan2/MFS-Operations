/**
 * tests/e2e/29-light-danger-brand-red.spec.ts
 *
 * @critical
 *
 * ANVIL Unit 1 (2026-07-01 light design-system refresh) — matrix item #4:
 * the token remap that unifies error/danger/deviation onto the brand
 * Mediterranean Red lives in the GLOBAL light `:root`, so it repaints EVERY
 * light screen, not just the two HACCP screens. This spec proves the global
 * scarlet→brand-red hue shift landed correctly — and reads AA — on ONE
 * non-HACCP light surface (`/complaints`, a light board on the `sales` role).
 *
 * It reads the resolved danger tokens off the LIVE rendered DOM of a non-HACCP
 * page, so it certifies the app-wide repaint, not a value copied from the CSS.
 *
 * 🗣 In plain English: the new brand red isn't only on the HACCP screens — it's
 *    every "something's wrong" colour across the whole light app. This checks a
 *    normal office screen (complaints) also went brand-red (not the old crimson
 *    or pink) and that red text on a pale-red panel is still readable there.
 */
import { test, expect } from '@playwright/test'
import { loginAs } from './_auth'
import { resolveColor, contrastRatio, expectBrandRed } from './_theme'

test.describe('@critical light danger surfaces — app-wide brand-red unification', () => {
  test('a non-HACCP light screen resolves danger/error/overdue to brand-red (no crimson/pink) + AA', async ({
    page,
  }) => {
    await loginAs(page, 'sales')
    await page.goto('/complaints')
    await expect(page).toHaveURL(/\/complaints/)

    // The complaints board is a LIGHT screen (not the dark HACCP kiosk).
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(0)

    // Every global light danger/error/deviation/overdue/sync-stuck token resolves
    // to the brand Mediterranean Red family — the retired crimson (#c8102e) and
    // pink maroon (#590129) must be gone everywhere, not just on HACCP.
    expectBrandRed(await resolveColor(page, 'var(--action-danger)'), 'action-danger')
    expectBrandRed(await resolveColor(page, 'var(--status-error-fill)'), 'status-error-fill')
    expectBrandRed(await resolveColor(page, 'var(--status-error-text)'), 'status-error-text')
    expectBrandRed(await resolveColor(page, 'var(--status-deviation-fill)'), 'status-deviation-fill')
    expectBrandRed(await resolveColor(page, 'var(--status-overdue-fill)'), 'status-overdue-fill')
    expectBrandRed(await resolveColor(page, 'var(--sync-stuck)'), 'sync-stuck')

    // WCAG-AA: red-700 error text on red-100 soft, measured on this page's DOM.
    const errText = await resolveColor(page, 'var(--status-error-text)')
    const errSoft = await resolveColor(page, 'var(--status-error-soft)')
    expect(contrastRatio(errText, errSoft)).toBeGreaterThanOrEqual(4.5)
  })
})
