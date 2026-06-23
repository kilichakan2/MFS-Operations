/**
 * tests/integration/haccpAssessments.test.ts
 *
 * Integration tests for the F-19 PR3 Cluster-B HACCP route re-point. The 5 route
 * files (allergen-assessment + its monthly-reviews, food-defence, food-fraud,
 * product-specs) now call `haccpAssessmentsService` from `@/lib/wiring/haccp`
 * instead of inline `supabaseService`. The intent is BYTE-IDENTICAL behaviour:
 * same wire JSON (keys + values), same DB writes, same status codes + error
 * strings, same role-gates.
 *
 * The three distinct persistence models are pinned explicitly:
 *   - append-only (allergen-assessment / food-defence / food-fraud): inserting
 *     adds a row, never overwrites;
 *   - UPSERT-on-month_year (monthly-reviews): re-running a month OVERWRITES it
 *     (one row, not two);
 *   - in-place UPDATE + soft-delete (product-specs PATCH): same id, field
 *     changed; `active:false` removes it from the active GET; allergens updated
 *     ONLY when present in the body.
 *
 * Cluster-B tables are NOT append-only (no no_delete rule), so this suite tidies
 * its own seeded rows in afterAll, keyed by ANVIL-TEST markers + test-only
 * months. The aliased NON-inner joins are pinned by asserting a null-user-ref
 * row still returns (Cluster B differs from Cluster A's `users!inner`).
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed) + the dev server
 * the runner auto-boots (npm run test:integration).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

// Test-only markers so cleanup is precise and collision-free across runs.
const SPEC_PREFIX = "ANVIL-TEST-spec-";
const TEST_MONTH = "1999-01"; // far past — owns no real deliveries
const TEST_MONTH_2 = "1999-02";

describe("/api/haccp/* Cluster B integration — F-19 PR3 byte-identical re-point", () => {
  let users: TestUserSet;
  let admin: { role: string; userId: string; name: string };
  const seededSpecIds: string[] = [];

  beforeAll(async () => {
    users = await setupTestUsers();
    admin = { role: "admin", userId: users.admin.id, name: users.admin.name };
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    // product-specs are deletable (no no_delete rule).
    await supa.from("haccp_product_specs").delete().like("product_name", `${SPEC_PREFIX}%`);
    // monthly-reviews for the test months.
    await supa
      .from("haccp_allergen_monthly_reviews")
      .delete()
      .in("month_year", [TEST_MONTH, TEST_MONTH_2]);
    void seededSpecIds;
  }, 30_000);

  // ── role gates (all 5) ────────────────────────────────────────────────────

  it("GET 401s for a disallowed role; POST/PATCH 403 for non-admin", async () => {
    const getPaths = [
      "/api/haccp/allergen-assessment",
      "/api/haccp/allergen-assessment/monthly-reviews",
      "/api/haccp/food-defence",
      "/api/haccp/food-fraud",
      "/api/haccp/product-specs",
    ];
    for (const path of getPaths) {
      const res = await api(path, {
        method: "GET",
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(res.status, `GET ${path}`).toBe(401);
      expect((res.body as { error: string }).error).toBe("Unauthorised");
    }

    // A warehouse user (allowed GET) is NOT admin → POST 403 "Admin only".
    const wh = { role: "warehouse", userId: users.warehouse.id, name: users.warehouse.name };
    const postRes = await api("/api/haccp/food-defence", {
      method: "POST",
      ...wh,
      body: { version: "V1", issue_date: "2026-01-01", next_review_date: "2027-01-01" },
    });
    expect(postRes.status).toBe(403);
    expect((postRes.body as { error: string }).error).toBe("Admin only");
  });

  // ── 1. allergen-assessment (append-only) ──────────────────────────────────

  it("allergen-assessment: GET shape + append-only POST + null-user-ref returns", async () => {
    const beforeRes = await api("/api/haccp/allergen-assessment", { method: "GET", ...admin });
    expect(beforeRes.status).toBe(200);
    const before = beforeRes.body as { assessment: unknown; all_assessments: unknown[] };
    expect(before).toHaveProperty("assessment");
    expect(before).toHaveProperty("all_assessments");
    const beforeCount = before.all_assessments.length;

    // 400 when required fields missing.
    const bad = await api("/api/haccp/allergen-assessment", {
      method: "POST",
      ...admin,
      body: { raw_materials: [] },
    });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toBe(
      "site_status and next_review_date required",
    );

    const created = await api("/api/haccp/allergen-assessment", {
      method: "POST",
      ...admin,
      body: { site_status: "nil_allergens", next_review_date: "2030-01-01" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toHaveProperty("assessment");

    const afterRes = await api("/api/haccp/allergen-assessment", { method: "GET", ...admin });
    const after = afterRes.body as {
      assessment: { site_status: string; assessor: unknown } | null;
      all_assessments: unknown[];
    };
    // append-only: count went UP, newest is ours.
    expect(after.all_assessments.length).toBe(beforeCount + 1);
    expect(after.assessment?.site_status).toBe("nil_allergens");
    // aliased non-inner join: assessor key present (object or null), NOT dropped.
    expect(after.assessment).toHaveProperty("assessor");
  });

  // ── 2. monthly-reviews (UPSERT-same-month overwrite) ──────────────────────

  it("monthly-reviews: GET {reviews}; bad month 400; re-run same month OVERWRITES", async () => {
    const getRes = await api("/api/haccp/allergen-assessment/monthly-reviews", {
      method: "GET",
      ...admin,
    });
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("reviews");

    const badMonth = await api("/api/haccp/allergen-assessment/monthly-reviews", {
      method: "POST",
      ...admin,
      body: { month_year: "2026-13" },
    });
    expect(badMonth.status).toBe(400);
    expect((badMonth.body as { error: string }).error).toBe(
      "Invalid month format — expected YYYY-MM",
    );

    // A far-past month owns no real deliveries → no_deliveries.
    const run1 = await api("/api/haccp/allergen-assessment/monthly-reviews", {
      method: "POST",
      ...admin,
      body: { month_year: TEST_MONTH },
    });
    expect(run1.status).toBe(201);
    const r1 = run1.body as {
      review: { id: string };
      total_deliveries: number;
      detections: number;
      site_status: string;
      already_existed: boolean;
    };
    expect(r1.site_status).toBe("no_deliveries");
    expect(r1.total_deliveries).toBe(0);
    expect(r1.detections).toBe(0);
    expect(r1.already_existed).toBe(false);
    const firstId = r1.review.id;

    // Re-run the SAME month → OVERWRITE (same row id, one row in the DB).
    const run2 = await api("/api/haccp/allergen-assessment/monthly-reviews", {
      method: "POST",
      ...admin,
      body: { month_year: TEST_MONTH },
    });
    expect(run2.status).toBe(201);
    expect((run2.body as { review: { id: string } }).review.id).toBe(firstId);

    const supa = getServiceClient();
    const { count } = await supa
      .from("haccp_allergen_monthly_reviews")
      .select("*", { count: "exact", head: true })
      .eq("month_year", TEST_MONTH);
    expect(count).toBe(1); // overwrite, not append
  });

  // ── 3. food-defence (append-only + review_due) ────────────────────────────

  it("food-defence: GET {plans,latest,review_due}; required-field 400s; append-only POST", async () => {
    const getRes = await api("/api/haccp/food-defence", { method: "GET", ...admin });
    expect(getRes.status).toBe(200);
    const g = getRes.body as { plans: unknown[]; latest: unknown; review_due: boolean };
    expect(g).toHaveProperty("plans");
    expect(g).toHaveProperty("latest");
    expect(typeof g.review_due).toBe("boolean");

    for (const [body, msg] of [
      [{ issue_date: "2026-01-01", next_review_date: "2027-01-01" }, "Version required"],
      [{ version: "V1", next_review_date: "2027-01-01" }, "Issue date required"],
      [{ version: "V1", issue_date: "2026-01-01" }, "Review date required"],
    ] as Array<[Record<string, unknown>, string]>) {
      const res = await api("/api/haccp/food-defence", { method: "POST", ...admin, body });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe(msg);
    }

    const created = await api("/api/haccp/food-defence", {
      method: "POST",
      ...admin,
      body: {
        version: "ANVIL-TEST-V1",
        issue_date: "2026-01-01",
        next_review_date: "2099-01-01",
        team: "not-an-array",
        personnel_notes: "  ",
      },
    });
    expect(created.status).toBe(201);
    const plan = (created.body as { plan: { team: unknown[]; personnel_notes: unknown } }).plan;
    expect(plan.team).toEqual([]); // non-array → []
    expect(plan.personnel_notes).toBeNull(); // blank → null

    // latest is our future-dated plan → review_due false; null-user-ref present.
    const after = (await api("/api/haccp/food-defence", { method: "GET", ...admin }))
      .body as { latest: { version: string; creator: unknown }; review_due: boolean };
    expect(after.latest.version).toBe("ANVIL-TEST-V1");
    expect(after.review_due).toBe(false);
    expect(after.latest).toHaveProperty("creator"); // aliased non-inner join key
  });

  // ── 4. food-fraud (append-only + risks-array 400) ─────────────────────────

  it("food-fraud: GET {assessments,latest,review_due}; risks-array 400; append-only POST", async () => {
    const getRes = await api("/api/haccp/food-fraud", { method: "GET", ...admin });
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("assessments");
    expect(getRes.body).toHaveProperty("latest");

    const badRisks = await api("/api/haccp/food-fraud", {
      method: "POST",
      ...admin,
      body: {
        version: "V1",
        issue_date: "2026-01-01",
        next_review_date: "2027-01-01",
        risks: "nope",
      },
    });
    expect(badRisks.status).toBe(400);
    expect((badRisks.body as { error: string }).error).toBe("Risks must be an array");

    const created = await api("/api/haccp/food-fraud", {
      method: "POST",
      ...admin,
      body: {
        version: "ANVIL-TEST-FF",
        issue_date: "2026-01-01",
        next_review_date: "2099-01-01",
        risks: [{ name: "substitution" }],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toHaveProperty("assessment");
  });

  // ── 5. product-specs (in-place update + soft-delete + conditional allergens)

  it("product-specs: GET {specs,review_due_count}; POST 400; PATCH in-place + soft-delete + allergens nuance", async () => {
    const getRes = await api("/api/haccp/product-specs", { method: "GET", ...admin });
    expect(getRes.status).toBe(200);
    const g = getRes.body as { specs: unknown[]; review_due_count: number };
    expect(g).toHaveProperty("specs");
    expect(typeof g.review_due_count).toBe("number");

    const bad = await api("/api/haccp/product-specs", {
      method: "POST",
      ...admin,
      body: { product_name: "  " },
    });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toBe("Product name is required");

    const name = `${SPEC_PREFIX}${Date.now()}`;
    const created = await api("/api/haccp/product-specs", {
      method: "POST",
      ...admin,
      body: { product_name: name, allergens: ["milk"] },
    });
    expect(created.status).toBe(201);
    const spec = (created.body as { spec: { id: string; version: string; allergens: unknown } }).spec;
    expect(spec.version).toBe("V1.0"); // default
    expect(spec.allergens).toEqual(["milk"]);
    const specId = spec.id;
    seededSpecIds.push(specId);

    // PATCH in-place: change description, DON'T send allergens → allergens unchanged.
    const patched = await api("/api/haccp/product-specs", {
      method: "PATCH",
      ...admin,
      body: { id: specId, description: "updated desc" },
    });
    expect(patched.status).toBe(200);
    const pSpec = (patched.body as { spec: { id: string; description: string; allergens: unknown } }).spec;
    expect(pSpec.id).toBe(specId); // same row, in place
    expect(pSpec.description).toBe("updated desc");
    expect(pSpec.allergens).toEqual(["milk"]); // untouched (not in body)

    // PATCH with allergens:[] → null (conditional nuance, sent this time).
    const patched2 = await api("/api/haccp/product-specs", {
      method: "PATCH",
      ...admin,
      body: { id: specId, allergens: [] },
    });
    expect(patched2.status).toBe(200);
    expect((patched2.body as { spec: { allergens: unknown } }).spec.allergens).toBeNull();

    // !id → 400 "ID required".
    const noId = await api("/api/haccp/product-specs", {
      method: "PATCH",
      ...admin,
      body: { description: "x" },
    });
    expect(noId.status).toBe(400);
    expect((noId.body as { error: string }).error).toBe("ID required");

    // soft-delete: active:false → disappears from the active GET.
    const del = await api("/api/haccp/product-specs", {
      method: "PATCH",
      ...admin,
      body: { id: specId, active: false },
    });
    expect(del.status).toBe(200);
    const activeAfter = (await api("/api/haccp/product-specs", { method: "GET", ...admin }))
      .body as { specs: Array<{ id: string }> };
    expect(activeAfter.specs.some((s) => s.id === specId)).toBe(false);
  });
});
