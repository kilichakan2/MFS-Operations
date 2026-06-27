/**
 * lib/ports/__contracts__/LocalCache.contract.ts
 *
 * Shared behavioural contract for LocalCache (F-26). BOTH implementations pass
 * the SAME suite:
 *   - the in-memory Fake (`lib/adapters/fake/LocalCache.ts`) — no IndexedDB.
 *   - the REAL dexie adapter (`lib/adapters/dexie/LocalCache.ts`) running under
 *     `fake-indexeddb` (R7) — proves the SACRED schema actually opens and the
 *     queue/reference round-trips behave on a real IndexedDB.
 *
 * Pattern matches the other __contracts__ files (the setup-closure shape locked
 * at F-06 Gate 1). The setup closure yields `{ cache, cleanup }`; `setup` MUST
 * return a FRESH, EMPTY store each call so the cases don't bleed into each
 * other (the Fake makes a new instance; the dexie run clears + closes between
 * cases).
 *
 * Covers every port method against the byte-identical-behaviour checklist:
 *   - queue add (insert) / put (upsert) distinction
 *   - queue delete-by-localId no-op-on-miss
 *   - queue update partial-field + no-op-on-miss
 *   - listQueue (all) vs listUnsynced (filter !synced)
 *   - listCustomers / listProducts ordered by name
 *   - replaceReferenceData atomic full-replace + injected `now` stamping
 *   - getSyncMeta returns the put row (and recordCount = fresh array length)
 */
import { describe, it, expect, afterEach } from "vitest";
import type { LocalCache, QueuedRecord } from "@/lib/ports";

export interface LocalCacheContractSetup {
  cache: LocalCache;
  cleanup: () => Promise<void>;
}

function rec(over: Partial<QueuedRecord> = {}): QueuedRecord {
  return {
    localId: "id-1",
    screen: "screen1",
    payload: { customer_id: "c1" },
    createdAt: 1_000,
    synced: false,
    retries: 0,
    ...over,
  };
}

