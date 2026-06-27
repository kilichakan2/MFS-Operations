'use client'

/**
 * lib/adapters/dexie/react.ts
 *
 * The reactive React hooks for the LocalCache port (F-26). The ONLY file in the
 * app allowed to import `dexie-react-hooks` (enforced by no-restricted-imports
 * in `.eslintrc.json`). These owned hooks are re-exported through
 * lib/wiring/localCache.ts; the 4 consumer screens import THEM, never the vendor.
 *
 * R1 (MUST-FIX, the headline risk): `useLiveQuery(fn)` only re-runs `fn` when the
 * Dexie tables `fn` READ change. So each hook below performs the SAME REAL Dexie
 * reads as the consumer did today — directly against `localDb.*`, NOT through the
 * port abstraction. Routing the reactive read through the port (or the Fake)
 * would make liveQuery lose table-tracking and the screens would silently stop
 * auto-refreshing (no error, tests still green). Each hook keeps the consumer's
 * EXACT query body, `deps`, and `[]` default so the reactive re-render fires on
 * the SAME table changes as before.
 *
 * 'use client' (R2): these are React hooks; the file is browser-only and the
 * wiring that re-exports it is 'use client' too. Dexie does not open IndexedDB
 * until the first query runs (inside a hook, in the browser) — SSR-safe.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "./LocalCache";
import type { QueuedRecord } from "@/lib/ports";

/**
 * The RecentActivity row shape: a queued record enriched with the resolved
 * customer/product name maps. Returned VERBATIM in the shape the component reads
 * (`{ ...r, custMap, prodMap }`).
 */
export type RecentActivityRow = QueuedRecord & {
  custMap: Record<string, string>;
  prodMap: Record<string, string>;
};

/**
 * Unsynced queue rows, live. Covers AppHeader's SyncDot + useSyncStatus — both
 * keep their own `.filter`/`.length` derivations on the returned array.
 * Query body + deps + [] default identical to the old
 * `localDb.queue.filter(r => !r.synced).toArray()`.
 */
export function useUnsyncedQueue(): QueuedRecord[] {
  return useLiveQuery(
    () => localDb.queue.filter((r) => !r.synced).toArray(),
    [],
    [],
  );
}

/**
 * Reference customers, ordered by name, live. Covers useCustomers — the consumer
 * keeps its thin `.map` to SelectableItem. Identical to the old
 * `localDb.customers.orderBy('name').toArray()`.
 */
export function useLocalCustomers() {
  return useLiveQuery(
    () => localDb.customers.orderBy("name").toArray(),
    [],
    [],
  );
}

/**
 * Reference products, ordered by name, live. Covers useProducts +
 * useProductsWithDetail — each keeps its thin `.map`. Identical to the old
 * `localDb.products.orderBy('name').toArray()`.
 */
export function useLocalProducts() {
  return useLiveQuery(
    () => localDb.products.orderBy("name").toArray(),
    [],
    [],
  );
}

/**
 * Today's records for one screen, newest first, max 5, with customer/product
 * name-resolution maps — live. Covers RecentActivity. The customers/products
 * reads stay INSIDE this hook so liveQuery tracks queue + customers + products
 * (R1). Query body + deps `[screen, today]` + [] default identical to the old
 * RecentActivity useLiveQuery.
 */
export function useTodayScreenActivity(
  screen: "screen1" | "screen2" | "screen3",
  today: number,
): RecentActivityRow[] {
  return useLiveQuery(
    async () => {
      const records = await localDb.queue
        .where("screen")
        .equals(screen)
        .and((r) => r.createdAt >= today)
        .reverse()
        .limit(5)
        .toArray();

      if (records.length === 0) return [];

      // Pre-load all relevant customers + products for name resolution
      const customerIds = [
        ...new Set(
          records.map((r) => r.payload.customer_id as string).filter(Boolean),
        ),
      ];
      const productIds = [
        ...new Set(
          records.map((r) => r.payload.product_id as string).filter(Boolean),
        ),
      ];

      const [customers, products] = await Promise.all([
        customerIds.length > 0
          ? localDb.customers.where("id").anyOf(customerIds).toArray()
          : Promise.resolve([]),
        productIds.length > 0
          ? localDb.products.where("id").anyOf(productIds).toArray()
          : Promise.resolve([]),
      ]);

      const custMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
      const prodMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

      return records.map((r) => ({ ...r, custMap, prodMap }));
    },
    [screen, today],
    [],
  );
}
