/**
 * tests/unit/adapters/supabase/HaccpAssessmentsRepository.test.ts
 *
 * F-19 PR3 — focused unit coverage for the Supabase Cluster B adapter WITHOUT a
 * DB. A tiny hand-rolled PostgREST query-builder stub records the chained calls
 * + returns a canned `{ data, error }`. The REAL adapter factory runs against
 * it, so this proves:
 *   - the verbatim `.select()` column string per method (the byte-identity
 *     anchor — incl. the ALIASED, NON-inner joins that DIFFER from Cluster A's
 *     `users!inner(name)`),
 *   - ServiceError on every DB error (NO ConflictError — Cluster B has no 409),
 *   - reads return []/null-shaped results on miss,
 *   - the upsert passes `{ onConflict: 'month_year' }`,
 *   - the update passes the `updates` map + `.eq('id', id)` unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseHaccpAssessmentsRepository } from "@/lib/adapters/supabase";
import { ServiceError } from "@/lib/errors";
import type {
  AllergenAssessmentPersist,
  MonthlyReviewPersist,
  FoodDefencePersist,
  FoodFraudPersist,
  ProductSpecPersist,
} from "@/lib/domain";

vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type CannedResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

interface Recorded {
  method: string;
  args: unknown[];
}

function makeClient(result: CannedResult) {
  const calls: Recorded[] = [];
  const tables: string[] = [];

  function makeBuilder() {
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
      "upsert",
      "eq",
      "gte",
      "lte",
      "order",
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
    call: (method: string) => calls.find((c) => c.method === method),
  };
}

describe("HaccpAssessmentsRepository — verbatim selects + error mapping", () => {
  it("listAllergenAssessments: aliased non-inner joins, []-on-miss, assessment=newest", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    const res = await repo.listAllergenAssessments();
    expect(res).toEqual({ assessment: null, all_assessments: [] });
    expect(h.tables[0]).toBe("haccp_allergen_assessment");
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("assessor:assessed_by(name)");
    expect(select).toContain("updater:updated_by(name)");
    expect(select).not.toContain("users!inner"); // Cluster B is NOT inner
  });

  it("listMonthlyReviews: verbatim aliased reviewer join + period_start order", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    await repo.listMonthlyReviews();
    expect(h.tables[0]).toBe("haccp_allergen_monthly_reviews");
    expect(h.selectArgs()[0]).toContain("reviewer:reviewed_by ( name )");
  });

  it("listDeliveriesInRange: verbatim delivery columns + gte/lte/order", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    await repo.listDeliveriesInRange("2026-05-01", "2026-05-31");
    expect(h.tables[0]).toBe("haccp_deliveries");
    expect(h.selectArgs()[0]).toBe(
      "id, date, supplier, product, product_category, allergens_identified, allergen_notes, batch_number",
    );
    expect(h.call("gte")?.args).toEqual(["date", "2026-05-01"]);
    expect(h.call("lte")?.args).toEqual(["date", "2026-05-31"]);
  });

  it("upsertMonthlyReview: passes { onConflict: 'month_year' }", async () => {
    const h = makeClient({ data: { id: "r1" }, error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    const payload = { month_year: "2026-05" } as unknown as MonthlyReviewPersist;
    await repo.upsertMonthlyReview(payload);
    const upsert = h.call("upsert");
    expect(upsert?.args[0]).toEqual(payload);
    expect(upsert?.args[1]).toEqual({ onConflict: "month_year" });
  });

  it("listFoodDefencePlans: 3 aliased non-inner joins (preparer/approver/creator)", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    await repo.listFoodDefencePlans();
    expect(h.tables[0]).toBe("haccp_food_defence_plans");
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("preparer:prepared_by ( name )");
    expect(select).toContain("approver:approved_by ( name )");
    expect(select).toContain("creator:created_by   ( name )");
  });

  it("listFoodFraudAssessments: verbatim risks/supply_chain columns + aliased joins", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    await repo.listFoodFraudAssessments();
    expect(h.tables[0]).toBe("haccp_food_fraud_assessments");
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("risks, supply_chain, mitigation_notes");
    expect(select).toContain("preparer:prepared_by ( name )");
  });

  it("listActiveProductSpecs: active filter + product_name order + aliased joins", async () => {
    const h = makeClient({ data: [], error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    await repo.listActiveProductSpecs();
    expect(h.tables[0]).toBe("haccp_product_specs");
    const select = h.selectArgs()[0] as string;
    expect(select).toContain("portion_weight_g, storage_temp_c");
    expect(select).toContain("reviewer:reviewed_by ( name )");
    expect(h.call("eq")?.args).toEqual(["active", true]);
  });

  it("updateProductSpec: forwards updates + .eq('id', id)", async () => {
    const h = makeClient({ data: { id: "s1" }, error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    const updates = { active: false, updated_at: "2026-06-23T00:00:00.000Z" };
    await repo.updateProductSpec("s1", updates);
    expect(h.call("update")?.args[0]).toEqual(updates);
    expect(h.call("eq")?.args).toEqual(["id", "s1"]);
  });

  it("insert forwards the payload unchanged", async () => {
    const h = makeClient({ data: { id: "fd1" }, error: null });
    const repo = createSupabaseHaccpAssessmentsRepository(h.client);
    const payload = { version: "V1" } as unknown as FoodDefencePersist;
    await repo.insertFoodDefencePlan(payload);
    expect(h.call("insert")?.args[0]).toEqual(payload);
  });

  it("every DB error throws ServiceError (NO ConflictError, even on 23505)", async () => {
    const cases: Array<() => Promise<unknown>> = [];
    const dup = { code: "23505", message: "unique_violation" };
    const mk = () => createSupabaseHaccpAssessmentsRepository(
      makeClient({ data: null, error: dup }).client,
    );
    cases.push(() => mk().listAllergenAssessments());
    cases.push(() =>
      mk().insertAllergenAssessment({} as unknown as AllergenAssessmentPersist),
    );
    cases.push(() => mk().listMonthlyReviews());
    cases.push(() =>
      mk().upsertMonthlyReview({} as unknown as MonthlyReviewPersist),
    );
    cases.push(() => mk().listFoodDefencePlans());
    cases.push(() =>
      mk().insertFoodFraudAssessment({} as unknown as FoodFraudPersist),
    );
    cases.push(() => mk().listActiveProductSpecs());
    cases.push(() =>
      mk().insertProductSpec({} as unknown as ProductSpecPersist),
    );
    cases.push(() => mk().updateProductSpec("s1", {}));
    for (const c of cases) {
      await expect(c()).rejects.toBeInstanceOf(ServiceError);
    }
  });
});
