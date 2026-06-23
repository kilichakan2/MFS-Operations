/**
 * tests/unit/services/HaccpAssessmentsService.test.ts
 *
 * F-19 PR3 — the Cluster B "standing registers" service against the Fake repo.
 *
 * Pins:
 *   - the two `review_due` predicates (food-defence/food-fraud `next_review_date
 *     < now`; product-specs `!reviewed_at || >12 months`) — both sides of each
 *     boundary, with a FIXED `now` (determinism: the service never calls
 *     `new Date()`);
 *   - the monthly-review aggregation via `runMonthlyReview` (no_deliveries /
 *     confirmed_nil / detections_found, category breakdown, detection-details
 *     shape, bad-month 400 string) — and the UPSERT-overwrite (re-run a month =
 *     one row, last write wins);
 *   - the validate cascades' EXACT 400 strings;
 *   - read/insert/upsert/update delegation + the persist-builder defaults.
 */
import { describe, it, expect } from "vitest";
import { createHaccpAssessmentsService } from "@/lib/services";
import { createFakeHaccpAssessmentsRepository } from "@/lib/adapters/fake";
import type {
  AllergenAssessmentRow,
  FoodDefenceRow,
  FoodFraudRow,
  ProductSpecRow,
  MonthlyReviewDeliveryRow,
} from "@/lib/domain";

const NOW = new Date("2026-06-23T10:00:00.000Z");

function defenceRow(overrides: Partial<FoodDefenceRow>): FoodDefenceRow {
  return {
    id: "fd1",
    version: "V1.0",
    issue_date: "2026-01-01",
    next_review_date: "2027-01-01",
    team: [],
    physical_perimeter: [],
    physical_internal: [],
    cyber_controls: [],
    backup_recovery: [],
    emergency_contacts: [],
    personnel_notes: null,
    goods_notes: null,
    incident_notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    preparer: null,
    approver: null,
    creator: null,
    ...overrides,
  };
}

function fraudRow(overrides: Partial<FoodFraudRow>): FoodFraudRow {
  return {
    id: "ff1",
    version: "V1.0",
    issue_date: "2026-01-01",
    next_review_date: "2027-01-01",
    risks: [],
    supply_chain: [],
    mitigation_notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    preparer: null,
    approver: null,
    creator: null,
    ...overrides,
  };
}

function specRow(overrides: Partial<ProductSpecRow>): ProductSpecRow {
  return {
    id: "ps1",
    product_name: "Lamb chops",
    description: null,
    ingredients: null,
    allergens: null,
    allergen_notes: null,
    portion_weight_g: null,
    storage_temp_c: null,
    shelf_life_chilled_days: null,
    shelf_life_frozen_days: null,
    packaging_type: null,
    micro_limits: null,
    version: "V1.0",
    reviewed_at: null,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    reviewer: null,
    creator: null,
    ...overrides,
  };
}

function delivery(
  overrides: Partial<MonthlyReviewDeliveryRow>,
): MonthlyReviewDeliveryRow {
  return {
    id: "d1",
    date: "2026-05-10",
    supplier: "Acme",
    product: "Lamb",
    product_category: "lamb",
    allergens_identified: false,
    allergen_notes: null,
    batch_number: null,
    ...overrides,
  };
}

describe("HaccpAssessmentsService — allergen-assessment", () => {
  it("listAllergenAssessments delegates; assessment = newest", async () => {
    const newest: AllergenAssessmentRow = {
      id: "a2",
      site_status: "allergen_free",
      raw_materials: [],
      cross_contam_risk: "",
      procedure_notes: null,
      assessed_at: "2026-06-01T00:00:00.000Z",
      next_review_date: "2027-06-01",
      assessor: null,
      updater: null,
    };
    const older = { ...newest, id: "a1" };
    const repo = createFakeHaccpAssessmentsRepository({
      allergenAssessments: [newest, older],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.listAllergenAssessments();
    expect(res.assessment).toEqual(newest);
    expect(res.all_assessments).toHaveLength(2);
  });

  it("validateAllergenAssessment 400 when site_status or next_review_date missing", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    const bad = svc.validateAllergenAssessment({
      site_status: "",
      next_review_date: "2027-01-01",
    });
    expect(bad).toEqual({
      ok: false,
      status: 400,
      message: "site_status and next_review_date required",
    });
    expect(
      svc.validateAllergenAssessment({
        site_status: "allergen_free",
        next_review_date: "2027-01-01",
      }),
    ).toEqual({ ok: true });
  });

  it("buildAllergenAssessmentPersist defaults + both timestamps equal now", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    const persist = svc.buildAllergenAssessmentPersist({
      input: { site_status: "allergen_free", next_review_date: "2027-01-01" },
      userId: "u1",
      now: NOW,
    });
    expect(persist.raw_materials).toEqual([]);
    expect(persist.cross_contam_risk).toBe("");
    expect(persist.procedure_notes).toBeNull();
    expect(persist.assessed_at).toBe(NOW.toISOString());
    expect(persist.updated_at).toBe(NOW.toISOString());
    expect(persist.assessed_by).toBe("u1");
    expect(persist.updated_by).toBe("u1");
  });

  it("insertAllergenAssessment delegates (append-only)", async () => {
    const repo = createFakeHaccpAssessmentsRepository();
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const persist = svc.buildAllergenAssessmentPersist({
      input: { site_status: "allergen_free", next_review_date: "2027-01-01" },
      userId: "u1",
      now: NOW,
    });
    await svc.insertAllergenAssessment(persist);
    expect(repo.insertedAllergenAssessments).toHaveLength(1);
  });
});