export function localCacheContract(
  setup: () => Promise<LocalCacheContractSetup>,
): void {
  describe("LocalCache contract", () => {
    let ctx: LocalCacheContractSetup;

    afterEach(async () => {
      if (ctx) await ctx.cleanup();
    });

    // ── Queue: add vs put ──────────────────────────────────────────────
    it("addToQueue inserts a record that listQueue returns", async () => {
      ctx = await setup();
      await ctx.cache.addToQueue(rec({ localId: "a" }));
      const all = await ctx.cache.listQueue();
      expect(all.map((r) => r.localId)).toEqual(["a"]);
    });

    it("addToQueue rejects a duplicate localId (insert semantics)", async () => {
      ctx = await setup();
      await ctx.cache.addToQueue(rec({ localId: "dup" }));
      await expect(ctx.cache.addToQueue(rec({ localId: "dup" }))).rejects.toBeDefined();
    });

    it("putToQueue upserts (overwrites an existing localId, no throw)", async () => {
      ctx = await setup();
      await ctx.cache.putToQueue(rec({ localId: "p", retries: 0 }));
      await ctx.cache.putToQueue(rec({ localId: "p", retries: 5 }));
      const all = await ctx.cache.listQueue();
      expect(all).toHaveLength(1);
      expect(all[0].retries).toBe(5);
    });

    // ── Queue: delete ──────────────────────────────────────────────────
    it("deleteFromQueue removes by localId", async () => {
      ctx = await setup();
      await ctx.cache.addToQueue(rec({ localId: "d1" }));
      await ctx.cache.addToQueue(rec({ localId: "d2" }));
      await ctx.cache.deleteFromQueue("d1");
      const all = await ctx.cache.listQueue();
      expect(all.map((r) => r.localId)).toEqual(["d2"]);
    });

    it("deleteFromQueue is a no-op (resolves) when the localId is absent", async () => {
      ctx = await setup();
      await expect(ctx.cache.deleteFromQueue("nope")).resolves.toBeUndefined();
    });

    // ── Queue: update ──────────────────────────────────────────────────
    it("updateQueue applies a partial-field patch by localId", async () => {
      ctx = await setup();
      await ctx.cache.addToQueue(rec({ localId: "u", synced: false, retries: 0 }));
      await ctx.cache.updateQueue("u", { synced: true });
      const all = await ctx.cache.listQueue();
      expect(all[0].synced).toBe(true);
      expect(all[0].retries).toBe(0); // untouched
    });

    it("updateQueue is a no-op (resolves) when the localId is absent", async () => {
      ctx = await setup();
      await expect(
        ctx.cache.updateQueue("ghost", { synced: true }),
      ).resolves.toBeUndefined();
    });

    // ── Queue: reads ───────────────────────────────────────────────────
    it("listUnsynced returns only records where synced is false", async () => {
      ctx = await setup();
      await ctx.cache.addToQueue(rec({ localId: "s1", synced: true }));
      await ctx.cache.addToQueue(rec({ localId: "u1", synced: false }));
      await ctx.cache.addToQueue(rec({ localId: "u2", synced: false }));
      const unsynced = await ctx.cache.listUnsynced();
      expect(unsynced.map((r) => r.localId).sort()).toEqual(["u1", "u2"]);
    });

    // ── Reference: replace + ordered reads + syncMeta ──────────────────
    it("replaceReferenceData stores customers + products ordered by name", async () => {
      ctx = await setup();
      await ctx.cache.replaceReferenceData(
        [
          { id: "c2", name: "Beta" },
          { id: "c1", name: "Alpha" },
        ],
        [
          {
            id: "p2",
            name: "Zeta",
            category: "cat",
            box_size: "10kg",
            code: "Z",
          },
          { id: "p1", name: "Apple", category: null, box_size: null, code: null },
        ],
        5_000,
      );
      const customers = await ctx.cache.listCustomers();
      const products = await ctx.cache.listProducts();
      expect(customers.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
      expect(products.map((p) => p.name)).toEqual(["Apple", "Zeta"]);
    });

    it("replaceReferenceData stamps the injected now onto syncedAt", async () => {
      ctx = await setup();
      await ctx.cache.replaceReferenceData(
        [{ id: "c1", name: "A" }],
        [{ id: "p1", name: "P", category: null, box_size: null, code: null }],
        42_000,
      );
      const customers = await ctx.cache.listCustomers();
      const products = await ctx.cache.listProducts();
      expect(customers[0].syncedAt).toBe(42_000);
      expect(products[0].syncedAt).toBe(42_000);
    });

    it("replaceReferenceData is a full replace (clears the previous rows)", async () => {
      ctx = await setup();
      await ctx.cache.replaceReferenceData(
        [
          { id: "old1", name: "Old1" },
          { id: "old2", name: "Old2" },
        ],
        [{ id: "op", name: "OldP", category: null, box_size: null, code: null }],
        1_000,
      );
      await ctx.cache.replaceReferenceData(
        [{ id: "new1", name: "New1" }],
        [],
        2_000,
      );
      const customers = await ctx.cache.listCustomers();
      const products = await ctx.cache.listProducts();
      expect(customers.map((c) => c.id)).toEqual(["new1"]);
      expect(products).toEqual([]);
    });

    it("replaceReferenceData writes syncMeta rows with now + recordCount", async () => {
      ctx = await setup();
      await ctx.cache.replaceReferenceData(
        [
          { id: "c1", name: "A" },
          { id: "c2", name: "B" },
        ],
        [{ id: "p1", name: "P", category: null, box_size: null, code: null }],
        7_000,
      );
      const cMeta = await ctx.cache.getSyncMeta("customers");
      const pMeta = await ctx.cache.getSyncMeta("products");
      expect(cMeta).toEqual({ key: "customers", lastSyncedAt: 7_000, recordCount: 2 });
      expect(pMeta).toEqual({ key: "products", lastSyncedAt: 7_000, recordCount: 1 });
    });

    it("getSyncMeta returns undefined when never synced", async () => {
      ctx = await setup();
      await expect(ctx.cache.getSyncMeta("customers")).resolves.toBeUndefined();
    });

    it("replaceReferenceData maps nullable product fields through verbatim", async () => {
      ctx = await setup();
      await ctx.cache.replaceReferenceData(
        [],
        [
          {
            id: "p1",
            name: "Full",
            category: "Dairy",
            box_size: "5kg",
            code: "C1",
          },
        ],
        1_000,
      );
      const products = await ctx.cache.listProducts();
      expect(products[0]).toEqual({
        id: "p1",
        name: "Full",
        category: "Dairy",
        box_size: "5kg",
        code: "C1",
        syncedAt: 1_000,
      });
    });
  });
}
