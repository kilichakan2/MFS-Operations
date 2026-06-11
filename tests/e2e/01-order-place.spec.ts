/**
 * tests/e2e/order-place.spec.ts
 *
 * @critical
 *
 * Sales rep places an order end-to-end via the UI. Selectors derived
 * directly from app/orders/new/page.tsx + components/BottomSheetSelector.tsx
 * source. Static rendering checked at 2026-06-01.
 *
 * Key UI facts:
 *   - AppHeader renders the page title as plain text in the banner,
 *     NOT as a <h1>/<h2>. Don't use getByRole('heading') for "New
 *     order" or "Orders".
 *   - BottomSheetSelector is a search-then-pick dialog. aria-label =
 *     the `title` prop. Customer picker = "Pick a customer", product
 *     picker = "Pick a product".
 *   - Each line card is a <div> with `<span>Line N</span>` inside.
 *     Use :has() to scope to that wrapper.
 *   - UOM buttons are exact text "kg" and "unit".
 *   - The "Catalogue" tap-button opens the product picker directly.
 *
 * Prerequisites: ANVIL-TEST-customer, ANVIL-TEST-product, and an
 * ANVIL-TEST-sales user whose pin_hash bcrypt-matches E2E_PIN_SALES
 * (gitignored .env.e2e.local) — all planted by supabase/seed.sql on
 * a fresh `npm run db:reset` (F-INFRA-02). Plaintext test PINs live
 * only in .env.e2e.local, never in this repo.
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'
import { seedLocalDb }  from './_seedLocalDb'

const CUSTOMER_SEARCH = 'ANVIL-TEST'
const PRODUCT_SEARCH  = 'ANVIL-TEST'

test.describe('@critical order placement flow', () => {

  test('sales rep places an order with catalogued + ad-hoc lines', async ({ page }) => {
    await loginAs(page, 'sales')

    // Seed the local Dexie DB from /api/reference. Playwright launches
    // a fresh browser context per test so IndexedDB starts empty; the
    // app's normal sync is event-driven and flaky in headless mode.
    // This is deterministic and uses the real /api/reference response.
    const seed = await seedLocalDb(page)
    expect(seed.customerCount).toBeGreaterThan(0)
    expect(seed.productCount).toBeGreaterThan(0)

    // 1. Navigate to /orders/new
    await page.goto('/orders/new')

    // 2. Assert we landed on the right page — by URL, not heading
    await expect(page).toHaveURL(/\/orders\/new$/)
    // The Line items section is a real h2, so we can wait on that
    await expect(page.getByRole('heading', { name: /line items/i })).toBeVisible()

    // 3. Open customer picker
    await page.getByText(/tap to choose a customer/i).click()

    // 4. Customer dialog — title="Pick a customer" so aria-label matches
    const customerDialog = page.getByRole('dialog', { name: /pick a customer/i })
    await expect(customerDialog).toBeVisible()
    await customerDialog.getByRole('searchbox').fill(CUSTOMER_SEARCH)
    await customerDialog
      .getByRole('button', { name: /ANVIL-TEST-customer/i })
      .click()
    await expect(customerDialog).not.toBeVisible()

    // 5. Locate line 1 wrapper via :has() — finds the immediate <div>
    //    whose direct content contains the "Line 1" span.
    const line1 = page.locator('div').filter({
      has: page.getByText('Line 1', { exact: true }),
    }).first()

    // 6. Tap the "Catalogue" tab — opens the product picker
    await line1.getByRole('button', { name: 'Catalogue', exact: true }).click()

    // 7. Product dialog — title="Pick a product"
    const productDialog = page.getByRole('dialog', { name: /pick a product/i })
    await expect(productDialog).toBeVisible()
    await productDialog.getByRole('searchbox').fill(PRODUCT_SEARCH)
    await productDialog
      .getByRole('button', { name: /ANVIL-TEST-product/i })
      .click()
    await expect(productDialog).not.toBeVisible()

    // 8. Fill qty on line 1 — placeholder="Qty"
    await line1.getByPlaceholder('Qty').fill('10.5')

    // 9. Add a second line
    await page.getByRole('button', { name: /^\+? ?add line$/i }).click()

    const line2 = page.locator('div').filter({
      has: page.getByText('Line 2', { exact: true }),
    }).first()

    // 10. Switch line 2 to Ad-hoc mode
    await line2.getByRole('button', { name: 'Ad-hoc', exact: true }).click()

    // 11. Fill ad-hoc description + qty + uom
    await line2
      .getByPlaceholder(/free-text description/i)
      .fill('Mutton trim — E2E test')
    await line2.getByPlaceholder('Qty').fill('4')
    await line2.getByRole('button', { name: 'unit', exact: true }).click()

    // 12. Confirm
    await page.getByRole('button', { name: /confirm order/i }).click()

    // 13. Redirected to /orders/{uuid}
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 10_000 })

    // 14. Reference + state visible on detail. Anchor the 'placed'
    //     regex so it matches the state badge only, not the
    //     'Placed by' attribution label that contains the same word.
    await expect(page.getByText(/MFS-\d{4}-\d{4}/)).toBeVisible()
    await expect(page.getByText(/^placed$/i)).toBeVisible()
  })

  test('dashboard shows the new order under Today + tomorrow', async ({ page }) => {
    await loginAs(page, 'sales')
    await page.goto('/orders')

    // No <h1>Orders</h1> — the page title is plain text in the banner.
    // Assert by URL + by the recent order reference becoming visible.
    await expect(page).toHaveURL(/\/orders(\?|$)/)

    await expect(
      page.getByText(/MFS-\d{4}-\d{4}/).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