describe("HaccpAssessmentsService — monthly-reviews", () => {
  it("runMonthlyReview rejects a bad month with the exact 400 string", async () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    const r = await svc.runMonthlyReview({
      input: { month_year: "2026-13" },
      userId: "u1",
      now: NOW,
    });
    expect(r).toEqual({
      ok: false,
      status: 400,
      message: "Invalid month format — expected YYYY-MM",
    });
  });

  it("no deliveries → no_deliveries; reviewed_at = now", async () => {
    const repo = createFakeHaccpAssessmentsRepository({ deliveries: [] });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const r = await svc.runMonthlyReview({
      input: { month_year: "2026-05" },
      userId: "u1",
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.site_status).toBe("no_deliveries");
    expect(r.result.total_deliveries).toBe(0);
    expect(r.result.detections).toBe(0);
    expect(r.result.already_existed).toBe(false);
    expect(repo.upsertedMonthlyReviews[0].reviewed_at).toBe(NOW.toISOString());
    expect(repo.deliveryRangeQueries[0]).toEqual({
      start: "2026-05-01",
      end: "2026-05-31",
    });
  });

  it("deliveries with no detections → confirmed_nil + category breakdown", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      deliveries: [
        delivery({ id: "d1", product_category: "lamb" }),
        delivery({ id: "d2", product_category: "lamb" }),
        delivery({ id: "d3", product_category: "dairy" }),
      ],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const r = await svc.runMonthlyReview({
      input: { month_year: "2026-05" },
      userId: "u1",
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.site_status).toBe("confirmed_nil");
    expect(r.result.total_deliveries).toBe(3);
    expect(repo.upsertedMonthlyReviews[0].category_breakdown).toEqual({
      lamb: 2,
      dairy: 1,
    });
    expect(repo.upsertedMonthlyReviews[0].detection_details).toEqual([]);
  });

  it("a detection → detections_found + detection_details shape", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      deliveries: [
        delivery({ id: "d1" }),
        delivery({
          id: "d2",
          allergens_identified: true,
          batch_number: "B-9",
          allergen_notes: "milk traces",
          supplier: "X",
          product: "Cheese",
          product_category: "dairy",
          date: "2026-05-12",
        }),
      ],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const r = await svc.runMonthlyReview({
      input: { month_year: "2026-05", notes: "  watch dairy  " },
      userId: "u1",
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.site_status).toBe("detections_found");
    expect(r.result.detections).toBe(1);
    expect(repo.upsertedMonthlyReviews[0].detection_details).toEqual([
      {
        date: "2026-05-12",
        supplier: "X",
        product: "Cheese",
        category: "dairy",
        batch_number: "B-9",
        allergen_notes: "milk traces",
      },
    ]);
    expect(repo.upsertedMonthlyReviews[0].notes).toBe("watch dairy");
  });

  it("re-running the SAME month OVERWRITES (one row, last write wins)", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      deliveries: [delivery({ id: "d1" })],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    await svc.runMonthlyReview({
      input: { month_year: "2026-05" },
      userId: "u1",
      now: NOW,
    });
    await svc.runMonthlyReview({
      input: { month_year: "2026-05" },
      userId: "u1",
      now: NOW,
    });
    const reviews = await svc.listMonthlyReviews();
    expect(reviews).toHaveLength(1); // overwrite, not append
    expect(repo.upsertedMonthlyReviews).toHaveLength(2);
  });
});

