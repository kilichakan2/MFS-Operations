/**
 * tests/integration/haccpReviewsFoundation.test.ts
 *
 * Integration tests for the F-19 PR5 Cluster D "reviews foundation" hexagons —
 * HaccpReviews (weekly/monthly + the auto corrective-action side-effect) and
 * HaccpAnnualReview (draft / lock / sign-off lifecycle).
 *
 * INTRODUCE-ONLY / DEAD CODE: no route calls these services yet (PR6 re-points).
 * So this suite drives the two NEW hexagons DIRECTLY against the LOCAL Supabase
 * via their service-role wiring singletons (`haccpReviewsService` /
 * `haccpAnnualReviewService` from `@/lib/wiring/haccp`) — NOT via any HTTP route
 * (there is none). The point is to prove the dead code actually works against the
 * REAL schema so PR6 can re-point safely, and to PIN the annual-review join shape
 * (R-B2) that unit tests cannot reach.
 *
 * Schema facts that shape the test (supabase/migrations/20260101000000_baseline.sql):
 *   - haccp_weekly_review:   UNIQUE(week_ending), no_delete + no_update rules.
 *   - haccp_monthly_review:  no unique on month_year, no_delete + no_update rules.
 *   - haccp_corrective_actions: source_id is uuid NOT NULL → CA source_id MUST be
 *     the real inserted review id; no_delete rule.
 *   - haccp_annual_reviews:  idx_annual_reviews_one_draft (partial UNIQUE on
 *     locked WHERE locked=false) → one draft at a time; DELETABLE (no no_delete).
 *     signed_off_by/approved_by/created_by are FK→users.id.
 *
 * Because the review tables are append-only (no_delete), this suite uses per-run
 * UNIQUE markers (week_ending / month_year derived from Date.now()) so re-runs do
 * not collide on the unique index, and it asserts the SPECIFIC inserted row, never
 * a table count. The annual_reviews rows ARE deleted in afterEach (the unique-draft
 * slot must be freed).
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed). Run via
 * npm run test:integration (auto-boots the local-wired dev server; this file does
 * not call the HTTP layer but shares the same .env.test.local local-DB invariant).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";
import {
  haccpReviewsService,
  haccpAnnualReviewService,
} from "@/lib/wiring/haccp";
import {
  buildInitialChecklist,
  type Checklist,
} from "@/lib/annualReview/sections";
import type {
  CreateReviewWeeklyInput,
  CreateReviewMonthlyInput,
} from "@/lib/domain";

// Per-run unique suffix so the weekly UNIQUE(week_ending) index never collides
// across re-runs of an append-only (no_delete) table.
const RUN = Date.now();

// A unique week_ending date for this run (the weekly table's UNIQUE column).
// Derive a far-past deterministic-per-run date from RUN so it never clashes with
// real seed data or other runs.
function uniqueDate(offsetDays: number): string {
  const base = new Date("2000-01-01T00:00:00Z");
  // spread across days using RUN so concurrent/repeat runs differ
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

describe("F-19 PR5 Cluster D — reviews foundation hexagons (direct, dead code, real local DB)", () => {
  let users: TestUserSet;
  let userId: string;

  // Track annual-review rows to delete (the unique-draft slot must be freed).
  const annualIdsToClean: string[] = [];

  beforeAll(async () => {
    users = await setupTestUsers();
    userId = users.admin.id;

    // Free the one-draft slot: delete ANY pre-existing unlocked annual review on
    // the LOCAL db so createDraft is not blocked by leftover seed/state. Local DB
    // only — _setup.ts hard-blocks the prod project ref.
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
  }, 30_000);

  afterEach(async () => {
    // Free the unique-draft slot between annual tests: delete any unlocked rows
    // plus the specific rows we created.
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
    if (annualIdsToClean.length) {
      await supa
        .from("haccp_annual_reviews")
        .delete()
        .in("id", annualIdsToClean);
      annualIdsToClean.length = 0;
    }
  }, 30_000);

  afterAll(async () => {
    // Belt-and-braces: ensure no draft we created lingers in the one-draft slot.
    const supa = getServiceClient();
    await supa.from("haccp_annual_reviews").delete().eq("locked", false);
  }, 30_000);

  // ── HaccpReviews: weekly insert + auto corrective-action side-effect ──────────

  it("weekly: insert lands in haccp_weekly_review and the problem item auto-creates a CA row (source_id linked, verbatim strings)", async () => {
    const supa = getServiceClient();
    const weekEnding = uniqueDate(0);
    const today = uniqueDate(1);

    const input: CreateReviewWeeklyInput = {
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
        // A problem with NO action + NO caHint → exercises BOTH fallback strings.
        { id: "a3", label: "Floor cleaning", state: "problem" },
      ],
    };

    // 1. validate (no error) + build persist (date injected) + insert.
    const v = haccpReviewsService.validateWeekly(input);
    expect(v.ok).toBe(true);

    const persist = haccpReviewsService.buildWeeklyPersist({
      input,
      userId,
      today,
    });
    expect(persist.date).toBe(today);
    expect(persist.submitted_by).toBe(userId);
    expect(persist.week_ending).toBe(weekEnding);

    const { id: reviewId } =
      await haccpReviewsService.insertWeeklyReview(persist);
    expect(typeof reviewId).toBe("string");

    // The review row actually landed in haccp_weekly_review.
    const { data: wr } = await supa
      .from("haccp_weekly_review")
      .select("id, submitted_by, week_ending, date, assessments")
      .eq("id", reviewId)
      .single();
    expect(wr).toBeTruthy();
    expect((wr as { submitted_by: string }).submitted_by).toBe(userId);
    expect((wr as { week_ending: string }).week_ending).toBe(weekEnding);

    // 2. Build the CA rows (the dead-code side-effect) and write them.
    const caRows = haccpReviewsService.buildWeeklyCorrectiveActions({
      input,
      userId,
      reviewId,
      weekEnding,
    });
    // Only the two 'problem' items become CA rows.
    expect(caRows.length).toBe(2);
    await haccpReviewsService.insertCorrectiveActions(caRows);

    // 3. The CA rows actually landed, linked by source_id = the new review id.
    const { data: cas } = await supa
      .from("haccp_corrective_actions")
      .select(
        "source_table, source_id, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, management_verification_required, actioned_by",
      )
      .eq("source_id", reviewId)
      .order("deviation_description", { ascending: true });

    expect(cas && cas.length).toBe(2);
    const rows = cas as Array<Record<string, unknown>>;

    // Every CA row links the new review id + carries the weekly literals.
    for (const r of rows) {
      expect(r.source_table).toBe("haccp_weekly_review");
      expect(r.source_id).toBe(reviewId);
      expect(r.ccp_ref).toBe("WEEKLY-REVIEW");
      expect(r.product_disposition).toBe("assess");
      expect(r.management_verification_required).toBe(true);
      expect(r.actioned_by).toBe(userId);
    }

    // Floor cleaning (no action, no caHint) → both fallback strings.
    const floor = rows.find(
      (r) => r.deviation_description === "Weekly review — Floor cleaning",
    );
    expect(floor).toBeDefined();
    expect(floor!.action_taken).toBe(
      `No action notes recorded at time of review — refer to weekly review record (week ending ${weekEnding})`,
    );
    expect(floor!.recurrence_prevention).toBe("Review procedures");

    // Probe calibration (action trimmed, caHint present).
    const probe = rows.find(
      (r) => r.deviation_description === "Weekly review — Probe calibration",
    );
    expect(probe).toBeDefined();
    expect(probe!.action_taken).toBe("Recalibrated probe");
    expect(probe!.recurrence_prevention).toBe("Schedule weekly calibration");
  });

  // ── HaccpReviews: monthly insert + invertFail-filtered CA rows ────────────────

  it("monthly: insert lands in haccp_monthly_review and the invertFail logic picks the right CA rows", async () => {
    const supa = getServiceClient();
    const monthYear = uniqueDate(2);
    const today = uniqueDate(3);

    const input: CreateReviewMonthlyInput = {
      month_year: monthYear,
      equipment_checks: { fridge: "ok" },
      facilities_checks: { walls: "ok" },
      further_notes: "  trim me  ",
      haccp_system_review: [
        // normal item, result NO → problem
        { id: "s1", label: "Procedures followed", result: "NO" },
        // normal item, result YES → NOT a problem
        { id: "s2", label: "Records complete", result: "YES" },
        // invertFail item, result YES → problem (flipped)
        {
          id: "s3",
          label: "Procedures need revision",
          result: "YES",
          invertFail: true,
          notes: "  Update SOP  ",
          caHint: "Annual SOP review",
        },
        // invertFail item, result NO → NOT a problem (flipped)
        {
          id: "s4",
          label: "Equipment upgrade needed",
          result: "NO",
          invertFail: true,
        },
      ],
    };

    const v = haccpReviewsService.validateMonthly(input);
    expect(v.ok).toBe(true);

    const persist = haccpReviewsService.buildMonthlyPersist({
      input,
      userId,
      today,
    });
    expect(persist.date).toBe(today);
    expect(persist.further_notes).toBe("trim me"); // trimmed

    const { id: reviewId } =
      await haccpReviewsService.insertMonthlyReview(persist);
    expect(typeof reviewId).toBe("string");

    const { data: mr } = await supa
      .from("haccp_monthly_review")
      .select("id, submitted_by, month_year, further_notes")
      .eq("id", reviewId)
      .single();
    expect(mr).toBeTruthy();
    expect((mr as { further_notes: string }).further_notes).toBe("trim me");

    const caRows = haccpReviewsService.buildMonthlySystemCorrectiveActions({
      input,
      userId,
      reviewId,
      monthYear,
    });
    // s1 (NO) + s3 (invertFail YES) are problems; s2, s4 are not.
    expect(caRows.length).toBe(2);
    await haccpReviewsService.insertCorrectiveActions(caRows);

    const { data: cas } = await supa
      .from("haccp_corrective_actions")
      .select(
        "source_table, source_id, ccp_ref, deviation_description, action_taken, recurrence_prevention, product_disposition",
      )
      .eq("source_id", reviewId);
    expect(cas && cas.length).toBe(2);
    const rows = cas as Array<Record<string, unknown>>;

    const labels = rows.map((r) => r.deviation_description).sort();
    expect(labels).toEqual([
      "Monthly HACCP review — Procedures followed",
      "Monthly HACCP review — Procedures need revision",
    ]);
    for (const r of rows) {
      expect(r.source_table).toBe("haccp_monthly_review");
      expect(r.source_id).toBe(reviewId);
      expect(r.ccp_ref).toBe("MONTHLY-REVIEW");
      expect(r.product_disposition).toBe("assess");
    }

    // s1: no notes → fallback action + fallback recurrence with monthYear.
    const followed = rows.find(
      (r) =>
        r.deviation_description === "Monthly HACCP review — Procedures followed",
    );
    expect(followed!.action_taken).toBe(
      `No action notes recorded at time of review — refer to monthly review record (${monthYear})`,
    );
    expect(followed!.recurrence_prevention).toBe(
      "Review procedures and update HACCP plan",
    );

    // s3: notes trimmed + caHint present.
    const revision = rows.find(
      (r) =>
        r.deviation_description ===
        "Monthly HACCP review — Procedures need revision",
    );
    expect(revision!.action_taken).toBe("Update SOP");
    expect(revision!.recurrence_prevention).toBe("Annual SOP review");
  });

  // ── HaccpReviews: best-effort swallow does NOT abort the review insert ────────

  it("weekly: a CA write does not throw (best-effort swallow) and the review insert stands", async () => {
    const supa = getServiceClient();
    const weekEnding = uniqueDate(4);
    const today = uniqueDate(5);

    const input: CreateReviewWeeklyInput = {
      week_ending: weekEnding,
      assessments: [{ id: "x", label: "OK item", state: "ok" }],
    };
    const persist = haccpReviewsService.buildWeeklyPersist({
      input,
      userId,
      today,
    });
    const { id: reviewId } =
      await haccpReviewsService.insertWeeklyReview(persist);

    // No problems → empty CA set; writing an empty array must not throw.
    const caRows = haccpReviewsService.buildWeeklyCorrectiveActions({
      input,
      userId,
      reviewId,
      weekEnding,
    });
    expect(caRows.length).toBe(0);
    await expect(
      haccpReviewsService.insertCorrectiveActions(caRows),
    ).resolves.toBeUndefined();

    // The review still exists regardless of the (no-op) CA write.
    const { data: wr } = await supa
      .from("haccp_weekly_review")
      .select("id")
      .eq("id", reviewId)
      .single();
    expect(wr).toBeTruthy();
  });

  // ── HaccpAnnualReview: draft + unique-draft conflict + update + sign-off ──────

  it("annual: create a draft lands a row; a SECOND draft throws ConflictError (unique-draft 23505 mapped)", async () => {
    const now = new Date();
    const input = {
      review_year: `ANVIL-TEST-${RUN}`,
      review_period_from: "2025-01-01",
      review_period_to: "2025-12-31",
    };

    expect(haccpAnnualReviewService.validateCreate(input).ok).toBe(true);

    const persist = haccpAnnualReviewService.buildCreatePersist({
      input,
      userId,
      now,
    });
    expect(persist.locked).toBe(false);
    expect(persist.created_by).toBe(userId);

    const created = await haccpAnnualReviewService.createDraft(persist);
    annualIdsToClean.push(created.id);
    expect(created.id).toBeTruthy();
    expect(created.locked).toBe(false);
    expect(created.review_year).toBe(`ANVIL-TEST-${RUN}`);

    // A SECOND draft must hit the partial-unique index → ConflictError.
    const persist2 = haccpAnnualReviewService.buildCreatePersist({
      input: { ...input, review_year: `ANVIL-TEST-${RUN}-dup` },
      userId,
      now,
    });
    await expect(
      haccpAnnualReviewService.createDraft(persist2),
    ).rejects.toThrow(
      "A draft review already exists. Complete or delete it before starting a new one.",
    );
  });

  it("annual: PATCH update then sign-off → locked=true with signer/approver fields set", async () => {
    const supa = getServiceClient();
    const now = new Date();

    const created = await haccpAnnualReviewService.createDraft(
      haccpAnnualReviewService.buildCreatePersist({
        input: {
          review_year: `ANVIL-TEST-${RUN}-signoff`,
          review_period_from: "2025-01-01",
          review_period_to: "2025-12-31",
        },
        userId,
        now,
      }),
    );
    annualIdsToClean.push(created.id);

    // findCurrent returns the fetched record (id/locked/checklist).
    const current = await haccpAnnualReviewService.findCurrent(created.id);
    expect(current).not.toBeNull();
    expect(current!.id).toBe(created.id);
    expect(current!.locked).toBe(false);

    // A plain update writes updated_at (+ action_plan here); does not lock.
    const updatePersist = haccpAnnualReviewService.buildUpdatePersist({
      input: { id: created.id, action_plan: [] },
      now,
    });
    const updated = await haccpAnnualReviewService.update(
      created.id,
      updatePersist,
    );
    expect(updated.locked).toBe(false);

    // Sign-off: complete checklist + approver fields → locked=true.
    const signOffInput = {
      id: created.id,
      checklist: completeChecklist(),
      sign_off: { approved_by: users.office.id, approved_at: "2025-12-31" },
    };
    const patchValidation = haccpAnnualReviewService.validatePatch({
      input: signOffInput,
      currentChecklist: current!.checklist,
    });
    expect(patchValidation.ok).toBe(true);

    const signOffPersist = haccpAnnualReviewService.buildSignOffPersist({
      input: signOffInput,
      current: current!,
      userId,
      now,
    });
    expect(signOffPersist.locked).toBe(true);
    expect(signOffPersist.signed_off_by).toBe(userId);
    expect(signOffPersist.approved_by).toBe(users.office.id);

    const signed = await haccpAnnualReviewService.signOff(
      created.id,
      signOffPersist,
    );
    expect(signed.locked).toBe(true);

    // Verify in the DB the lock + signer/approver actually persisted.
    const { data: row } = await supa
      .from("haccp_annual_reviews")
      .select("locked, signed_off_by, approved_by, approved_at")
      .eq("id", created.id)
      .single();
    expect((row as { locked: boolean }).locked).toBe(true);
    expect((row as { signed_off_by: string }).signed_off_by).toBe(userId);
    expect((row as { approved_by: string }).approved_by).toBe(users.office.id);
  });

  // ── R-B2 (the highest-value assertion): PIN the real join SHAPE ───────────────

  it("R-B2: listReviews returns signer/approver/creator in the REAL Supabase join shape (object vs array vs null) — PINNED", async () => {
    const supa = getServiceClient();
    const now = new Date();

    // Seed a row with ALL THREE FK columns populated + locked=true (so it does not
    // occupy the one-draft slot and survives across the list read). We insert
    // directly to control signed_off_by/approved_by/created_by precisely.
    const { data: seeded, error: seedErr } = await supa
      .from("haccp_annual_reviews")
      .insert({
        review_year: `ANVIL-TEST-${RUN}-rb2`,
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
        checklist: {},
        action_plan: [],
        locked: true,
        created_by: users.admin.id,
        signed_off_by: users.admin.id,
        signed_off_at: now.toISOString(),
        approved_by: users.office.id,
        approved_at: "2025-12-31",
      })
      .select("id")
      .single();
    expect(seedErr).toBeNull();
    const seededId = (seeded as { id: string }).id;
    annualIdsToClean.push(seededId);

    // Read it back THROUGH THE ADAPTER (the real aliased join).
    const reviews = await haccpAnnualReviewService.getReviews();
    const target = reviews.reviews.find((r) => r.id === seededId);
    expect(target).toBeDefined();

    // Diagnose the actual returned shapes — this is the thing PR6 depends on.
    const shapeOf = (v: unknown): string => {
      if (v === null) return "null";
      if (Array.isArray(v)) return `array(len=${v.length})`;
      if (typeof v === "object") return "object";
      return typeof v;
    };
    // eslint-disable-next-line no-console
    console.log(
      `[R-B2 JOIN SHAPE] signer=${shapeOf(target!.signer)} ` +
        `approver=${shapeOf(target!.approver)} ` +
        `creator=${shapeOf(target!.creator)} ` +
        `| signer=${JSON.stringify(target!.signer)} ` +
        `approver=${JSON.stringify(target!.approver)} ` +
        `creator=${JSON.stringify(target!.creator)}`,
    );

    // PIN: a populated *-to-one FK alias comes back as a single {name} OBJECT
    // (Supabase returns an object, not a 1-element array, for a to-one embed).
    // If this assertion ever flips to an array, PR6's wire shape changes — that
    // is exactly what we are pinning here.
    expect(target!.signer).toEqual({ name: users.admin.name });
    expect(target!.approver).toEqual({ name: users.office.name });
    expect(target!.creator).toEqual({ name: users.admin.name });

    // Not an array, not null, when the FK is populated.
    expect(Array.isArray(target!.signer)).toBe(false);
    expect(Array.isArray(target!.approver)).toBe(false);
    expect(Array.isArray(target!.creator)).toBe(false);
  });
});
