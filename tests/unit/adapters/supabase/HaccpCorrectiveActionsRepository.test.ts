/**
 * tests/unit/adapters/supabase/HaccpCorrectiveActionsRepository.test.ts
 *
 * F-19 PR1 — focused unit coverage for the Supabase CA-ledger adapter WITHOUT a
 * DB. Proves:
 *   - insertMany passes the rows through UNMODIFIED (the byte-identity pin),
 *   - the verbatim queue `.select()` strings (§7a),
 *   - the sign-off `.update()` keys + `management_verification_required` filter,
 *   - insertMany([]) is a no-op (no DB call).
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseHaccpCorrectiveActionsRepository } from "@/lib/adapters/supabase";
import type { CorrectiveActionInsert } from "@/lib/domain";

vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type CannedResult = { data: unknown; error: { message: string } | null };

interface Recorded {
  method: string;
  args: unknown[];
}

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
      "order",
      "limit",
    ]) {
      builder[m] = record(m);
    }
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
    insertArg: () => calls.find((c) => c.method === "insert")?.args[0] ?? null,
    updateArg: () => calls.find((c) => c.method === "update")?.args[0] ?? null,
    eqArgs: () => calls.filter((c) => c.method === "eq").map((c) => c.args),
  };
}

const ROWS: CorrectiveActionInsert[] = [
  {
    actioned_by: "u1",
    source_table: "haccp_deliveries",
    source_id: "d1",
    ccp_ref: "CCP1",
    deviation_description: "x",
    action_taken: "y",
    product_disposition: "reject",
    recurrence_prevention: "z",
    management_verification_required: true,
    resolved: false,
  },
  {
    actioned_by: "u1",
    source_table: "haccp_daily_diary",
    source_id: "x1",
    ccp_ref: "SOP1-opening",
    deviation_description: "diary",
    action_taken: "See diary entry",
    product_disposition: null,
    recurrence_prevention: null,
    management_verification_required: false,
  },
];

describe("HaccpCorrectiveActionsRepository (Supabase)", () => {
  it("insertMany passes the rows through unmodified", async () => {
    const h = makeClient({ data: null, error: null });
    const repo = createSupabaseHaccpCorrectiveActionsRepository(h.client);
    await repo.insertMany(ROWS);
    expect(h.tables[0]).toBe("haccp_corrective_actions");
    expect(h.insertArg()).toEqual(ROWS);
  });

  it("insertMany([]) is a no-op (no DB call)", async () => {
    const h = makeClient({ data: null, error: null });
    const repo = createSupabaseHaccpCorrectiveActionsRepository(h.client);
    await repo.insertMany([]);
    expect(h.tables).toHaveLength(0);
    expect(h.insertArg()).toBeNull();
  });

  it("listVerificationQueue uses the verbatim unresolved + resolved selects", async () => {
    const h = makeClient([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const repo = createSupabaseHaccpCorrectiveActionsRepository(h.client);
    const queue = await repo.listVerificationQueue();
    expect(queue.unresolved).toEqual([]);
    expect(queue.resolved).toEqual([]);
    const selects = h.selectArgs() as string[];
    expect(selects[0]).toBe(
      "id, submitted_at, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, source_table, management_verification_required, users!actioned_by(name)",
    );
    expect(selects[1]).toBe(
      "id, submitted_at, verified_at, ccp_ref, deviation_description, action_taken, source_table, users!actioned_by(name), verifier:users!verified_by(name)",
    );
  });

  it("signOff sets verified_by/verified_at/resolved + filters on management_verification_required", async () => {
    const h = makeClient({ data: null, error: null });
    const repo = createSupabaseHaccpCorrectiveActionsRepository(h.client);
    await repo.signOff("c1", "admin1");
    const update = h.updateArg() as Record<string, unknown>;
    expect(update.verified_by).toBe("admin1");
    expect(update.resolved).toBe(true);
    expect(typeof update.verified_at).toBe("string");
    const eqs = h.eqArgs();
    expect(eqs).toContainEqual(["id", "c1"]);
    expect(eqs).toContainEqual(["management_verification_required", true]);
  });
});
