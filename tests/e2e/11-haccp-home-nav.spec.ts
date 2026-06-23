/**
 * tests/e2e/11-haccp-home-nav.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Proves the HACCP
 * home dashboard (/haccp) tile taps route to the correct screens — the entry
 * point every warehouse user hits before any form. PR2 re-pointed the 9 Cluster-A
 * API routes; the home tiles themselves are pure navigation (window.location.href
 * in app/haccp/page.tsx), so this spec proves the kiosk's front door still opens
 * every door correctly after the re-point.
 *
 * Screen facts (app/haccp/page.tsx, read 2026-06-23): once a warehouse session
 * cookie is present, HaccpRoot renders HomeScreen with a tile grid. Each tile is
 * an onPointerDown handler that sets window.location.href to the screen path.
 * The 7 Cluster-A tiles assert here:
 *   Cold Storage   → /haccp/cold-storage
 *   Process Room   → /haccp/process-room
 *   Delivery       → /haccp/delivery
 *   Mince / Prep   → /haccp/mince
 *   Product Return → /haccp/product-return
 *   Cleaning       → /haccp/cleaning
 *   Calibration    → /haccp/calibration
 *
 * Each tile's accessible name is built from label + sub text; we click by the
 * label substring. After each tap we assert the URL, then navigate back to /haccp
 * for the next tile (the kiosk uses hard navigation, so a fresh goto re-mounts
 * the home screen with the session cookie still set).
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './_auth'

// Tile label → expected destination path. Order matches the on-screen grid.
const TILES: { label: RegExp; path: RegExp }[] = [
  { label: /^Cold Storage$/,   path: /\/haccp\/cold-storage$/ },
  { label: /^Process Room$/,   path: /\/haccp\/process-room$/ },
  { label: /^Delivery$/,       path: /\/haccp\/delivery$/ },
  { label: /^Mince \/ Prep$/,  path: /\/haccp\/mince$/ },
  { label: /^Product Return$/, path: /\/haccp\/product-return$/ },
  { label: /^Cleaning$/,       path: /\/haccp\/cleaning$/ },
  { label: /^Calibration$/,    path: /\/haccp\/calibration$/ },
]

test.describe('@critical HACCP home dashboard navigation (F-19 PR2 re-point)', () => {
  test('every Cluster-A tile routes to its screen', async ({ page }) => {
    await loginAs(page, 'warehouse')

    for (const tile of TILES) {
      // Re-mount the home screen for each tile (kiosk uses hard navigation).
      await page.goto('/haccp')
      // HomeScreen reads the role cookie on mount; wait for a tile to render.
      await expect(page.getByText(tile.label).first()).toBeVisible({
        timeout: 10_000,
      })

      // The tile's label text lives inside the clickable tile div; click it.
      await page.getByText(tile.label).first().click()

      await expect(page).toHaveURL(tile.path, { timeout: 10_000 })
    }
  })
})
