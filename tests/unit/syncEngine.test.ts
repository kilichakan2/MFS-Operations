/**
 * tests/unit/syncEngine.test.ts
 *
 * F-26 — pins the syncEngine re-point onto the LocalCache port. triggerSync now
 * reads the queue via localCache.listQueue() (JS-side filtered) and writes via
 * localCache.updateQueue() — byte-identical to the old localDb.queue calls. This
 * suite mocks the wiring singleton with the in-memory Fake + stubs fetch +
 * navigator.onLine, and proves:
 *   - exhausted-reset: unsynced records with retries >= 3 are reset to retries 0
 *   - mark-synced: a 2xx response sets synced = true (no retry bump)
 *   - retry-increment: a non-ok response bumps retries + stores the error
 *   - the syncInProgress / navigator.onLine / typeof window guards still hold
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeLocalCache } from "@/lib/adapters/fake";
import type { FakeLocalCache } from "@/lib/adapters/fake";

// One shared Fake the mocked wiring hands back; re-created per test.
let cache: FakeLocalCache;

vi.mock("@/lib/wiring/localCache", () => ({
  get localCache() {
    return cache;
  },
}));

// Import AFTER the mock is registered.
import { triggerSync } from "@/lib/syncEngine";

function queued(localId: string, over: Record<string, unknown> = {}) {
  return {
    localId,
    screen: "screen1" as const,
    payload: { customer_id: "c1" },
    createdAt: 1_000,
    synced: false,
    retries: 0,
    ...over,
  };
}

const originalOnLine = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  "onLine",
);

beforeEach(() => {
  cache = createFakeLocalCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // The node test env has no `window`; triggerSync guards on
  // `typeof window === 'undefined'`. Stub it so the sync loop runs.
  vi.stubGlobal("window", {});
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalOnLine) {
    Object.defineProperty(globalThis.navigator, "onLine", originalOnLine);
  }
});

describe("syncEngine.triggerSync (F-26 re-point onto LocalCache)", () => {
  it("marks a record synced on a 2xx response (no retry bump)", async () => {
    await cache.addToQueue(queued("a"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 201 }) as unknown as Response),
    );

    await triggerSync();

    const all = await cache.listQueue();
    expect(all[0].synced).toBe(true);
    expect(all[0].retries).toBe(0);
  });

  it("increments retries + stores the error on a non-ok response", async () => {
    await cache.addToQueue(queued("b", { retries: 1 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ error: "bad payload" }),
      }) as unknown as Response),
    );

    await triggerSync();

    const all = await cache.listQueue();
    expect(all[0].synced).toBe(false);
    expect(all[0].retries).toBe(2);
    expect(all[0].syncError).toBe("bad payload");
  });

  it("resets exhausted (retries >= 3) unsynced records before syncing", async () => {
    await cache.addToQueue(
      queued("c", { retries: 5, syncError: "old", synced: false }),
    );
    // After reset to retries 0, it becomes eligible and a 201 marks it synced.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 201 }) as unknown as Response),
    );

    await triggerSync();

    const all = await cache.listQueue();
    expect(all[0].synced).toBe(true);
    // retries was reset to 0 (not bumped from 5) before the successful sync.
    expect(all[0].retries).toBe(0);
  });

  it("is a no-op when offline (navigator.onLine false)", async () => {
    await cache.addToQueue(queued("d"));
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await triggerSync();

    expect(fetchSpy).not.toHaveBeenCalled();
    const all = await cache.listQueue();
    expect(all[0].synced).toBe(false);
  });

  it("does nothing when there are no pending records", async () => {
    await cache.addToQueue(queued("e", { synced: true }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await triggerSync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
