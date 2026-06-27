'use client'

/**
 * lib/wiring/localCache.ts — composition root for the LocalCache port (F-26)
 *
 * The ONE business-layer file where the LocalCache port is bolted to its concrete
 * dexie adapter (same F-TD-11 rule as the other wiring files: only composition
 * roots import from `@/lib/adapters/*`), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the offline-store
 * library = one new adapter folder (`lib/adapters/<vendor>/` — the LocalCache
 * impl + its reactive react.ts) + one edit to THIS file. The port, the 4 owned
 * types, the refreshReferenceData usecase, the 4 reactive consumers, the 4 pages
 * and the sync engine never change.
 *
 * 'use client' (R2): this file re-exports React hooks and is consumed by client
 * components. Importing it triggers NO network and opens NO IndexedDB at
 * import — the dexie adapter constructs its singleton lazily (Dexie does not open
 * IndexedDB until the first query, which runs inside a hook in the browser).
 * The refreshReferenceData usecase is framework-free (needs only fetch +
 * localCache), so wiring constructs it on the client safely.
 *
 * This file is a parts list, not logic.
 */
import { createDexieLocalCache } from "@/lib/adapters/dexie";
import { createRefreshReferenceData } from "@/lib/usecases/refreshReferenceData";
import type { LocalCache } from "@/lib/ports";
import type {
  RefreshReferenceData,
  RefreshResult,
} from "@/lib/usecases/refreshReferenceData";

/** The production LocalCache singleton (dexie adapter). */
export const localCache: LocalCache = createDexieLocalCache();

/** The production reference-data refresh runner. */
const refresh: RefreshReferenceData = createRefreshReferenceData({
  localCache,
  fetch: (...args) => globalThis.fetch(...args),
});

/**
 * Drop-in replacement for the old `syncReferenceData(options)` — same call
 * surface, same return shape. Callers do `refreshReferenceData().catch(...)` or
 * `refreshReferenceData({ force: true }).catch(...)`.
 */
export function refreshReferenceData(
  options?: { force?: boolean },
): Promise<RefreshResult> {
  return refresh.run(options);
}

// Re-export the owned reactive hooks so the 4 consumer screens import them from
// wiring, never from the dexie / dexie-react-hooks vendor.
export {
  useUnsyncedQueue,
  useLocalCustomers,
  useLocalProducts,
  useTodayScreenActivity,
  type RecentActivityRow,
} from "@/lib/adapters/dexie";
