/**
 * tests/e2e/21-haccp-product-specs.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR3 (Cluster-B HACCP route re-point). Drives the Product
 * Specifications screen in a real Chromium browser against the LOCAL Supabase
 * stack, exercising all three persistence behaviours behind the re-pointed
 * routes:
 *   - POST  /api/haccp/product-specs            — create a spec;
 *   - PATCH /api/haccp/product-specs            — edit it IN PLACE;
 *   - PATCH /api/haccp/product-specs {active:false} — soft-delete (the spec
 *     disappears from the active register).
 *
 * Screen facts (app/haccp/product-specs/page.tsx):
 *   - Heading "Product Specifications".
 *   - Admin "+ Add spec" opens the form; "Product name *" (placeholder
 *     "e.g. MFS Burger Patty 125g"); submit "Save".
 *   - Detail view: "Edit", "Delete". Delete dialog: "Confirm delete".
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with admin PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('@critical HACCP product-specs (F-19 PR3 re-point)', () => {
  test('admin creates, edits in place, then soft-deletes a product spec', async ({
    page,
  }) => {
    const name = `E2E-PS-${Date.now()}`
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/product-specs')
    // The screen title renders as a <p> (not a heading element), so match on text.
    await expect(page.getByText('Product Specifications', { exact: true })).toBeVisible()

    // The unique name lets us target THIS spec's list row deterministically,
    // rather than `.first()` which is ambiguous when leftover E2E-PS-… rows
    // exist on the branch.
    const row = page.getByRole('button', { name: new RegExp(name) })

    // ── create ──
    await page.getByRole('button', { name: /\+ Add spec/i }).click()
    await page
      .getByPlaceholder(/e\.g\. MFS Burger Patty 125g/i)
      .fill(name)
    await page.getByRole('button', { name: /^Save$/ }).click()

    // The new spec appears in the active register.
    await expect(row).toBeVisible({ timeout: 10_000 })

    // ── edit in place ──
    await row.click()
    // Wait for the detail view before acting on it.
    await expect(page.getByRole('button', { name: /^Edit$/ })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: /^Edit$/ }).click()
    await page
      .getByPlaceholder(/e\.g\. Fresh beef burger patty/i)
      .fill('E2E edited description')
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(row).toBeVisible({ timeout: 10_000 })

    // ── soft-delete (active:false → disappears from the active register) ──
    await row.click()
    // The detail view must be ready (Delete visible) before we click it.
    await expect(page.getByRole('button', { name: /^Delete$/ })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await page.getByRole('button', { name: /confirm delete/i }).click()

    await expect(page.getByText(new RegExp(name))).toHaveCount(0, {
      timeout: 10_000,
    })
  })
})
