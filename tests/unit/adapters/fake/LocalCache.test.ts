/**
 * tests/unit/adapters/fake/LocalCache.test.ts
 *
 * F-26 — the Fake LocalCache: a no-IndexedDB, no-dexie in-memory stand-in for
 * the client-side offline store. Used by the syncEngine + refreshReferenceData
 * unit tests to drive the queue + reference-replace behaviour without a browser.
 *
 * Runs the shared LocalCache contract against the Fake, plus Fake-specific
 * assertions (fresh instances are isolated; the inspectable `queue` map).
 */
import { describe, it, expect } from "vitest";
import { localCacheContract } from "@/lib/ports/__contracts__/LocalCache.contract";
import { createFakeLocalCache } from "@/lib/adapters/fake";

localCacheContract(async () => ({
  cache: createFakeLocalCache(),
  cleanup: async () => {},
}));

describe("createFakeLocalCache — Fake-specific behaviour", () => {
  it("each factory call is an isolated, empty store", async () => {
    const a = createFakeLocalCache();
    const b = createFakeLocalCache();
    await a.addToQueue({
      localId: "x",
      screen: "screen1",
      payload: {},
      createdAt: 0,
      synced: false,
      retries: 0,
    });
    expect(await a.listQueue()).toHaveLength(1);
    expect(await b.listQueue()).toHaveLength(0);
  });

  it("exposes the queue map for inspection", async () => {
    const cache = createFakeLocalCache();
    await cache.addToQueue({
      localId: "x",
      screen: "screen1",
      payload: {},
      createdAt: 0,
      synced: false,
      retries: 0,
    });
    expect(cache.queue.has("x")).toBe(true);
  });
});
