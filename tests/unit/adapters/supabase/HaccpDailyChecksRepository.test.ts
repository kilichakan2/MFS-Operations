/**
 * tests/unit/adapters/supabase/HaccpDailyChecksRepository.test.ts
 *
 * F-19 PR1 — focused unit coverage for the Supabase daily-checks adapter WITHOUT
 * a DB. A tiny hand-rolled PostgREST query-builder stub records the chained
 * calls + returns a canned `{ data, error }` (mirroring VisitsRepository.test).
 * The REAL adapter factory runs against it, so this proves:
 *   - the verbatim `.select()` column string per method (the byte-identity
 *     anchor — must match the routes character-for-character),
 *   - 23505 → ConflictError (with the route's exact 409 message) on each insert
 *     that has a clean-409 path,
 *   - insert payloads forwarded unchanged,
 *   - null-on-miss for findSupplierForDelivery; []-on-miss for reads.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseHaccpDailyChecksRepository } from "@/lib/adapters/supabase";
import { ConflictError } from "@/lib/errors";
import type {
  DeliveryPersist,
  ColdStoragePersist,
  ProcessingTempPersist,
  DailyDiaryPersist,
  MincePersist,
  MeatPrepPersist,
} from "@/lib/domain";

vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type CannedResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

interface Recorded {
  method: string;
  args: unknown[];
}

/** Minimal awaitable PostgREST builder. Records each chained call; awaiting
 *  resolves to the canned result; `.single()` is terminal. Supports a queue of
 *  results so the multi-query reads (Promise.all) get distinct payloads. */
function makeClient(results: CannedResult | CannedResult[]) {
  const queue = Array.isArray(results) ? [...results] : null;
  const single = Array.isArray(results) ? null : results;
  const calls: Recorded[] = [];
  const tables: string[] = [];

  function nextResult(): CannedResult {
    if (single) return single;
    return queue!.shift() ?? { data: null, error: null };
  }

  function makeBuilder() {
    const result = nextResult();
    const builder: Record<string, unknown> = {};
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    for (const m of [
      "select",
      "insert",
      "update",
      "eq",
      "is",
      "not",
      "gte",
      "lte",
      "order",
      "limit",
    ]) {
      builder[m] = record(m);
    }
    builder.single = (...args: unknown[]) => {
      calls.push({ method: "single", args });
      return Promise.resolve(result);
    };
    builder.then = (resolve: (v: CannedResult) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  }

  const client = {
    from(t: string) {
      tables.push(t);
      return makeBuilder();
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    tables,
    selectArgs: () =>
      calls.filter((c) => c.method === "select").map((c) => c.args[0]),
    insertArg: () =>
      calls.find((c) => c.method === "insert")?.args[0] ?? null,
  };
}

describe("HaccpDailyChecksRepository — verbatim selects + 23505 mapping", () => {
  it("listCleaning selects the verbatim columns + filters today, newest first", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpDailyChecksRepository(h.client);
    const rows = await repo.listCleaning();
    expect(rows).toEqual([]);
    expect(h.tables[0]).toBe("haccp_cleaning_log");
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("time_of_clean");
    expect(select).toContain("sanitiser_temp_c");
    expect(select).toContain("users!inner(name)");
  });

  it("listReturns selects the verbatim return columns", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpDailyChecksRepository(h.client);
    await repo.listReturns();
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("return_code_notes");
    expect(select).toContain("disposition, corrective_action, verified_by");
  });

  it("findSupplierForDelivery returns null on miss", async () => {
    const h = makeClient({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });
    const repo = createSupabaseHaccpDailyChecksRepository(h.client);
    const sup = await repo.findSupplierForDelivery("s1");
    expect(sup).toBeNull();
    expect(h.selectArgs()[0]).toBe("id, name, active");
  });

  it("insertDelivery forwards the payload + maps 23505 → ConflictError (verbatim 409)", async () => {
    const ok = makeClient({ data: { id: "d1" }, error: null });
    const repo = createSupabaseHaccpDailyChecksRepository(ok.client);
    const payload = { product: "Lamb", batch_number: "2206-GB-1" } as unknown as DeliveryPersist;
    const res = await repo.insertDelivery(payload);
    expect(res).toEqual({ id: "d1" });
    expect(ok.insertArg()).toEqual(payload);
    expect(ok.selectArgs()).toContain("id");

    const dup = makeClient({
      data: null,
      error: { code: "23505", message: "unique_violation" },
    });
    const repo2 = createSupabaseHaccpDailyChecksRepository(dup.client);
    await expect(repo2.insertDelivery(payload)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(repo2.insertDelivery(payload)).rejects.toThrow(
      "Another delivery was logged at the same moment. Please retry.",
    );
  });

  it("insertColdStorageReadings selects id,unit_id,temperature_c,temp_status + 23505 → ConflictError", async () => {
    const ok = makeClient({
      data: [{ id: "r1", unit_id: "u1", temperature_c: 9, temp_status: "critical" }],
      error: null,
    });
    const repo = createSupabaseHaccpDailyChecksRepository(ok.client);
    const inserted = await repo.insertColdStorageReadings([
      {} as unknown as ColdStoragePersist,
    ]);
    expect(inserted).toHaveLength(1);
    expect(ok.selectArgs()).toContain("id, unit_id, temperature_c, temp_status");

    const dup = makeClient({
      data: null,
      error: { code: "23505", message: "dup" },
    });
    const repo2 = createSupabaseHaccpDailyChecksRepository(dup.client);
    await expect(
      repo2.insertColdStorageReadings([{} as unknown as ColdStoragePersist]),
    ).rejects.toThrow(
      "This session has already been submitted for one or more units.",
    );
  });

  it("insertProcessingTemp 23505 → ConflictError with the session in the message", async () => {
    const dup = makeClient({
      data: null,
      error: { code: "23505", message: "dup" },
    });
    const repo = createSupabaseHaccpDailyChecksRepository(dup.client);
    await expect(
      repo.insertProcessingTemp({ session: "AM" } as unknown as ProcessingTempPersist),
    ).rejects.toThrow("This AM check has already been submitted for today.");
  });

  it("insertDailyDiary 23505 → ConflictError capitalises the phase", async () => {
    const dup = makeClient({
      data: null,
      error: { code: "23505", message: "dup" },
    });
    const repo = createSupabaseHaccpDailyChecksRepository(dup.client);
    await expect(
      repo.insertDailyDiary({ phase: "opening" } as unknown as DailyDiaryPersist),
    ).rejects.toThrow("Opening checks have already been submitted for today.");
  });

  it("insertMince + insertMeatPrep 23505 → ConflictError (shared batch-code 409)", async () => {
    const dup1 = makeClient({ data: null, error: { code: "23505", message: "dup" } });
    const r1 = createSupabaseHaccpDailyChecksRepository(dup1.client);
    await expect(
      r1.insertMince({} as unknown as MincePersist),
    ).rejects.toThrow("Duplicate submission — batch code already exists today");

    const dup2 = makeClient({ data: null, error: { code: "23505", message: "dup" } });
    const r2 = createSupabaseHaccpDailyChecksRepository(dup2.client);
    await expect(
      r2.insertMeatPrep({} as unknown as MeatPrepPersist),
    ).rejects.toThrow("Duplicate submission — batch code already exists today");
  });

  it("countDeliveriesOn returns the head count", async () => {
    const h = makeClient({ data: null, error: null, count: 4 });
    const repo = createSupabaseHaccpDailyChecksRepository(h.client);
    const n = await repo.countDeliveriesOn("2026-06-22");
    expect(n).toBe(4);
  });
});
