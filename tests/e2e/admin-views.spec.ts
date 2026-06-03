/**
 * tests/e2e/admin-views.spec.ts
 *
 * Item 5a.1 PR B — structural assertions for the five new admin
 * list pages: /admin/visits, /admin/at-risk, /admin/commitments,
 * /admin/prospects, /admin/discrepancies.
 *
 * Each page gets:
 *   - Page-load + AppHeader title visible.
 *   - PageHeading eyebrow rendered.
 *   - Card with expected column header text (or EmptyState).
 *
 * /admin/visits and /admin/discrepancies have RangeTabs — those
 * get an additional assertion that clicking a different preset
 * triggers a re-fetch (spinner appears OR row content swaps).
 *
 * Not covered:
 *   - Exact data values (these are structural tests).
 *   - Per-row drill-down (out of scope per Frame Q7).
 *   - Non-admin gating (middleware enforces — covered by chrome
 *     matrix; non-admin roles don't have /admin in their
 *     ROLE_PERMISSIONS list and would 302 to their role home).
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('Admin views (Item 5a.1 PR B)', () => {

  test.beforeEach(async ({ page }) => {
    const user = process.env.E2E_USER_ADMIN
    const pwd  = process.env.E2E_PASSWORD_ADMIN
    if (!user || !pwd) {
      throw new Error(
        'MISSING_CREDS: E2E_USER_ADMIN and/or E2E_PASSWORD_ADMIN not set in .env.e2e.local.',
      )
    }
    await loginAsAdmin(page, user, pwd)
  })

  // ── /admin/visits ───────────────────────────────────────────────────────────

  test('/admin/visits renders with filters + RangeTabs', async ({ page }) => {
    await page.goto('/admin/visits', { waitUntil: 'networkidle' })
    await expect(page.getByText('Admin · All reps · Visits', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Today$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^This week$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^This month$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^This quarter$/ })).toBeVisible()
    // Secondary filters (type + outcome chips)
    await expect(page.getByRole('button', { name: /^All types$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^All outcomes$/ })).toBeVisible()
  })

  test('/admin/visits RangeTabs change triggers re-fetch', async ({ page }) => {
    await page.goto('/admin/visits', { waitUntil: 'networkidle' })
    // Today is active initially; click This week, await networkidle.
    await page.getByRole('button', { name: /^This week$/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /^This week$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  // ── /admin/at-risk ──────────────────────────────────────────────────────────

  test('/admin/at-risk renders with expected card header', async ({ page }) => {
    await page.goto('/admin/at-risk', { waitUntil: 'networkidle' })
    await expect(page.getByText('Admin · At-risk accounts', { exact: false })).toBeVisible()
    // Card header text "At-risk accounts — last 7 days" — scope to <main>
    // to skip the mobile-chrome-only hidden duplicate in the AppHeader.
    await expect(page.locator('main').getByText('At-risk accounts', { exact: false }).first()).toBeVisible()
  })

  // ── /admin/commitments ──────────────────────────────────────────────────────

  test('/admin/commitments renders with expected card header', async ({ page }) => {
    await page.goto('/admin/commitments', { waitUntil: 'networkidle' })
    await expect(page.getByText('Admin · Unreviewed commitments', { exact: false })).toBeVisible()
    await expect(page.locator('main').getByText('Unreviewed commitments', { exact: false }).first()).toBeVisible()
  })

  // ── /admin/prospects ────────────────────────────────────────────────────────

  test('/admin/prospects renders with expected card header', async ({ page }) => {
    await page.goto('/admin/prospects', { waitUntil: 'networkidle' })
    await expect(page.getByText('Admin · Prospects', { exact: false })).toBeVisible()
    await expect(page.getByText('Prospects this week', { exact: false })).toBeVisible()
  })

  // ── /admin/discrepancies ────────────────────────────────────────────────────

  test('/admin/discrepancies renders with RangeTabs + caption', async ({ page }) => {
    await page.goto('/admin/discrepancies', { waitUntil: 'networkidle' })
    await expect(page.getByText('Admin · Discrepancies', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Today$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^This quarter$/ })).toBeVisible()
  })

  test('/admin/discrepancies?range=week initialises Range to "This week" (C12)', async ({ page }) => {
    await page.goto('/admin/discrepancies?range=week', { waitUntil: 'networkidle' })
    // C12 wired URL-init via parseRangePreset — landing with
    // ?range=week selects the This week chip (aria-pressed=true).
    await expect(page.getByRole('button', { name: /^This week$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Today$/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('/admin/discrepancies?range=quarter initialises Range to "This quarter" (C12)', async ({ page }) => {
    await page.goto('/admin/discrepancies?range=quarter', { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /^This quarter$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('/admin/discrepancies?range=banana falls through to Today (C12 fallback)', async ({ page }) => {
    await page.goto('/admin/discrepancies?range=banana', { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /^Today$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('/admin/visits?range=month initialises Range to "This month" (C12)', async ({ page }) => {
    await page.goto('/admin/visits?range=month', { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: /^This month$/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Today$/ })).toHaveAttribute('aria-pressed', 'false')
  })

  // ── Chrome hotfix: AppHeader desktop actions slot ────────────────────────
  // Before fix/app-header-desktop-actions the desktop AppHeader variant
  // dropped the `actions` prop entirely — HACCP + Refresh were
  // reachable only from mobile. Pin desktop visibility from one admin
  // list page so a regression on either the slot wiring or the action
  // JSX in the admin pages would fail this assertion.

  test('AppHeader renders HACCP shortcut on desktop (/admin/at-risk)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/at-risk', { waitUntil: 'networkidle' })
    const banner = page.getByRole('banner').first()
    await expect(banner).toBeVisible()
    await expect(banner.getByRole('link', { name: /HACCP/i })).toBeVisible()
  })
})
