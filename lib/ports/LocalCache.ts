/**
 * lib/ports/LocalCache.ts
 *
 * The LocalCache port — the app's own socket for the field-worker PWA's
 * client-side offline store (the browser's IndexedDB). The IndexedDB vendor
 * (currently `dexie`) plugs in behind it via an adapter under
 * `lib/adapters/dexie/`; the rest of the app never sees the word `dexie`. (F-26)
 *
 * Three concerns sit behind this one socket:
 *   1. Queue     — offline submission buffer for Screens 1, 2, 3 (writes + reads)
 *   2. Reference — local mirror of customers and products for offline selectors
 *   3. SyncMeta  — last-successful-sync metadata used for the staleness cooldown
 *
 * Pure TypeScript: NO `dexie` import, NO `dexie-react-hooks` import, NO React
 * import, NO framework import. Dexie's `Table<T>` was the only vendor type in
 * the old lib/localDb.ts and it stays inside the adapter — the four owned types
 * below are already vendor-neutral, so they move here verbatim.
 *
 * NOTE: the reactive `useLiveQuery`-backed hooks are NOT on this interface —
 * they are React-coupled and live in the adapter's `react.ts` (exposed via
 * wiring). Keeping them off the port lets the port stay pure TS with an
 * in-memory Fake + a shared contract. The HTTP fetch + 30-minute cooldown also
 * live OUTSIDE the port (in the `refreshReferenceData` use-case) — the adapter
 * is a dumb store and never does HTTP.
 */

// ── Owned types (moved verbatim from lib/localDb.ts — already vendor-neutral) ──

/**
 * A submission queued for upload while offline.
 * Written by Screens 1, 2, 3 on every submit.
 * Marked synced = true once the API confirms the write.
 */
export interface QueuedRecord {
  localId: string; // client-generated UUID
  screen: "screen1" | "screen2" | "screen3" | "screen2_resolve";
  payload: Record<string, unknown>; // the full form submission
  createdAt: number; // unix ms timestamp
  synced: boolean;
  syncError?: string; // last error message if sync failed
  retries: number; // incremented on each failed attempt
}

/**
 * Local mirror of the `customers` Supabase table.
 * Only active customers are stored here — inactive ones are excluded at fetch time.
 */
export interface LocalCustomer {
  id: string; // matches Supabase uuid
  name: string;
  syncedAt: number; // unix ms — when this record was last pulled from the API
}

/**
 * Local mirror of the `products` Supabase table.
 * Only active products are stored here.
 */
export interface LocalProduct {
  id: string; // matches Supabase uuid
  name: string;
  category: string | null;
  box_size: string | null;
  code: string | null;
  syncedAt: number;
}

/**
 * Lightweight metadata — one row per reference dataset.
 * Tracks the last successful full sync so the use-case can decide whether
 * a background refresh is needed (the 30-minute cooldown).
 */
export interface SyncMeta {
  key: "customers" | "products"; // primary key
  lastSyncedAt: number; // unix ms
  recordCount: number;
}

/**
 * The owned socket for the offline store. Every method maps to a single
 * client-side store operation; NONE does HTTP (the use-case owns the fetch) and
 * NONE reads the clock (`replaceReferenceData` takes `now` injected — R4).
 */
export interface LocalCache {
  // ── Queue: writes ──
  /** queue.add — insert; rejects on duplicate localId (Dexie add semantics). */
  addToQueue(record: QueuedRecord): Promise<void>;
  /** queue.put — upsert (visits edit path). */
  putToQueue(record: QueuedRecord): Promise<void>;
  /** queue.where('localId').equals(localId).delete() — no-op if absent. */
  deleteFromQueue(localId: string): Promise<void>;
  /** queue.update(localId, patch) — partial update; no-op if absent (Dexie update). */
  updateQueue(localId: string, patch: Partial<QueuedRecord>): Promise<void>;

  // ── Queue: reads ──
  /** queue.toArray() — every record (syncEngine). */
  listQueue(): Promise<QueuedRecord[]>;
  /** queue.filter(r => !r.synced).toArray() — unsynced only (non-reactive read). */
  listUnsynced(): Promise<QueuedRecord[]>;

  // ── Reference: reads ──
  /** customers.orderBy('name').toArray() */
  listCustomers(): Promise<LocalCustomer[]>;
  /** products.orderBy('name').toArray() */
  listProducts(): Promise<LocalProduct[]>;

  // ── Reference: replace (atomic, NO fetch — pure store op) ──
  /**
   * Full replace of both reference tables in one atomic transaction: clear
   * customers + products, bulkAdd the fresh rows, put both syncMeta rows. `now`
   * is INJECTED (stamped onto every row's syncedAt + both meta lastSyncedAt) so
   * a frozen-clock test pins the exact timestamps written.
   */
  replaceReferenceData(
    customers: ReadonlyArray<{ id: string; name: string }>,
    products: ReadonlyArray<{
      id: string;
      name: string;
      category: string | null;
      box_size: string | null;
      code: string | null;
    }>,
    now: number,
  ): Promise<void>;

  // ── SyncMeta / staleness ──
  /** syncMeta.get(key) — the last-sync metadata row, or undefined if never synced. */
  getSyncMeta(key: "customers" | "products"): Promise<SyncMeta | undefined>;
}
