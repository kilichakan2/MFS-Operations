/**
 * tests/unit/usecases/refreshReferenceData.test.ts
 *
 * F-26 — THE parity suite for the syncReferenceData → refreshReferenceData split.
 * Drives the usecase with the Fake LocalCache + a stub `fetch` + a frozen `now`,
 * and pins EVERY branch byte-identically to the old lib/localDb.ts behaviour:
 *   - cooldown skip (both datasets fresh, not forced) → no fetch, counts from meta
 *   - force bypasses the cooldown even when fresh
 *   - happy path → replaceReferenceData called with the frozen now, {success,counts}
 *   - fetch throw → console.warn('[syncReferenceData] Fetch failed, …') + {success:false}
 *   - !res.ok → same warn-path (the thrown Error message)
 *   - bad shape → {success:false, error:'Unexpected API response shape'}
 *   - replace throw → console.error('[syncReferenceData] Transaction failed:', …)
 *
 * The `[syncReferenceData]` log prefix is asserted verbatim even though the
 * function was renamed (byte-identical log output > internal name).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRefreshReferenceData } from "@/lib/usecases/refreshReferenceData";
import { createFakeLocalCache } from "@/lib/adapters/fake";

const FROZEN = 1_000_000_000_000; // a fixed "now"
const THIRTY_MIN = 30 * 60 * 1000;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

const SAMPLE = {
  customers: [{ id: "c1", name: "Acme" }],
  products: [
    { id: "p1", name: "Widget", category: "cat", box_size: "12", code: "W1" },
  ],
};

describe("refreshReferenceData usecase (F-26 parity)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: fetches, replaces with the frozen now, returns counts", async () => {
    const cache = createFakeLocalCache();
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();

    expect(result).toEqual({ success: true, customerCount: 1, productCount: 1 });
    expect(fetch).toHaveBeenCalledWith("/api/reference", expect.objectContaining({
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }));
    // replace stamped the frozen now onto syncedAt + syncMeta.
    const cMeta = await cache.getSyncMeta("customers");
    expect(cMeta).toEqual({ key: "customers", lastSyncedAt: FROZEN, recordCount: 1 });
    const customers = await cache.listCustomers();
    expect(customers[0].syncedAt).toBe(FROZEN);
  });

  it("cooldown: both datasets fresh and not forced → no fetch, counts from meta", async () => {
    const cache = createFakeLocalCache();
    // Seed fresh meta (synced 1 minute ago).
    await cache.replaceReferenceData(
      [{ id: "c1", name: "A" }, { id: "c2", name: "B" }],
      [{ id: "p1", name: "P", category: null, box_size: null, code: null }],
      FROZEN - 60_000,
    );
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, customerCount: 2, productCount: 1 });
  });

  it("force bypasses the cooldown even when fresh", async () => {
    const cache = createFakeLocalCache();
    await cache.replaceReferenceData(
      [{ id: "c1", name: "A" }],
      [],
      FROZEN - 60_000, // fresh
    );
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run({ force: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, customerCount: 1, productCount: 1 });
  });

  it("stale meta (older than 30 min) triggers a fetch without force", async () => {
    const cache = createFakeLocalCache();
    await cache.replaceReferenceData(
      [{ id: "c1", name: "A" }],
      [{ id: "p1", name: "P", category: null, box_size: null, code: null }],
      FROZEN - THIRTY_MIN - 1, // just stale
    );
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    await usecase.run();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetch throw → warn-path with the [syncReferenceData] prefix + {success:false}", async () => {
    const cache = createFakeLocalCache();
    const fetch = vi.fn(async () => {
      throw new Error("boom");
    });
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();

    expect(result).toEqual({ success: false, error: "boom" });
    expect(console.warn).toHaveBeenCalledWith(
      "[syncReferenceData] Fetch failed, using cached data:",
      "boom",
    );
  });

  it("!res.ok → warn-path with the API-returned message", async () => {
    const cache = createFakeLocalCache();
    const fetch = vi.fn(async () => jsonResponse(null, false, 503));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();

    expect(result).toEqual({ success: false, error: "API returned 503: Error" });
    expect(console.warn).toHaveBeenCalledWith(
      "[syncReferenceData] Fetch failed, using cached data:",
      "API returned 503: Error",
    );
  });

  it("bad shape → {success:false, error:'Unexpected API response shape'} (no throw)", async () => {
    const cache = createFakeLocalCache();
    const fetch = vi.fn(async () => jsonResponse({ customers: "nope", products: 1 }));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();
    expect(result).toEqual({
      success: false,
      error: "Unexpected API response shape",
    });
  });

  it("replace throw → error-path with the [syncReferenceData] Transaction prefix", async () => {
    const cache = createFakeLocalCache();
    vi.spyOn(cache, "replaceReferenceData").mockRejectedValueOnce(
      new Error("disk full"),
    );
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => FROZEN,
    });

    const result = await usecase.run();

    expect(result).toEqual({ success: false, error: "disk full" });
    expect(console.error).toHaveBeenCalledWith(
      "[syncReferenceData] Transaction failed:",
      "disk full",
    );
  });

  it("defaults now to Date.now when not injected", async () => {
    const cache = createFakeLocalCache();
    const fetch = vi.fn(async () => jsonResponse(SAMPLE));
    const usecase = createRefreshReferenceData({
      localCache: cache,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const before = Date.now();
    await usecase.run();
    const meta = await cache.getSyncMeta("customers");
    expect(meta!.lastSyncedAt).toBeGreaterThanOrEqual(before);
  });
});
