/**
 * lib/usecases/refreshReferenceData.ts
 *
 * The reference-data refresh use-case (F-26) — the thin client-side
 * orchestration that owns the `/api/reference` fetch, the 30-minute cooldown,
 * the 10-second timeout, and the response validation, then hands the result to
 * `localCache.replaceReferenceData(...)`. The ADAPTER never does HTTP; the
 * errand-running lives HERE.
 *
 * PURE RELOCATION of the old `syncReferenceData()` from `lib/localDb.ts` — the
 * cooldown logic, the `'/api/reference'` URL, the `AbortSignal.timeout(10_000)`,
 * the `Content-Type` header, the `res.ok` check, the `Array.isArray` validation,
 * the `'Unexpected API response shape'` string, the two `[syncReferenceData]`
 * console messages, and every `{ success }` return shape are byte-for-byte
 * identical. The log prefix stays `[syncReferenceData]` even though the function
 * is renamed (byte-identical log output > internal name).
 *
 * DETERMINISM (R4): `run()` reads the clock ONCE via the injected `now()` and
 * uses it for BOTH the cooldown check AND the timestamps passed to
 * `replaceReferenceData` — so "is it stale?" and the freshness stamps can't
 * disagree, and a frozen-clock test pins every number. (Today's localDb called
 * Date.now() twice; a single read is a strict improvement with no observable
 * change at non-boundary times.)
 *
 * `fetch` is injected for testability — wiring binds `globalThis.fetch`.
 *
 * Construction (factory only — F-06 template; wiring holds the singleton):
 *   - `createRefreshReferenceData({ localCache, fetch, now? })`.
 */
import type { LocalCache } from "@/lib/ports";

/** Minimum time between background refreshes: 30 minutes */
const BACKGROUND_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * API response shape expected from /api/reference. The Next.js route reads from
 * Supabase and returns only active records.
 */
interface ReferenceDataResponse {
  customers: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    name: string;
    category: string | null;
    box_size: string | null;
    code: string | null;
  }>;
}

export interface RefreshReferenceDataDeps {
  readonly localCache: LocalCache;
  /** Injected for testability — wiring binds globalThis.fetch. */
  readonly fetch: typeof globalThis.fetch;
  /** Injected clock; defaults to Date.now (R4). */
  readonly now?: () => number;
}

export type RefreshResult =
  | { success: true; customerCount: number; productCount: number }
  | { success: false; error: string };

export interface RefreshReferenceData {
  /**
   * Byte-identical to the old syncReferenceData: cooldown (unless force) via
   * getSyncMeta + the 30-min interval; fetch('/api/reference', 10s timeout);
   * res.ok + json + Array.isArray validation; replaceReferenceData(now); the
   * three failure paths with the SAME console.warn/error strings + return shapes.
   */
  run(options?: { force?: boolean }): Promise<RefreshResult>;
}

export function createRefreshReferenceData(
  deps: RefreshReferenceDataDeps,
): RefreshReferenceData {
  const { localCache, fetch } = deps;
  const now = deps.now ?? Date.now;

  return {
    async run(options: { force?: boolean } = {}): Promise<RefreshResult> {
      // Read the clock once and reuse it for cooldown + timestamps (R4).
      const stamp = now();

      // ── Cooldown check ──────────────────────────────────────────────────────
      if (!options.force) {
        const [customerMeta, productMeta] = await Promise.all([
          localCache.getSyncMeta("customers"),
          localCache.getSyncMeta("products"),
        ]);

        const customerStale =
          !customerMeta ||
          stamp - customerMeta.lastSyncedAt > BACKGROUND_REFRESH_INTERVAL_MS;
        const productStale =
          !productMeta ||
          stamp - productMeta.lastSyncedAt > BACKGROUND_REFRESH_INTERVAL_MS;

        // Both datasets are fresh — nothing to do
        if (!customerStale && !productStale) {
          return {
            success: true,
            customerCount: customerMeta?.recordCount ?? 0,
            productCount: productMeta?.recordCount ?? 0,
          };
        }
      }

      // ── Fetch ─────────────────────────────────────────────────────────────────
      let data: ReferenceDataResponse;

      try {
        const res = await fetch("/api/reference", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          // 10-second timeout — if the network is that slow, we keep what we have
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          throw new Error(`API returned ${res.status}: ${res.statusText}`);
        }

        data = (await res.json()) as ReferenceDataResponse;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        // Non-fatal — app continues with whatever is already in IndexedDB
        console.warn(
          "[syncReferenceData] Fetch failed, using cached data:",
          message,
        );
        return { success: false, error: message };
      }

      // ── Validate ──────────────────────────────────────────────────────────────
      if (!Array.isArray(data.customers) || !Array.isArray(data.products)) {
        return { success: false, error: "Unexpected API response shape" };
      }

      // ── Write — atomic replace (the adapter owns the transaction) ─────────────
      try {
        await localCache.replaceReferenceData(data.customers, data.products, stamp);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "IndexedDB write error";
        console.error("[syncReferenceData] Transaction failed:", message);
        return { success: false, error: message };
      }

      return {
        success: true,
        customerCount: data.customers.length,
        productCount: data.products.length,
      };
    },
  };
}
