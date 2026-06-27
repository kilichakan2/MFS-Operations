/**
 * lib/adapters/fake/LocalCache.ts
 *
 * Deterministic, no-IndexedDB Fake for the LocalCache port (F-26). Pure
 * JavaScript Maps — no `dexie`, no `dexie-react-hooks`, no browser. Used by the
 * shared LocalCache contract and by the syncEngine + refreshReferenceData unit
 * tests to drive the offline-queue + reference-replace behaviour without a real
 * browser IndexedDB.
 *
 * Boundary discipline (ADR-0002): imports zero vendor SDKs; works in the owned
 * QueuedRecord / LocalCustomer / LocalProduct / SyncMeta shapes only.
 *
 * Semantics mirror the dexie adapter (and therefore today's lib/localDb.ts):
 *   - addToQueue REJECTS on a duplicate localId (Dexie `add`).
 *   - putToQueue UPSERTS (Dexie `put`).
 *   - deleteFromQueue / updateQueue are NO-OPS when the localId is absent.
 *   - listCustomers / listProducts return rows ordered by `name`.
 *   - replaceReferenceData is an atomic full replace; `now` is INJECTED.
 *
 * The reactive `useLiveQuery` hooks are NOT part of the port — they live in the
 * dexie adapter's react.ts and are tested there. This Fake covers the data
 * methods only.
 *
 * Construction (factory only — F-06 template; the production singleton lives in
 * lib/wiring/localCache.ts):
 *   - `createFakeLocalCache()` — a fresh, empty in-memory store.
 *   - `fakeLocalCache` singleton — for barrel symmetry.
 */

import type {
  LocalCache,
  QueuedRecord,
  LocalCustomer,
  LocalProduct,
  SyncMeta,
} from "@/lib/ports";

export interface FakeLocalCache extends LocalCache {
  /** Test inspection: a live view of the queue rows (insertion order). */
  readonly queue: ReadonlyMap<string, QueuedRecord>;
}

export function createFakeLocalCache(): FakeLocalCache {
  const queue = new Map<string, QueuedRecord>();
  const customers = new Map<string, LocalCustomer>();
  const products = new Map<string, LocalProduct>();
  const syncMeta = new Map<SyncMeta["key"], SyncMeta>();

  function byName<T extends { name: string }>(rows: Iterable<T>): T[] {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    queue,

    async addToQueue(record: QueuedRecord): Promise<void> {
      if (queue.has(record.localId)) {
        throw new Error(
          `[fake-localcache] addToQueue: key '${record.localId}' already exists`,
        );
      }
      queue.set(record.localId, { ...record });
    },

    async putToQueue(record: QueuedRecord): Promise<void> {
      queue.set(record.localId, { ...record });
    },

    async deleteFromQueue(localId: string): Promise<void> {
      queue.delete(localId); // no-op when absent
    },

    async updateQueue(
      localId: string,
      patch: Partial<QueuedRecord>,
    ): Promise<void> {
      const existing = queue.get(localId);
      if (!existing) return; // no-op when absent (Dexie update returns 0)
      queue.set(localId, { ...existing, ...patch });
    },

    async listQueue(): Promise<QueuedRecord[]> {
      return [...queue.values()].map((r) => ({ ...r }));
    },

    async listUnsynced(): Promise<QueuedRecord[]> {
      return [...queue.values()].filter((r) => !r.synced).map((r) => ({ ...r }));
    },

    async listCustomers(): Promise<LocalCustomer[]> {
      return byName([...customers.values()]).map((c) => ({ ...c }));
    },

    async listProducts(): Promise<LocalProduct[]> {
      return byName([...products.values()]).map((p) => ({ ...p }));
    },

    async replaceReferenceData(
      freshCustomers: ReadonlyArray<{ id: string; name: string }>,
      freshProducts: ReadonlyArray<{
        id: string;
        name: string;
        category: string | null;
        box_size: string | null;
        code: string | null;
      }>,
      now: number,
    ): Promise<void> {
      customers.clear();
      products.clear();
      for (const c of freshCustomers) {
        customers.set(c.id, { id: c.id, name: c.name, syncedAt: now });
      }
      for (const p of freshProducts) {
        products.set(p.id, {
          id: p.id,
          name: p.name,
          category: p.category,
          box_size: p.box_size ?? null,
          code: p.code ?? null,
          syncedAt: now,
        });
      }
      syncMeta.set("customers", {
        key: "customers",
        lastSyncedAt: now,
        recordCount: freshCustomers.length,
      });
      syncMeta.set("products", {
        key: "products",
        lastSyncedAt: now,
        recordCount: freshProducts.length,
      });
    },

    async getSyncMeta(
      key: "customers" | "products",
    ): Promise<SyncMeta | undefined> {
      const row = syncMeta.get(key);
      return row ? { ...row } : undefined;
    },
  };
}

export const fakeLocalCache: FakeLocalCache = createFakeLocalCache();
