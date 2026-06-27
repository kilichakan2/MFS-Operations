/**
 * lib/adapters/dexie/LocalCache.ts
 *
 * The dexie adapter for the LocalCache port (F-26). The ONLY file in the app
 * allowed to import `dexie` (enforced by no-restricted-imports in
 * `.eslintrc.json`). Holds the IndexedDB database class (MFSLocalDB), the
 * module-level singleton, and `createDexieLocalCache()` which maps every port
 * method onto a Dexie call. Closes the vendor-outside-adapter breach (the old
 * `lib/localDb.ts`, now deleted).
 *
 * PURE RELOCATION of the queue + reference store from `lib/localDb.ts` — every
 * Dexie call (queue.add/put/update/where().delete()/toArray()/filter,
 * customers/products.orderBy('name'), the atomic clear+bulkAdd+put transaction)
 * is byte-for-byte identical. Only the import site moves behind this adapter and
 * the fetch + cooldown move OUT to the refreshReferenceData usecase (the adapter
 * NEVER does HTTP and NEVER calls Date.now() — `now` is injected).
 *
 * R3 (SACRED): the version(1)/version(2) `.stores()` strings are copied
 * CHARACTER-FOR-CHARACTER from the old file. Field workers have live IndexedDB
 * data keyed to these exact schemas; modifying an existing version (even
 * whitespace inside the schema string) triggers a Dexie upgrade that can wipe
 * un-sent offline submissions. NO new version. NO index change.
 *
 * R2 (SSR): the singleton is constructed at module load, but Dexie's constructor
 * does NOT open IndexedDB until the first query — so importing this module on the
 * server (it is only imported by the 'use client' wiring file) touches no
 * IndexedDB. No 'use client' is needed on this data file; react.ts carries it.
 *
 * Construction (factory only — F-06 template; wiring holds the singleton):
 *   - `createDexieLocalCache()` — no deps.
 */
import Dexie, { type Table } from "dexie";
import type {
  LocalCache,
  QueuedRecord,
  LocalCustomer,
  LocalProduct,
  SyncMeta,
} from "@/lib/ports";

// ─── Database class (schema lifted VERBATIM from lib/localDb.ts — R3 SACRED) ───

export class MFSLocalDB extends Dexie {
  // Operational tables
  queue!: Table<QueuedRecord, string>; // PK: localId
  // Reference tables
  customers!: Table<LocalCustomer, string>; // PK: id
  products!: Table<LocalProduct, string>; // PK: id
  // Metadata
  syncMeta!: Table<SyncMeta, string>; // PK: key

  constructor() {
    super("mfs-ops");

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

// Module-level singleton. Dexie's constructor does not open IndexedDB until the
// first query, so this is SSR-safe (R2) — never run a query at import.
export const localDb = new MFSLocalDB();

// ─── Adapter factory ──────────────────────────────────────────────────────────

export function createDexieLocalCache(): LocalCache {
  return {
    async addToQueue(record: QueuedRecord): Promise<void> {
      await localDb.queue.add(record);
    },

    async putToQueue(record: QueuedRecord): Promise<void> {
      await localDb.queue.put(record);
    },

    async deleteFromQueue(localId: string): Promise<void> {
      await localDb.queue.where("localId").equals(localId).delete();
    },

    async updateQueue(
      localId: string,
      patch: Partial<QueuedRecord>,
    ): Promise<void> {
      await localDb.queue.update(localId, patch);
    },

    async listQueue(): Promise<QueuedRecord[]> {
      return localDb.queue.toArray();
    },

    async listUnsynced(): Promise<QueuedRecord[]> {
      return localDb.queue.filter((r) => !r.synced).toArray();
    },

    async listCustomers(): Promise<LocalCustomer[]> {
      return localDb.customers.orderBy("name").toArray();
    },

    async listProducts(): Promise<LocalProduct[]> {
      return localDb.products.orderBy("name").toArray();
    },

    async replaceReferenceData(
      customers: ReadonlyArray<{ id: string; name: string }>,
      products: ReadonlyArray<{
        id: string;
        name: string;
        category: string | null;
        box_size: string | null;
        code: string | null;
      }>,
      now: number,
    ): Promise<void> {
      const freshCustomers: LocalCustomer[] = customers.map((c) => ({
        id: c.id,
        name: c.name,
        syncedAt: now,
      }));

      const freshProducts: LocalProduct[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        box_size: p.box_size ?? null,
        code: p.code ?? null,
        syncedAt: now,
      }));

      await localDb.transaction(
        "rw",
        [localDb.customers, localDb.products, localDb.syncMeta],
        async () => {
          // Full replace — clear then bulk insert
          await localDb.customers.clear();
          await localDb.products.clear();
          await localDb.customers.bulkAdd(freshCustomers);
          await localDb.products.bulkAdd(freshProducts);

          // Update sync metadata
          await localDb.syncMeta.put({
            key: "customers",
            lastSyncedAt: now,
            recordCount: freshCustomers.length,
          });
          await localDb.syncMeta.put({
            key: "products",
            lastSyncedAt: now,
            recordCount: freshProducts.length,
          });
        },
      );
    },

    async getSyncMeta(
      key: "customers" | "products",
    ): Promise<SyncMeta | undefined> {
      return localDb.syncMeta.get(key);
    },
  };
}
