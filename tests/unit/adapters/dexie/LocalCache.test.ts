/**
 * tests/unit/adapters/dexie/LocalCache.test.ts
 *
 * F-26 (R7) — runs the REAL dexie LocalCache adapter against the SAME shared
 * contract the Fake passes, under a simulated IndexedDB (fake-indexeddb). This
 * is the strongest proof the cutover preserved behaviour: it proves
 *   - R3: the SACRED v1/v2 schema actually OPENS (the DB reaches version 2 with
 *     the four tables) — a byte-for-byte schema copy that didn't open would fail.
 *   - the queue add/put/delete/update + reference replace round-trips behave on a
 *     real IndexedDB, not just the in-memory Fake.
 *
 * reason: test-only IndexedDB polyfill so the dexie LocalCache adapter runs under
 * vitest (node) without a real browser. Dev-only — never shipped to users.
 */
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { localCacheContract } from "@/lib/ports/__contracts__/LocalCache.contract";
import {
  createDexieLocalCache,
  localDb,
} from "@/lib/adapters/dexie/LocalCache";

// The adapter wraps a single module-level `localDb` (DB name 'mfs-ops'). The
// contract needs a fresh, EMPTY store per case — so cleanup clears every table
// after each case (the contract's afterEach calls this).
localCacheContract(async () => {
  await Promise.all([
    localDb.queue.clear(),
    localDb.customers.clear(),
    localDb.products.clear(),
    localDb.syncMeta.clear(),
  ]);
  return {
    cache: createDexieLocalCache(),
    cleanup: async () => {
      await Promise.all([
        localDb.queue.clear(),
        localDb.customers.clear(),
        localDb.products.clear(),
        localDb.syncMeta.clear(),
      ]);
    },
  };
});

describe("dexie LocalCache adapter — SACRED schema (R3) opens at version 2", () => {
  it("opens the mfs-ops DB and exposes the four v2 tables", async () => {
    await localDb.open();
    expect(localDb.name).toBe("mfs-ops");
    // verno is 2 after the v2 upgrade ran.
    expect(localDb.verno).toBe(2);
    const tableNames = localDb.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(["customers", "products", "queue", "syncMeta"]);
  });

  it("queue primary key is localId (insert + read by it)", async () => {
    await localDb.queue.clear();
    const cache = createDexieLocalCache();
    await cache.addToQueue({
      localId: "pk-test",
      screen: "screen1",
      payload: { a: 1 },
      createdAt: 100,
      synced: false,
      retries: 0,
    });
    const row = await localDb.queue.get("pk-test");
    expect(row?.payload).toEqual({ a: 1 });
    await localDb.queue.clear();
  });
});
