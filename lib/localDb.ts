/**
 * lib/localDb.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dexie.js (IndexedDB) local database for the MFS Operations App.
 *
 * Three concerns live here:
 *   1. Queue     — offline submission buffer for Screens 1, 2, 3
 *   2. Reference — local mirror of customers and products for offline selectors
 *   3. Sync      — utility to refresh reference data from the API
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Dexie, { type Table } from 'dexie'

// ─── Table schemas ────────────────────────────────────────────────────────────

/**
 * A submission queued for upload while offline.
 * Written by Screens 1, 2, 3 on every submit.
 * Marked synced = true once the API confirms the write.
 */
export interface QueuedRecord {
  localId:    string                              // client-generated UUID
  screen:     'screen1' | 'screen2' | 'screen3' | 'screen2_resolve'
  payload:    Record<string, unknown>             // the full form submission
  createdAt:  number                              // unix ms timestamp
  synced:     boolean
  syncError?: string                              // last error message if sync failed
  retries:    number                              // incremented on each failed attempt
}

/**
 * Local mirror of the `customers` Supabase table.
 * Only active customers are stored here — inactive ones are excluded at fetch time.
 */
export interface LocalCustomer {
  id:        string   // matches Supabase uuid
  name:      string
  syncedAt:  number   // unix ms — when this record was last pulled from the API
}

/**
 * Local mirror of the `products` Supabase table.
 * Only active products are stored here.
 */
export interface LocalProduct {
  id:        string   // matches Supabase uuid
  name:      string
  category:  string | null
  box_size:  string | null
  code:      string | null
  syncedAt:  number
}

/**
 * Lightweight metadata table — one row per reference dataset.
 * Tracks the last successful full sync so we can decide whether
 * a background refresh is needed.
 */
export interface SyncMeta {
  key:          'customers' | 'products'  // primary key
  lastSyncedAt: number                    // unix ms
  recordCount:  number
}

// ─── Database class ───────────────────────────────────────────────────────────

class MFSLocalDB extends Dexie {
  // Operational tables
  queue!:     Table<QueuedRecord,  string>   // PK: localId
  // Reference tables
  customers!: Table<LocalCustomer, string>   // PK: id
  products!:  Table<LocalProduct,  string>   // PK: id
  // Metadata
  syncMeta!:  Table<SyncMeta,      string>   // PK: key

  constructor() {
    super('mfs-ops')

    /**
     * Version history — never modify an existing version, always add a new one.
     * v1: queue only (Task 2 — offline submission buffer)
     * v2: customers, products, syncMeta (Task 6 — reference data offline sync)
     */
    this.version(1).stores({
      queue: 'localId, screen, synced, createdAt',
    })

    this.version(2).stores({
      queue:     'localId, screen, synced, createdAt',
      customers: 'id, name',
      products:  'id, name, category',
      syncMeta:  'key',
    })
  }
}

export const localDb = new MFSLocalDB()

// ─── Reference data sync ──────────────────────────────────────────────────────

/** Minimum time between background refreshes: 30 minutes */
const BACKGROUND_REFRESH_INTERVAL_MS = 30 * 60 * 1000

/**
 * API response shape expected from /api/reference.
 * The Next.js route reads from Supabase and returns only active records.
 */
interface ReferenceDataResponse {
  customers: Array<{ id: string; name: string }>
  products:  Array<{ id: string; name: string; category: string | null; box_size: string | null; code: string | null }>
}

/**
 * syncReferenceData()
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the latest active customers and products from the API and performs
 * a full replace of both local Dexie tables in a single atomic transaction.
 *
 * A full replace is intentional — it handles deletions and name changes without
 * needing a diffing strategy. The tables are small enough (< 200 rows each in
 * typical MFS usage) that this is faster and simpler than delta sync.
 *
 * @param options.force  — bypass the 30-minute cooldown and sync regardless
 * @returns              — { success, customerCount, productCount } or { success: false, error }
 */
export async function syncReferenceData(
  options: { force?: boolean } = {}
): Promise<
  | { success: true;  customerCount: number; productCount: number }
  | { success: false; error: string }
> {
  // ── Cooldown check ──────────────────────────────────────────────────────────
  if (!options.force) {
    const [customerMeta, productMeta] = await Promise.all([
      localDb.syncMeta.get('customers'),
      localDb.syncMeta.get('products'),
    ])

    const now           = Date.now()
    const customerStale = !customerMeta || now - customerMeta.lastSyncedAt > BACKGROUND_REFRESH_INTERVAL_MS
    const productStale  = !productMeta  || now - productMeta.lastSyncedAt  > BACKGROUND_REFRESH_INTERVAL_MS

    // Both datasets are fresh — nothing to do
    if (!customerStale && !productStale) {
      return {
        success:       true,
        customerCount: customerMeta?.recordCount ?? 0,
        productCount:  productMeta?.recordCount  ?? 0,
      }
    }
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  let data: ReferenceDataResponse

  try {
    const res = await fetch('/api/reference', {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
      // 10-second timeout — if the network is that slow, we keep what we have
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`API returned ${res.status}: ${res.statusText}`)
    }

    data = await res.json() as ReferenceDataResponse
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    // Non-fatal — app continues with whatever is already in IndexedDB
    console.warn('[syncReferenceData] Fetch failed, using cached data:', message)
    return { success: false, error: message }
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  if (
    !Array.isArray(data.customers) ||
    !Array.isArray(data.products)
  ) {
    return { success: false, error: 'Unexpected API response shape' }
  }

  // ── Write — atomic transaction ──────────────────────────────────────────────
  const now = Date.now()

  const freshCustomers: LocalCustomer[] = data.customers.map((c) => ({
    id:       c.id,
    name:     c.name,
    syncedAt: now,
  }))

  const freshProducts: LocalProduct[] = data.products.map((p) => ({
    id:       p.id,
    name:     p.name,
    category: p.category,
    box_size: p.box_size ?? null,
    code:     p.code     ?? null,
    syncedAt: now,
  }))

  try {
    await localDb.transaction(
      'rw',
      [localDb.customers, localDb.products, localDb.syncMeta],
      async () => {
        // Full replace — clear then bulk insert
        await localDb.customers.clear()
        await localDb.products.clear()
        await localDb.customers.bulkAdd(freshCustomers)
        await localDb.products.bulkAdd(freshProducts)

        // Update sync metadata
        await localDb.syncMeta.put({
          key:          'customers',
          lastSyncedAt: now,
          recordCount:  freshCustomers.length,
        })
        await localDb.syncMeta.put({
          key:          'products',
          lastSyncedAt: now,
          recordCount:  freshProducts.length,
        })
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'IndexedDB write error'
    console.error('[syncReferenceData] Transaction failed:', message)
    return { success: false, error: message }
  }

  return {
    success:       true,
    customerCount: freshCustomers.length,
    productCount:  freshProducts.length,
  }
}

/**
 * isReferenceDateStale()
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns true if either reference dataset has never been synced or is older
 * than the background refresh interval. Used by the login handler to decide
 * whether to show a "Loading data…" state before entering the app.
 */
export async function isReferenceDataStale(): Promise<boolean> {
  const [customerMeta, productMeta] = await Promise.all([
    localDb.syncMeta.get('customers'),
    localDb.syncMeta.get('products'),
  ])

  if (!customerMeta || !productMeta) return true  // never synced

  const now = Date.now()
  return (
    now - customerMeta.lastSyncedAt > BACKGROUND_REFRESH_INTERVAL_MS ||
    now - productMeta.lastSyncedAt  > BACKGROUND_REFRESH_INTERVAL_MS
  )
}
