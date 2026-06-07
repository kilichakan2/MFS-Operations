/**
 * tests/integration/road-times.test.ts
 *
 * F-01 (narrowed) — proves loadRoadTimes() behaviour end-to-end against
 * the local Supabase stack (F-INFRA-01). Three cases:
 *
 *   (a) Happy path     — seeded pairs are returned by .get(from, to).
 *   (b) Missing pair   — .get() returns null for any non-seeded pair.
 *   (c) DB error       — when the query fails, loadRoadTimes() returns
 *                        a matrix where .get() always returns null AND
 *                        does NOT throw. This is the swallow-and-fallback
 *                        contract that exactTSP relies on for haversine.
 *
 * Fixture strategy:
 *   - Insert rows into customer_road_times directly via the service
 *     client. The table has no FK to customers, so arbitrary test UUIDs
 *     are fine.
 *   - Use a TEST_PREFIX-derived UUID range so cleanup is unambiguous.
 *   - afterAll deletes by (from_id, to_id) pairs created here. No other
 *     test currently writes to this table, so a `.delete().in(from_id, [...])`
 *     by our test UUIDs is sufficient.
 *
 * Run with the local stack up:
 *   npm run db:up                              (in one terminal)
 *   npm run test:integration -- road-times     (in another)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { loadRoadTimes } from "@/lib/road-times";
import { getServiceClient } from "./_setup";

// Stable, recognisable UUIDs for the three test "customers". The "f001"
// fragment makes them greppable if a row leaks past cleanup.
const A_ID = "00000000-0000-0000-0000-00000000f001";
const B_ID = "00000000-0000-0000-0000-00000000f002";
const C_ID = "00000000-0000-0000-0000-00000000f003";
const HUB = "00000000-0000-0000-0000-000000000001"; // MFS_HUB_ID

const TEST_IDS = [A_ID, B_ID, C_ID, HUB];

async function cleanup() {
  const supa = getServiceClient();
  await supa.from("customer_road_times").delete().in("from_id", TEST_IDS);
}

describe("lib/road-times.loadRoadTimes integration", () => {
  beforeAll(async () => {
    await cleanup();
    const supa = getServiceClient();
    // Seed two known directional pairs:
    //   A → B = 180s
    //   B → A = 200s
    //   A → HUB = 600s
    // Intentionally do NOT seed B → HUB so case (b) has a definite miss.
    const { error } = await supa.from("customer_road_times").insert([
      { from_id: A_ID, to_id: B_ID, duration_s: 180, distance_m: 4_000 },
      { from_id: B_ID, to_id: A_ID, duration_s: 200, distance_m: 4_100 },
      { from_id: A_ID, to_id: HUB, duration_s: 600, distance_m: 9_500 },
    ]);
    if (error) throw new Error(`seed failed: ${error.message}`);
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  // ── (a) Happy path ──────────────────────────────────────────

  it("returns seeded duration_s on cache hit", async () => {
    const m = await loadRoadTimes([A_ID, B_ID], HUB);
    expect(m.get(A_ID, B_ID)).toBe(180);
    expect(m.get(B_ID, A_ID)).toBe(200);
    expect(m.get(A_ID, HUB)).toBe(600);
  });

  // ── (b) Missing pair ────────────────────────────────────────

  it("returns null for a pair not present in the cache", async () => {
    const m = await loadRoadTimes([A_ID, B_ID], HUB);
    // B → HUB was deliberately not seeded.
    expect(m.get(B_ID, HUB)).toBeNull();
    // Same for an entirely unrelated UUID.
    expect(m.get(C_ID, A_ID)).toBeNull();
  });

  // ── (c) DB-error fallback ───────────────────────────────────

  it("returns an empty matrix without throwing when the query fails", async () => {
    // Trigger a query error by passing a value that PostgREST will
    // reject inside the .in() filter. The cleanest way that does NOT
    // pollute the DB is to construct a custom failure path. Strategy
    // chosen (see plan Risk #2 for alternatives weighed):
    //
    //   Pass an oversized array of malformed (non-UUID) string IDs.
    //   PostgREST will reject the `from_id=in.(...)` filter on the
    //   first non-UUID value with a 400 error. loadRoadTimes() catches
    //   the {data, error} return from the SDK and enters the
    //   swallow-and-fallback branch.
    //
    // Crucially: this never inserts, updates, or deletes anything.

    // Scoped spy on console.warn — log.warn routes to console.warn under
    // the hood. The spy is restored at the end of the test so it does not
    // leak into other tests (pattern mirrors tests/integration/withErrors).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const badIds = ["not-a-uuid", "also-not-a-uuid"];
      const m = await loadRoadTimes(badIds, "still-not-a-uuid");

      // Contract part 1: every .get() must return null; nothing throws.
      expect(m.get(badIds[0], badIds[1])).toBeNull();
      expect(m.get(A_ID, B_ID)).toBeNull(); // also null — empty matrix
      expect(m.get(HUB, A_ID)).toBeNull();

      // Contract part 2: log.warn fired with the structured payload.
      // Each log.* call emits exactly one JSON line to its console handle.
      expect(warnSpy).toHaveBeenCalled();
      const lastLine = warnSpy.mock.calls.at(-1)?.[0] as string;
      const parsed = JSON.parse(lastLine);
      expect(parsed.level).toBe("warn");
      expect(parsed.msg).toBe(
        "road-times cache load failed, using haversine fallback",
      );
      // error.message is non-empty (the PostgREST UUID-syntax error).
      expect(typeof parsed.error).toBe("string");
      expect(parsed.error.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
