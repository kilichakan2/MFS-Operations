/**
 * tests/integration/haccpReviewsRoutes.test.ts
 *
 * Integration tests for the F-19 PR6 Cluster D route re-point. The two route
 * files now call `haccpReviewsService` / `haccpAnnualReviewService` from
 * `@/lib/wiring/haccp` instead of inline `supabaseService`. The intent is
 * BYTE-IDENTICAL behaviour EXCEPT the one accepted deviation (R6): DB-error 500
 * bodies are now `'Server error'` instead of raw Postgres text.
 *
 * Unlike haccpReviewsFoundation.test.ts (which drives the services directly),
 * this suite hits the LIVE HTTP routes on the booted dev server via `api()`, so
 * it catches any wiring or ordering mistake the route re-point could introduce.
 *
 * Schema facts that shape the test (supabase/migrations/20260101000000_baseline.sql):
 *   - haccp_weekly_review:   UNIQUE(week_ending), no_delete + no_update → use
 *     a far-past, per-run-unique week_ending so re-runs never collide.
 *   - haccp_monthly_review:  no_delete + no_update.
 *   - haccp_corrective_actions: source_id uuid NOT NULL; no_delete.
 *   - haccp_annual_reviews:  partial UNIQUE on locked WHERE locked=false (one
 *     draft at a time); DELETABLE → cleaned in beforeAll/afterEach/afterAll.
 *
 * Because the review tables are append-only, this suite asserts the SPECIFIC
 * inserted row by source_id, never a table count. Annual rows ARE deleted (the
 * unique-draft slot must be freed) — local DB only (_setup.ts hard-blocks prod).
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed). Run via
 * npm run test:integration (auto-boots the local-wired dev server).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
} from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";
import { buildInitialChecklist, type Checklist } from "@/lib/annualReview/sections";

// Per-run unique suffix so the weekly UNIQUE(week_ending) index never collides
// across re-runs of an append-only (no_delete) table.
const RUN = Date.now();

/** A far-past, deterministic-per-run date for the append-only weekly table. */
function uniqueDate(offsetDays: number): string {
  const base = new Date("2001-01-01T00:00:00Z");
  base.setUTCDate(base.getUTCDate() + (RUN % 9000) + offsetDays);
  return base.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** A fully-answered checklist (every item status 'ok') so canSignOff passes. */
function completeChecklist(): Checklist {
  const base = buildInitialChecklist();
  const filled: Checklist = {};
  for (const [key, section] of Object.entries(base)) {
    filled[key] = {
      ...section,
      items: section.items.map((it) => ({ ...it, status: "ok" as const })),
    };
  }
  return filled;
}

describe("/api/haccp/reviews + /api/haccp/annual-review — F-19 PR6 route re-point", () => {
  let users: TestUserSet;
  let admin: { role: string; userId: string; name: string };

  beforeAll(async () => {
    users = await setupTestUsers();
    admin = { role: "admin", userId: users.admin.id, name: users.admin.name };
    // Free the one-draft slot on the LOCAL db so POST-draft tests are not blocked.
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
  }, 30_000);

  afterEach(async () => {
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
  }, 30_000);

  // ── reviews route: role gate ────────────────────────────────────────────────

  it("GET /api/haccp/reviews — non-admin → 401, byte-identical message", async () => {
    const res = await api("/api/haccp/reviews", {
      method: "GET",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe("Unauthorised — admin only");
  });

  it("GET /api/haccp/reviews — admin → 200 with the exact { weekly, monthly, weekly_done, monthly_done } shape", async () => {
    const res = await api("/api/haccp/reviews", { method: "GET", ...admin });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "weekly",
      "monthly",
      "weekly_done",
      "monthly_done",
    ]);
    expect(Array.isArray(body.weekly)).toBe(true);
    expect(Array.isArray(body.monthly)).toBe(true);
    expect(typeof body.weekly_done).toBe("boolean");
    expect(typeof body.monthly_done).toBe("boolean");
  });

  // ── reviews route: weekly POST + auto-CA side-effect ──────────────────────────

  it("POST /api/haccp/reviews weekly with a problem item → 200 {ok,problems:1} + a CA row lands linked by source_id", async () => {
    const supa = getServiceClient();
    const weekEnding = uniqueDate(0);

    const res = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: {
        type: "weekly",
        week_ending: weekEnding,
        assessments: [
          { id: "a1", label: "Hand washing", state: "ok" },
          {
            id: "a2",
            label: "Probe calibration",
            state: "problem",
            action: "  Recalibrated probe  ",
            caHint: "Schedule weekly calibration",
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, problems: 1 });

    // The review row landed; find it by its unique week_ending.
    const { data: wr } = await supa
      .from("haccp_weekly_review")
      .select("id")
      .eq("week_ending", weekEnding)
      .single();
    expect(wr).toBeTruthy();
    const reviewId = (wr as { id: string }).id;

    // The CA row landed, linked by source_id, with verbatim strings.
    const { data: cas } = await supa
      .from("haccp_corrective_actions")
      .select(
        "source_table, source_id, ccp_ref, deviation_description, action_taken, recurrence_prevention, product_disposition, management_verification_required",
      )
      .eq("source_id", reviewId);
    expect(cas && cas.length).toBe(1);
    const ca = (cas as Array<Record<string, unknown>>)[0];
    expect(ca.source_table).toBe("haccp_weekly_review");
    expect(ca.ccp_ref).toBe("WEEKLY-REVIEW");
    expect(ca.deviation_description).toBe("Weekly review — Probe calibration");
    expect(ca.action_taken).toBe("Recalibrated probe");
    expect(ca.recurrence_prevention).toBe("Schedule weekly calibration");
    expect(ca.product_disposition).toBe("assess");
    expect(ca.management_verification_required).toBe(true);
  });

  it("POST /api/haccp/reviews weekly with no problems → 200 {ok,problems:0} and NO CA row", async () => {
    const supa = getServiceClient();
    const weekEnding = uniqueDate(10);

    const res = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: {
        type: "weekly",
        week_ending: weekEnding,
        assessments: [{ id: "a1", label: "Hand washing", state: "ok" }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, problems: 0 });

    const { data: wr } = await supa
      .from("haccp_weekly_review")
      .select("id")
      .eq("week_ending", weekEnding)
      .single();
    const reviewId = (wr as { id: string }).id;
    const { data: cas } = await supa
      .from("haccp_corrective_actions")
      .select("id")
      .eq("source_id", reviewId);
    expect(cas && cas.length).toBe(0);
  });

  it("POST /api/haccp/reviews monthly with an invertFail item set to fire → CA created (flip honoured)", async () => {
    const supa = getServiceClient();
    const monthYear = uniqueDate(20);

    const res = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: {
        type: "monthly",
        month_year: monthYear,
        equipment_checks: { fridge: "ok" },
        facilities_checks: { walls: "ok" },
        haccp_system_review: [
          { id: "s1", label: "Records complete", result: "YES" }, // normal YES → NOT a problem
          {
            id: "s2",
            label: "Procedures need revision",
            result: "YES",
            invertFail: true, // flipped → problem
            notes: "Update SOP",
            caHint: "Annual SOP review",
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, problems: 1 });

    const { data: mr } = await supa
      .from("haccp_monthly_review")
      .select("id")
      .eq("month_year", monthYear)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .single();
    const reviewId = (mr as { id: string }).id;
    const { data: cas } = await supa
      .from("haccp_corrective_actions")
      .select("deviation_description, ccp_ref")
      .eq("source_id", reviewId);
    expect(cas && cas.length).toBe(1);
    const ca = (cas as Array<Record<string, unknown>>)[0];
    expect(ca.ccp_ref).toBe("MONTHLY-REVIEW");
    expect(ca.deviation_description).toBe(
      "Monthly HACCP review — Procedures need revision",
    );
  });

  // ── reviews route: validation 400s (exact strings + order) ────────────────────

  it("POST /api/haccp/reviews weekly — validation 400s in order", async () => {
    const noWeek = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "weekly", assessments: [] },
    });
    expect(noWeek.status).toBe(400);
    expect((noWeek.body as { error: string }).error).toBe(
      "Week ending date required",
    );

    const noAssessments = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "weekly", week_ending: uniqueDate(30) },
    });
    expect(noAssessments.status).toBe(400);
    expect((noAssessments.body as { error: string }).error).toBe(
      "Assessments required",
    );
  });

  it("POST /api/haccp/reviews monthly — validation 400s in order", async () => {
    const noMonth = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "monthly" },
    });
    expect(noMonth.status).toBe(400);
    expect((noMonth.body as { error: string }).error).toBe("Month/year required");

    const noEquip = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "monthly", month_year: "1999-01" },
    });
    expect(noEquip.status).toBe(400);
    expect((noEquip.body as { error: string }).error).toBe(
      "Equipment checks required",
    );

    const noFacil = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "monthly", month_year: "1999-01", equipment_checks: { a: 1 } },
    });
    expect(noFacil.status).toBe(400);
    expect((noFacil.body as { error: string }).error).toBe(
      "Facilities checks required",
    );

    const noSystem = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: {
        type: "monthly",
        month_year: "1999-01",
        equipment_checks: { a: 1 },
        facilities_checks: { b: 2 },
      },
    });
    expect(noSystem.status).toBe(400);
    expect((noSystem.body as { error: string }).error).toBe(
      "HACCP system review required",
    );
  });

  it("POST /api/haccp/reviews — invalid type → 400 byte-identical", async () => {
    const res = await api("/api/haccp/reviews", {
      method: "POST",
      ...admin,
      body: { type: "yearly" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Invalid type — must be weekly or monthly",
    );
  });

  // ── annual-review route ───────────────────────────────────────────────────────

  it("GET /api/haccp/annual-review — disallowed role → 401; allowed roles → 200 {reviews}", async () => {
    const denied = await api("/api/haccp/annual-review", {
      method: "GET",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(denied.status).toBe(401);
    expect((denied.body as { error: string }).error).toBe("Unauthorised");

    for (const role of ["warehouse", "butcher", "admin"] as const) {
      const u = users[role];
      const res = await api("/api/haccp/annual-review", {
        method: "GET",
        role,
        userId: u.id,
        name: u.name,
      });
      expect(res.status, `GET as ${role}`).toBe(200);
      const body = res.body as { reviews: unknown };
      expect(Array.isArray(body.reviews)).toBe(true);
    }
  });

  it("POST annual draft → 201; the join shape on GET is a { name } object (R-B2)", async () => {
    const created = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: {
        review_year: `PR6-${RUN}`,
        review_period_from: "2001-01-01",
        review_period_to: "2001-12-31",
      },
    });
    expect(created.status).toBe(201);
    const review = (created.body as { review: { id: string } }).review;
    expect(typeof review.id).toBe("string");

    // GET back — the creator join must be a single { name } object, not an array.
    const list = await api("/api/haccp/annual-review", { method: "GET", ...admin });
    const reviews = (list.body as { reviews: Array<Record<string, unknown>> })
      .reviews;
    const ours = reviews.find((r) => r.id === review.id);
    expect(ours).toBeDefined();
    const creator = ours!.creator as { name: string } | null;
    expect(creator).not.toBeNull();
    expect(typeof creator!.name).toBe("string");
  });

  it("POST a second annual draft → 409 with the exact message (ConflictError → 409)", async () => {
    const first = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: {
        review_year: `PR6-first-${RUN}`,
        review_period_from: "2001-01-01",
        review_period_to: "2001-12-31",
      },
    });
    expect(first.status).toBe(201);

    const second = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: {
        review_year: `PR6-second-${RUN}`,
        review_period_from: "2001-01-01",
        review_period_to: "2001-12-31",
      },
    });
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe(
      "A draft review already exists. Complete or delete it before starting a new one.",
    );
  });

  it("POST annual draft — validation 400s in order", async () => {
    const noYear = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: { review_year: "  ", review_period_from: "2001-01-01", review_period_to: "2001-12-31" },
    });
    expect(noYear.status).toBe(400);
    expect((noYear.body as { error: string }).error).toBe(
      "Review year label is required",
    );

    const badPeriod = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: { review_year: "X", review_period_from: "2001-12-31", review_period_to: "2001-01-01" },
    });
    expect(badPeriod.status).toBe(400);
    expect((badPeriod.body as { error: string }).error).toBe(
      "Invalid review period — from must be before to, and to cannot be in the future",
    );
  });

  // ── R-D1 MUST-FIX: PATCH missing id → 400, NEVER 404 ──────────────────────────

  it("R-D1: PATCH /api/haccp/annual-review with NO id → 400 'Review ID required' (never 404)", async () => {
    const res = await api("/api/haccp/annual-review", {
      method: "PATCH",
      ...admin,
      body: { checklist: completeChecklist() }, // no id
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Review ID required");
  });

  it("PATCH unknown id → 404 'Review not found'", async () => {
    const res = await api("/api/haccp/annual-review", {
      method: "PATCH",
      ...admin,
      body: { id: "00000000-0000-0000-0000-000000000000", checklist: completeChecklist() },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Review not found");
  });

  it("PATCH sign-off → review locked; a follow-up PATCH on the locked row → 409", async () => {
    // Create a draft.
    const created = await api("/api/haccp/annual-review", {
      method: "POST",
      ...admin,
      body: {
        review_year: `PR6-signoff-${RUN}`,
        review_period_from: "2001-01-01",
        review_period_to: "2001-12-31",
      },
    });
    expect(created.status).toBe(201);
    const id = (created.body as { review: { id: string } }).review.id;

    // Sign off with a complete checklist → locked:true.
    const signed = await api("/api/haccp/annual-review", {
      method: "PATCH",
      ...admin,
      body: {
        id,
        checklist: completeChecklist(),
        // approved_by is an FK → users.id; use a real user UUID.
        sign_off: { approved_by: users.office.id, approved_at: "2001-12-31" },
      },
    });
    expect(signed.status).toBe(200);
    const signedReview = (signed.body as { review: { locked: boolean } }).review;
    expect(signedReview.locked).toBe(true);

    // A further edit on the locked row → 409.
    const locked = await api("/api/haccp/annual-review", {
      method: "PATCH",
      ...admin,
      body: { id, checklist: completeChecklist() },
    });
    expect(locked.status).toBe(409);
    expect((locked.body as { error: string }).error).toBe(
      "This review is locked and cannot be edited",
    );

    // Free the locked row (afterEach only clears unlocked drafts).
    await getServiceClient().from("haccp_annual_reviews").delete().eq("id", id);
  });

  it("PATCH/POST as non-admin → 403 'Admin only'", async () => {
    const patch = await api("/api/haccp/annual-review", {
      method: "PATCH",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
      body: { id: "x" },
    });
    expect(patch.status).toBe(403);
    expect((patch.body as { error: string }).error).toBe("Admin only");

    const post = await api("/api/haccp/annual-review", {
      method: "POST",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
      body: { review_year: "x" },
    });
    expect(post.status).toBe(403);
    expect((post.body as { error: string }).error).toBe("Admin only");
  });
});
