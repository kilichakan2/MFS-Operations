/**
 * tests/e2e/_seedLocalDb.ts
 *
 * The MFS Operations app reads its customer and product pickers from
 * a local IndexedDB (Dexie, db name 'mfs-ops'). On a fresh browser
 * context the local DB is empty until the app's sync layer
 * (lib/localDb.ts) pulls /api/reference and writes records.
 *
 * Playwright launches a fresh browser context per test, so the sync
 * layer must run between login and the order-creation flow. That
 * sync is event-driven (visibility/focus), non-trivial to await
 * deterministically, and can be flaky in headless mode.
 *
 * For E2E we trigger the sync deterministically: after login, call
 * /api/reference directly from the page context (cookies attached,
 * middleware permits it), then write the result rows into Dexie. Uses
 * the SAME response shape and DB schema the app uses — so the customer
 * IDs are real, FK-valid, and matching whatever's in the DB.
 *
 * Real production user data is untouched — this only writes to the
 * test browser's in-memory IndexedDB, which dies with the context.
 */

import type { Page } from '@playwright/test'

/**
 * Call /api/reference and seed the local Dexie 'mfs-ops' DB with the
 * returned customers + products. Must be called AFTER login (the
 * cookies set during login authorise the reference fetch).
 *
 * Returns the seeded record counts so callers can sanity-check.
 */
export async function seedLocalDb(page: Page): Promise<{
  customerCount: number
  productCount:  number
}> {
  const result = await page.evaluate(async () => {
    // 1. Fetch from /api/reference using the session cookie
    const res = await fetch('/api/reference', { credentials: 'include' })
    if (!res.ok) {
      throw new Error(`/api/reference returned ${res.status}`)
    }
    const { customers, products } = await res.json() as {
      customers: Array<{ id: string; name: string }>
      products:  Array<{
        id:       string
        name:     string
        category: string | null
        box_size: string | null
        code:     string | null
      }>
    }

    // 2. Open the Dexie DB — uses the same name as the app
    // @ts-expect-error — in-browser dynamic import, evaluated inside page.evaluate
    const { default: Dexie } = await import('https://esm.sh/dexie@4')
    const db = new Dexie('mfs-ops')
    db.version(2).stores({
      queue:     'localId, screen, synced, createdAt',
      customers: 'id, name',
      products:  'id, name, category',
      syncMeta:  'key',
    })

    const now = Date.now()

    // 3. Bulk-put records
    await db.table('customers').bulkPut(
      customers.map(c => ({ id: c.id, name: c.name, syncedAt: now })),
    )

    await db.table('products').bulkPut(
      products.map(p => ({
        id:       p.id,
        name:     p.name,
        category: p.category,
        box_size: p.box_size,
        code:     p.code,
        syncedAt: now,
      })),
    )

    await db.table('syncMeta').put({ key: 'customers', lastSyncedAt: now, recordCount: customers.length })
    await db.table('syncMeta').put({ key: 'products',  lastSyncedAt: now, recordCount: products.length })

    db.close()

    return {
      customerCount: customers.length,
      productCount:  products.length,
    }
  })

  // Reload so any in-memory React state re-reads from the now-seeded DB
  await page.reload()

  return result
}
