/**
 * tests/e2e/10-haccp-corrective-action.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives the REAL
 * HACCP screens in a real Chromium browser against the LOCAL Supabase stack,
 * proving the re-pointed routes work end-to-end through the UI — the full live
 * food-safety loop the API integration suite proves at the wire level:
 *
 *   warehouse logs a product return (food-safety code RC02)
 *     → POST /api/haccp/product-return (re-pointed) files exactly 1 CA row with
 *       management_verification_required:true (SOP-12 always-1-CA rule)
 *   → admin opens the corrective-action queue
 *     → GET /api/haccp/corrective-actions (re-pointed) returns the unresolved row
 *   → admin signs it off
 *     → PATCH /api/haccp/corrective-actions/[id] (re-pointed) stamps
 *       verified_by / verified_at / resolved:true and the card leaves the queue.
 *
 * Why product-return: it is the cleanest live deviation→queue→sign-off path —
 * it POSTs directly (no Dexie sync queue), ALWAYS files a CA, and a food-safety
 * code (RC02) makes that CA require management sign-off so it lands in the admin
 * queue. It has NO date-unique index, so it does not 409 on a same-day re-run.
 *
 * Screen facts (from app/haccp/product-return/page.tsx + app/haccp/admin/page.tsx,
 * read 2026-06-23):
 *   - /haccp/product-return: select a return code (RC02 = Quality issue, no temp
 *     probe), pick a customer (use the manual "Other" entry to avoid Dexie),
 *     enter product, choose a disposition, choose "Disposition authorised by",
 *     Submit return → "Return logged successfully".
 *   - /haccp/admin (admin only): the Corrective Actions tab fetches
 *     /api/haccp/corrective-actions; each unresolved row is a card whose body is
 *     the deviation_description (which embeds the customer + product). The card's
 *     "Sign off — verified by management" button PATCHes the row; a "Signed off
 *     successfully" flash confirms it and the card moves to "Recently signed off".
 *
 * A unique product MARKER is embedded so the spec finds THIS run's card on a
 * queue that the append-only CA ledger never clears.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with PIN/user for warehouse
 * and password for admin. Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

// Unique per run — embedded in the product description so the deviation row is
// locatable on a queue that the append-only ledger never clears.
const MARKER = `E2E-CA-${Date.now()}`

test.describe('@critical HACCP corrective-action loop (F-19 PR2 re-point)', () => {
  test('log a food-safety return → it lands in the admin queue → admin signs it off', async ({
    page,
  }) => {
    // ── 1. WAREHOUSE LOGS A FOOD-SAFETY RETURN (re-pointed POST) ──
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/product-return')
    await expect(page).toHaveURL(/\/haccp\/product-return/)

    // RC02 = Quality issue (food-safety code → CA requires management sign-off;
    // no temperature probe required, unlike RC01).
    await page.getByRole('button', { name: /RC02/ }).click()

    // Customer via the manual "Other" entry (avoids the Dexie customer picker).
    await page.getByPlaceholder(/search customer name/i).fill(`${MARKER}-cust`)
    await page.getByRole('button', { name: /Other \/ not in list/i }).click()

    // Product description carries the unique marker.
    await page
      .getByPlaceholder(/Lamb leg/i)
      .fill(`${MARKER} returned tray — off odour`)

    // Disposition: "Dispose as ABP". RC02's disposition is written RAW into BOTH
    // haccp_returns.disposition (CHECK: restock|reprocess|quarantine|dispose) AND
    // the CA ledger's product_disposition (CHECK: accept|conditional_accept|
    // reject|dispose|assess). 'dispose' is the value valid in BOTH — so the CA
    // row actually persists and lands in the management queue. (Picking
    // quarantine/reprocess would make the CA insert fail the ledger CHECK; the
    // soft-fail contract would swallow it — return still saved, but no queue row.)
    await page.getByRole('button', { name: /Dispose as ABP/ }).click()

    // Disposition authorised by — pick a preset.
    await page.getByRole('button', { name: /^Hakan$/ }).click()

    // Submit — POST /api/haccp/product-return (re-pointed).
    await page.getByRole('button', { name: /submit return/i }).click()
    await expect(page.getByText(/return logged successfully/i)).toBeVisible({
      timeout: 10_000,
    })

    // The just-logged return shows in today's log with its product marker.
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })

    // ── 2. ADMIN OPENS THE CORRECTIVE-ACTION QUEUE (re-pointed GET) ──
    await logout(page)
    const adminUser = process.env.E2E_USER_ADMIN ?? ''
    const adminPass = process.env.E2E_PASSWORD_ADMIN ?? ''
    await loginAsAdmin(page, adminUser, adminPass)

    await page.goto('/haccp/admin')
    await expect(page).toHaveURL(/\/haccp\/admin/)

    // The queue card body is the deviation_description, which embeds the
    // customer ("...Customer: <MARKER>-cust. Product: <MARKER> ...") so the
    // MARKER appears on the unresolved card. Poll until it surfaces.
    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: MARKER })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    // ── 3. ADMIN SIGNS IT OFF (re-pointed PATCH) ──
    await card
      .first()
      .getByRole('button', { name: /sign off — verified by management/i })
      .click()

    // Flash confirms the PATCH stamped verified_by / verified_at / resolved.
    await expect(page.getByText(/signed off successfully/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
