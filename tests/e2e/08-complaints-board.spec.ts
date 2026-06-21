/**
 * tests/e2e/08-complaints-board.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-17 PR2 (complaint-route re-point). Drives the REAL
 * complaints screen in a real Chromium browser against the LOCAL Docker
 * Supabase stack, proving the re-pointed routes work end-to-end through
 * the UI — not just the API integration suite.
 *
 * Screen facts (derived from app/complaints/page.tsx source, read 2026-06-21):
 *   - /screen2 is a permanent redirect to /complaints (app/screen2/page.tsx).
 *     The complaints BOARD is the "All Complaints" tab on /complaints; the
 *     "Log New" tab on the same page is the create form.
 *   - The Log-New form does NOT POST directly. It writes a record to the
 *     local Dexie queue (screen:'screen2') then calls triggerSync(), which
 *     drains the queue to POST /api/screen2/sync (lib/syncEngine.ts:23).
 *     So creating through the UI exercises the re-pointed sync/create path
 *     ASYNCHRONOUSLY — we poll the board until the row surfaces.
 *   - The board fetches /api/screen2/all (the re-pointed GET) and prettifies
 *     `category` CLIENT-SIDE (page.tsx:331 `.replace(/_/g,' ')`). So the G1
 *     category prettify ("missing_item" → "missing item") is provable ON
 *     SCREEN here. (The receivedVia prettify lives in /api/detail/complaint,
 *     which NO screen consumes — proven in the integration suite only; noted
 *     in the cert as an API-only surface.)
 *   - Customer picker reads Dexie (useCustomers); seed it via seedLocalDb()
 *     exactly like 01-order-place.spec.ts.
 *   - Note add → POST /api/screen2/note (re-pointed). Resolve → Dexie queue
 *     (screen:'screen2_resolve') → triggerSync → POST /api/screen2/resolve.
 *
 * Category/receivedVia chosen as missing_item / in_person so the on-screen
 * prettify assertion is meaningful (both contain an underscore).
 *
 * Prereqs: npm run db:up + db:reset (ANVIL-TEST-customer + ANVIL-TEST-sales
 * planted by supabase/seed.sql); .env.e2e.local PIN/user for sales. The
 * board needs ≥1 open complaint — this spec SELF-SEEDS by logging one through
 * the UI first (ANVIL "empty smoke = RED" rule: we never assert on an empty
 * board).
 *
 * Runs under --project=chromium (numbered specs live in tests/e2e/* root,
 * NOT the ui/ subdir; playwright.config.ts ui project only matches ui/**).
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'
import { seedLocalDb }  from './_seedLocalDb'

const CUSTOMER_SEARCH = 'ANVIL-TEST'
// A marker embedded in the description so we can locate THIS run's complaint
// on a board that may contain other rows. Unique per run.
const MARKER = `E2E-board-${Date.now()}`

test.describe('@critical complaints board (F-17 PR2 re-point)', () => {

  test('log → board renders prettified category → note → resolve, all via the UI', async ({ page }) => {
    await loginAs(page, 'sales')

    // Seed Dexie from /api/reference so the customer picker is populated.
    const seed = await seedLocalDb(page)
    expect(seed.customerCount).toBeGreaterThan(0)

    // ── 1. LOG A COMPLAINT through the UI (exercises the sync/create path) ──
    await page.goto('/complaints')
    await expect(page).toHaveURL(/\/complaints/)

    // Default tab is "Log New". Make sure we're on it.
    await page.getByRole('button', { name: /log new/i }).click()

    // Pick a customer via the BottomSheetSelector (aria-label = title).
    await page.getByRole('button', { name: /select customer/i }).click()
    const customerDialog = page.getByRole('dialog')
    await expect(customerDialog).toBeVisible()
    await customerDialog.getByLabel('Search').fill(CUSTOMER_SEARCH)
    await customerDialog
      .getByRole('button', { name: /ANVIL-TEST-customer/i })
      .click()
    await expect(customerDialog).not.toBeVisible()

    // Category = "Missing item" (raw enum missing_item — underscore so the
    // board prettify is meaningful).
    await page.getByRole('button', { name: /^missing item$/i }).click()

    // Description carries the unique marker so we can find this row later.
    await page
      .getByLabel('Complaint description')
      .fill(`${MARKER} — driver left a box behind`)

    // Received via = "In person" (raw in_person).
    await page.getByRole('button', { name: /^in person$/i }).click()

    // Status = Open (so it lands in the Open section of the board).
    await page.getByRole('button', { name: /^open$/i }).click()

    // Submit — writes to Dexie + triggerSync() → POST /api/screen2/sync.
    await page.getByRole('button', { name: /log complaint/i }).click()

    // The success banner ("Logged") confirms the local write happened.
    await expect(page.getByText(/^logged$/i)).toBeVisible({ timeout: 10_000 })

    // ── 2. BOARD RENDERS THE SEEDED COMPLAINT (re-pointed GET /screen2/all) ──
    // Switch to the "All Complaints" tab.
    await page.getByRole('button', { name: /all complaints/i }).click()
    // Widen the time filter to All time so the just-logged row is in range
    // regardless of today's boundary handling.
    await page.getByRole('button', { name: /all time/i }).click()

    // The sync is async; the board fetches /api/screen2/all on mount. Poll by
    // reloading the board until our marker row appears (the sync has drained
    // and the re-pointed GET returns it).
    const card = page.locator('div').filter({ has: page.getByText(MARKER) }).first()
    await expect(async () => {
      await page.reload()
      await page.getByRole('button', { name: /all complaints/i }).click()
      await page.getByRole('button', { name: /all time/i }).click()
      await expect(card).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    // ── G1 (category half) PROVEN ON SCREEN: raw enum 'missing_item' renders
    // as "missing item" (underscore replaced) in the card's category line. ──
    await expect(
      card.getByText(/missing item/i),
    ).toBeVisible()
    // And the raw underscore form must NOT appear on screen.
    await expect(card.getByText('missing_item')).toHaveCount(0)

    // ── 3. ADD A NOTE (re-pointed POST /api/screen2/note) ──
    // The card's note toggle is "Add note" when there are no notes yet.
    await card.getByRole('button', { name: /add note/i }).click()
    const noteText = `${MARKER}-note kitchen confirmed shortfall`
    await card.getByPlaceholder(/leave an internal note/i).fill(noteText)
    await card.getByRole('button', { name: /post note/i }).click()
    // The note body appears in the thread (state updated from the POST result).
    await expect(card.getByText(noteText)).toBeVisible({ timeout: 10_000 })

    // ── 4. RESOLVE (Dexie queue → triggerSync → POST /api/screen2/resolve) ──
    await card.getByRole('button', { name: /^resolve$/i }).click()
    await card
      .getByPlaceholder(/describe how this was resolved/i)
      .fill(`${MARKER}-resolution refunded the customer`)
    await card.getByRole('button', { name: /mark resolved/i }).click()

    // Optimistic UI flips the card to Resolved immediately; assert the
    // resolved state badge shows on the card.
    await expect(card.getByText(/resolved/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