describe("HaccpAssessmentsService — food-defence / food-fraud review_due", () => {
  it("food-defence review_due TRUE when latest next_review_date < now", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      foodDefencePlans: [defenceRow({ next_review_date: "2026-06-22" })],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getFoodDefence(NOW);
    expect(res.review_due).toBe(true);
    expect(res.latest?.id).toBe("fd1");
  });

  it("food-defence review_due FALSE when latest next_review_date > now", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      foodDefencePlans: [defenceRow({ next_review_date: "2026-06-24" })],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    expect((await svc.getFoodDefence(NOW)).review_due).toBe(false);
  });

  it("food-defence review_due TRUE when no plans (latest null)", async () => {
    const repo = createFakeHaccpAssessmentsRepository({ foodDefencePlans: [] });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getFoodDefence(NOW);
    expect(res.review_due).toBe(true);
    expect(res.latest).toBeNull();
  });

  it("food-fraud review_due boundary + shape (assessments key)", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      foodFraudAssessments: [fraudRow({ next_review_date: "2026-06-22" })],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getFoodFraud(NOW);
    expect(res.review_due).toBe(true);
    expect(res.assessments).toHaveLength(1);
    expect(res.latest?.id).toBe("ff1");
  });

  it("validateFoodFraud 400 strings (version/issue/review/risks-array)", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    expect(
      svc.validateFoodFraud({
        version: "",
        issue_date: "x",
        next_review_date: "y",
        risks: [],
      }),
    ).toEqual({ ok: false, status: 400, message: "Version required" });
    expect(
      svc.validateFoodFraud({
        version: "V1",
        issue_date: "x",
        next_review_date: "y",
        risks: "nope",
      }),
    ).toEqual({ ok: false, status: 400, message: "Risks must be an array" });
    expect(
      svc.validateFoodFraud({
        version: "V1",
        issue_date: "x",
        next_review_date: "y",
        risks: [],
      }),
    ).toEqual({ ok: true });
  });

  it("validateFoodDefence 400 strings", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    expect(
      svc.validateFoodDefence({
        version: " ",
        issue_date: "",
        next_review_date: "",
      }),
    ).toEqual({ ok: false, status: 400, message: "Version required" });
    expect(
      svc.validateFoodDefence({
        version: "V1",
        issue_date: "",
        next_review_date: "",
      }),
    ).toEqual({ ok: false, status: 400, message: "Issue date required" });
    expect(
      svc.validateFoodDefence({
        version: "V1",
        issue_date: "2026-01-01",
        next_review_date: "",
      }),
    ).toEqual({ ok: false, status: 400, message: "Review date required" });
  });

  it("buildFoodDefencePersist defaults arrays to [] and notes to null", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    const persist = svc.buildFoodDefencePersist({
      input: {
        version: " V2 ",
        issue_date: "2026-01-01",
        next_review_date: "2027-01-01",
        team: "not-array",
        personnel_notes: "  ",
        prepared_by: "",
      },
      userId: "u1",
    });
    expect(persist.version).toBe("V2");
    expect(persist.team).toEqual([]);
    expect(persist.personnel_notes).toBeNull();
    expect(persist.prepared_by).toBeNull();
    expect(persist.created_by).toBe("u1");
  });
});

describe("HaccpAssessmentsService — product-specs", () => {
  it("review_due TRUE when reviewed_at null, count tallies", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      productSpecs: [
        specRow({ id: "s1", reviewed_at: null }),
        specRow({ id: "s2", reviewed_at: "2026-06-23T09:00:00.000Z" }),
      ],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getProductSpecs(NOW);
    expect(res.specs.find((s) => s.id === "s1")?.review_due).toBe(true);
    expect(res.specs.find((s) => s.id === "s2")?.review_due).toBe(false);
    expect(res.review_due_count).toBe(1);
  });

  it("review_due boundary at exactly 12 months", async () => {
    // 12 months before NOW (2026-06-23) = 2025-06-23. Older than that => due.
    const repo = createFakeHaccpAssessmentsRepository({
      productSpecs: [
        specRow({ id: "old", reviewed_at: "2025-06-22T00:00:00.000Z" }),
        specRow({ id: "fresh", reviewed_at: "2025-06-24T00:00:00.000Z" }),
      ],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getProductSpecs(NOW);
    expect(res.specs.find((s) => s.id === "old")?.review_due).toBe(true);
    expect(res.specs.find((s) => s.id === "fresh")?.review_due).toBe(false);
  });

  it("only active specs are returned", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      productSpecs: [
        specRow({ id: "live", active: true }),
        specRow({ id: "dead", active: false }),
      ],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    const res = await svc.getProductSpecs(NOW);
    expect(res.specs.map((s) => s.id)).toEqual(["live"]);
  });

  it("validateProductSpec 400 when product_name blank", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    expect(svc.validateProductSpec({ product_name: "  " })).toEqual({
      ok: false,
      status: 400,
      message: "Product name is required",
    });
    expect(svc.validateProductSpec({ product_name: "Lamb" })).toEqual({
      ok: true,
    });
  });

  it("buildProductSpecPersist defaults version V1.0 + updated_at = now", () => {
    const svc = createHaccpAssessmentsService({
      assessments: createFakeHaccpAssessmentsRepository(),
    });
    const persist = svc.buildProductSpecPersist({
      input: { product_name: "  Lamb  ", allergens: [] },
      userId: "u1",
      now: NOW,
    });
    expect(persist.product_name).toBe("Lamb");
    expect(persist.version).toBe("V1.0");
    expect(persist.allergens).toBeNull(); // empty array → null
    expect(persist.updated_at).toBe(NOW.toISOString());
    expect(persist.created_by).toBe("u1");
  });

  it("updateProductSpec delegates with the updates map (in-place) + soft-delete", async () => {
    const repo = createFakeHaccpAssessmentsRepository({
      productSpecs: [specRow({ id: "s1", active: true })],
    });
    const svc = createHaccpAssessmentsService({ assessments: repo });
    await svc.updateProductSpec("s1", {
      active: false,
      updated_at: NOW.toISOString(),
    });
    expect(repo.productSpecUpdates[0]).toEqual({
      id: "s1",
      updates: { active: false, updated_at: NOW.toISOString() },
    });
    // soft-deleted row disappears from the active read
    expect(await repo.listActiveProductSpecs()).toHaveLength(0);
  });
});
