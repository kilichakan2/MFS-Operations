/**
 * lib/adapters/dexie/index.ts
 *
 * Barrel re-export for the dexie adapter package (F-26). Import surface:
 *   import { createDexieLocalCache } from '@/lib/adapters/dexie'
 *   import { useUnsyncedQueue, … } from '@/lib/adapters/dexie'
 *
 * Factory + the owned reactive hooks only — the production singleton lives in
 * lib/wiring/localCache.ts (F-TD-11). This file does NOT re-export any `dexie`
 * type (e.g. Table<T>) — the vendor stops at LocalCache.ts / react.ts per
 * ADR-0002.
 */
export { createDexieLocalCache } from "./LocalCache";
export {
  useUnsyncedQueue,
  useLocalCustomers,
  useLocalProducts,
  useTodayScreenActivity,
  type RecentActivityRow,
} from "./react";
