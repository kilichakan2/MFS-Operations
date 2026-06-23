/**
 * tests/unit/services/HaccpReviewsService.test.ts
 *
 * F-19 PR5 — the Cluster D "reviews" service against the Fake repo.
 *
 * Pins:
 *   - `getReviews` returns { weekly, monthly, weekly_done, monthly_done } (key
 *     order) from seeded reads; the done flags computed from the passed-in
 *     monday/sunday/mFrom/mTo windows (boundary cases);
 *   - `validateWeekly` 2 strings IN ORDER (incl. non-array assessments branch);
 *   - `validateMonthly` 4 strings IN ORDER;
 *   - `buildWeeklyPersist` / `buildMonthlyPersist` exact payloads (date = injected
 *     today; further_notes trim-or-null);
 *   - `buildWeeklyCorrectiveActions` — the CA side-effect: filters
 *     state==='problem'; exact row incl. the action_taken fallback with the
 *     week-ending interpolation; returns [] when no problems;
 *   - `buildMonthlySystemCorrectiveActions` — the invertFail flip; exact row;
 *   - insert delegation returns the seeded id + records payloads;
 *   - `insertCorrectiveActions` records rows AND never throws.
 *
 * Determinism: a FIXED today string is injected; the service never calls
 * new Date().
 */
import { describe, it, expect } from "vitest";
import { createHaccpReviewsService } from "@/lib/services";
import { createFakeHaccpReviewsRepository } from "@/lib/adapters/fake";
import type {
  ReviewWeeklyRow,
  ReviewMonthlyRow,
  CreateReviewWeeklyInput,
  CreateReviewMonthlyInput,
} from "@/lib/domain";

const TODAY = "2026-06-23";

function weeklyRow(overrides: Partial<ReviewWeeklyRow>): ReviewWeeklyRow {
  return {
    id: "w1",
    week_ending: "2026-06-21",
    date: "2026-06-21",
    assessments: [],
    submitted_at: "2026-06-21T00:00:00.000Z",
    users: { name: "Ada" },
    ...overrides,
  };
}

function monthlyRow(overrides: Partial<ReviewMonthlyRow>): ReviewMonthlyRow {
  return {
    id: "m1",
    month_year: "2026-06-15",
    date: "2026-06-15",
    equipment_checks: {},
    facilities_checks: {},
    haccp_system_review: [],
    further_notes: null,
    submitted_at: "2026-06-15T00:00:00.000Z",
    users: { name: "Ada" },
    ...overrides,
  };
}

describe("HaccpReviewsService — getReviews", () => {
  it("returns { weekly, monthly, weekly_done, monthly_done } in that key order", async () => {
    const weekly = [weeklyRow({ id: "w1" })];
    const monthly = [monthlyRow({ id: "m1" })];
    const repo = createFakeHaccpReviewsRepository({ weekly, monthly });
    const svc = createHaccpReviewsService({ reviews: repo });
    const res = await svc.getReviews({
      monday: "2026-06-15",
      sunday: "2026-06-21",
      mFrom: "2026-06-01",
      mTo: "2026-06-31",
    });
    expect(Object.keys(res)).toEqual([
      "weekly",
      "monthly",
      "weekly_done",
      "monthly_done",
    ]);
    expect(res.weekly).toEqual(weekly);
    expect(res.monthly).toEqual(monthly);
  });

  it("weekly_done: true when a week_ending falls within [monday, sunday] inclusive", async () => {
    const repo = createFakeHaccpReviewsRepository({
      weekly: [weeklyRow({ week_ending: "2026-06-15" })], // == monday
    });
    const svc = createHaccpReviewsService({ reviews: repo });
    const res = await svc.getReviews({
      monday: "2026-06-15",
      sunday: "2026-06-21",
      mFrom: "2026-06-01",
      mTo: "2026-06-31",
    });
    expect(res.weekly_done).toBe(true);
  });

  it("weekly_done: true at the sunday boundary; false outside the window", async () => {
    const svc = createHaccpReviewsService({
      reviews: createFakeHaccpReviewsRepository({
        weekly: [weeklyRow({ week_ending: "2026-06-21" })], // == sunday
      }),
    });
    expect(
      (
        await svc.getReviews({
          monday: "2026-06-15",
          sunday: "2026-06-21",
          mFrom: "2026-06-01",
          mTo: "2026-06-31",
        })
      ).weekly_done,
    ).toBe(true);

    const svcOut = createHaccpReviewsService({
      reviews: createFakeHaccpReviewsRepository({
        weekly: [weeklyRow({ week_ending: "2026-06-22" })], // past sunday
      }),
    });
    expect(
      (
        await svcOut.getReviews({
          monday: "2026-06-15",
          sunday: "2026-06-21",
          mFrom: "2026-06-01",
          mTo: "2026-06-31",
        })
      ).weekly_done,
    ).toBe(false);
  });

  it("monthly_done: computed from mFrom/mTo window", async () => {
    const inWindow = createHaccpReviewsService({
      reviews: createFakeHaccpReviewsRepository({
        monthly: [monthlyRow({ month_year: "2026-06-01" })], // == mFrom
      }),
    });
    expect(
      (
        await inWindow.getReviews({
          monday: "2026-06-15",
          sunday: "2026-06-21",
          mFrom: "2026-06-01",
          mTo: "2026-06-31",
        })
      ).monthly_done,
    ).toBe(true);

    const outWindow = createHaccpReviewsService({
      reviews: createFakeHaccpReviewsRepository({
        monthly: [monthlyRow({ month_year: "2026-05-31" })], // before mFrom
      }),
    });
    expect(
      (
        await outWindow.getReviews({
          monday: "2026-06-15",
          sunday: "2026-06-21",
          mFrom: "2026-06-01",
          mTo: "2026-06-31",
        })
      ).monthly_done,
    ).toBe(false);
  });

  it("returns empty arrays + both done=false when nothing seeded", async () => {
    const svc = createHaccpReviewsService({
      reviews: createFakeHaccpReviewsRepository(),
    });
    const res = await svc.getReviews({
      monday: "2026-06-15",
      sunday: "2026-06-21",
      mFrom: "2026-06-01",
      mTo: "2026-06-31",
    });
    expect(res).toEqual({
      weekly: [],
      monthly: [],
      weekly_done: false,
      monthly_done: false,
    });
  });
});

describe("HaccpReviewsService — validateWeekly (2 strings in order)", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });

  it("Week ending date required", () => {
    expect(svc.validateWeekly({ assessments: [] })).toEqual({
      ok: false,
      status: 400,
      message: "Week ending date required",
    });
  });
  it("Assessments required (missing)", () => {
    expect(svc.validateWeekly({ week_ending: "2026-06-21" })).toEqual({
      ok: false,
      status: 400,
      message: "Assessments required",
    });
  });
  it("Assessments required (non-array)", () => {
    expect(
      svc.validateWeekly({
        week_ending: "2026-06-21",
        assessments: "nope" as unknown as never,
      }),
    ).toEqual({ ok: false, status: 400, message: "Assessments required" });
  });
  it("passes when both present", () => {
    expect(
      svc.validateWeekly({ week_ending: "2026-06-21", assessments: [] }),
    ).toEqual({ ok: true });
  });
});

describe("HaccpReviewsService — validateMonthly (4 strings in order)", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });
  const VALID: CreateReviewMonthlyInput = {
    month_year: "2026-06",
    equipment_checks: {},
    facilities_checks: {},
    haccp_system_review: [],
  };

  it("Month/year required", () => {
    expect(svc.validateMonthly({ ...VALID, month_year: "" })).toEqual({
      ok: false,
      status: 400,
      message: "Month/year required",
    });
  });
  it("Equipment checks required", () => {
    expect(
      svc.validateMonthly({ ...VALID, equipment_checks: undefined }),
    ).toEqual({ ok: false, status: 400, message: "Equipment checks required" });
  });
  it("Facilities checks required", () => {
    expect(
      svc.validateMonthly({ ...VALID, facilities_checks: undefined }),
    ).toEqual({ ok: false, status: 400, message: "Facilities checks required" });
  });
  it("HACCP system review required", () => {
    expect(
      svc.validateMonthly({ ...VALID, haccp_system_review: undefined }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "HACCP system review required",
    });
  });
  it("passes when all present", () => {
    expect(svc.validateMonthly(VALID)).toEqual({ ok: true });
  });
});

describe("HaccpReviewsService — buildWeeklyPersist", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });
  it("exact payload incl. date = injected today", () => {
    const input: CreateReviewWeeklyInput = {
      week_ending: "2026-06-21",
      assessments: [{ id: "i1", label: "L", state: "ok" }],
    };
    expect(
      svc.buildWeeklyPersist({ input, userId: "u1", today: TODAY }),
    ).toEqual({
      submitted_by: "u1",
      week_ending: "2026-06-21",
      date: TODAY,
      assessments: input.assessments,
    });
  });
});

describe("HaccpReviewsService — buildMonthlyPersist", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });
  it("exact payload; further_notes trims to value", () => {
    expect(
      svc.buildMonthlyPersist({
        input: {
          month_year: "2026-06",
          equipment_checks: { e: 1 },
          facilities_checks: { f: 1 },
          haccp_system_review: [],
          further_notes: "  hi  ",
        },
        userId: "u1",
        today: TODAY,
      }),
    ).toEqual({
      submitted_by: "u1",
      month_year: "2026-06",
      date: TODAY,
      equipment_checks: { e: 1 },
      facilities_checks: { f: 1 },
      haccp_system_review: [],
      further_notes: "hi",
    });
  });
  it("further_notes → null when blank/omitted", () => {
    expect(
      svc.buildMonthlyPersist({
        input: {
          month_year: "2026-06",
          equipment_checks: {},
          facilities_checks: {},
          haccp_system_review: [],
          further_notes: "   ",
        },
        userId: "u1",
        today: TODAY,
      }).further_notes,
    ).toBeNull();
    expect(
      svc.buildMonthlyPersist({
        input: {
          month_year: "2026-06",
          equipment_checks: {},
          facilities_checks: {},
          haccp_system_review: [],
        },
        userId: "u1",
        today: TODAY,
      }).further_notes,
    ).toBeNull();
  });
});

describe("HaccpReviewsService — buildWeeklyCorrectiveActions (the CA side-effect)", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });

  it("filters state==='problem'; builds the exact CA row; uses action.trim() when present", () => {
    const rows = svc.buildWeeklyCorrectiveActions({
      input: {
        week_ending: "2026-06-21",
        assessments: [
          { id: "i1", label: "Floors", state: "ok" },
          {
            id: "i2",
            label: "Chiller",
            state: "problem",
            action: "  fixed it  ",
            caHint: "Inspect daily",
          },
        ],
      },
      userId: "u1",
      reviewId: "rev-123",
      weekEnding: "2026-06-21",
    });
    expect(rows).toEqual([
      {
        actioned_by: "u1",
        source_table: "haccp_weekly_review",
        source_id: "rev-123",
        ccp_ref: "WEEKLY-REVIEW",
        deviation_description: "Weekly review — Chiller",
        action_taken: "fixed it",
        product_disposition: "assess",
        recurrence_prevention: "Inspect daily",
        management_verification_required: true,
      },
    ]);
  });

  it("uses the week-ending fallback string + 'Review procedures' when action/caHint missing", () => {
    const rows = svc.buildWeeklyCorrectiveActions({
      input: {
        week_ending: "2026-06-21",
        assessments: [{ id: "i2", label: "Chiller", state: "problem" }],
      },
      userId: "u1",
      reviewId: "rev-123",
      weekEnding: "2026-06-21",
    });
    expect(rows[0].action_taken).toBe(
      "No action notes recorded at time of review — refer to weekly review record (week ending 2026-06-21)",
    );
    expect(rows[0].recurrence_prevention).toBe("Review procedures");
  });

  it("returns [] when no problems", () => {
    expect(
      svc.buildWeeklyCorrectiveActions({
        input: {
          week_ending: "2026-06-21",
          assessments: [{ id: "i1", label: "Floors", state: "ok" }],
        },
        userId: "u1",
        reviewId: "rev-123",
        weekEnding: "2026-06-21",
      }),
    ).toEqual([]);
  });
});

describe("HaccpReviewsService — buildMonthlySystemCorrectiveActions (the invertFail flip)", () => {
  const svc = createHaccpReviewsService({
    reviews: createFakeHaccpReviewsRepository(),
  });

  it("normal item: result==='NO' is a problem; result==='YES' is not", () => {
    const rows = svc.buildMonthlySystemCorrectiveActions({
      input: {
        month_year: "2026-06",
        haccp_system_review: [
          { id: "s1", label: "Plan current", result: "NO", notes: "  redo  " },
          { id: "s2", label: "Hazard analysis", result: "YES" },
        ],
      },
      userId: "u1",
      reviewId: "rev-9",
      monthYear: "2026-06",
    });
    expect(rows).toEqual([
      {
        actioned_by: "u1",
        source_table: "haccp_monthly_review",
        source_id: "rev-9",
        ccp_ref: "MONTHLY-REVIEW",
        deviation_description: "Monthly HACCP review — Plan current",
        action_taken: "redo",
        product_disposition: "assess",
        recurrence_prevention: "Review procedures and update HACCP plan",
        management_verification_required: true,
      },
    ]);
  });

  it("invertFail item: result==='YES' is a problem; result==='NO' is not", () => {
    const rows = svc.buildMonthlySystemCorrectiveActions({
      input: {
        month_year: "2026-06",
        haccp_system_review: [
          {
            id: "s3",
            label: "Procedures revise",
            result: "YES",
            invertFail: true,
            caHint: "Update SOPs",
          },
          {
            id: "s4",
            label: "Equipment upgrade",
            result: "NO",
            invertFail: true,
          },
        ],
      },
      userId: "u1",
      reviewId: "rev-9",
      monthYear: "2026-06",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].deviation_description).toBe(
      "Monthly HACCP review — Procedures revise",
    );
    expect(rows[0].recurrence_prevention).toBe("Update SOPs");
  });

  it("uses the month-year fallback string when notes missing", () => {
    const rows = svc.buildMonthlySystemCorrectiveActions({
      input: {
        month_year: "2026-06",
        haccp_system_review: [{ id: "s1", label: "Plan", result: "NO" }],
      },
      userId: "u1",
      reviewId: "rev-9",
      monthYear: "2026-06",
    });
    expect(rows[0].action_taken).toBe(
      "No action notes recorded at time of review — refer to monthly review record (2026-06)",
    );
  });

  it("returns [] when no problems", () => {
    expect(
      svc.buildMonthlySystemCorrectiveActions({
        input: {
          month_year: "2026-06",
          haccp_system_review: [{ id: "s1", label: "Plan", result: "YES" }],
        },
        userId: "u1",
        reviewId: "rev-9",
        monthYear: "2026-06",
      }),
    ).toEqual([]);
  });
});

describe("HaccpReviewsService — insert delegation", () => {
  it("insertWeeklyReview returns the seeded id and records the payload", async () => {
    const repo = createFakeHaccpReviewsRepository({ weeklyInsertId: "ww-1" });
    const svc = createHaccpReviewsService({ reviews: repo });
    const persist = svc.buildWeeklyPersist({
      input: { week_ending: "2026-06-21", assessments: [] },
      userId: "u1",
      today: TODAY,
    });
    const res = await svc.insertWeeklyReview(persist);
    expect(res).toEqual({ id: "ww-1" });
    expect(repo.insertedWeekly).toEqual([persist]);
  });

  it("insertMonthlyReview returns the seeded id and records the payload", async () => {
    const repo = createFakeHaccpReviewsRepository({ monthlyInsertId: "mm-1" });
    const svc = createHaccpReviewsService({ reviews: repo });
    const persist = svc.buildMonthlyPersist({
      input: {
        month_year: "2026-06",
        equipment_checks: {},
        facilities_checks: {},
        haccp_system_review: [],
      },
      userId: "u1",
      today: TODAY,
    });
    const res = await svc.insertMonthlyReview(persist);
    expect(res).toEqual({ id: "mm-1" });
    expect(repo.insertedMonthly).toEqual([persist]);
  });

  it("insertCorrectiveActions records the rows AND does not throw", async () => {
    const repo = createFakeHaccpReviewsRepository();
    const svc = createHaccpReviewsService({ reviews: repo });
    const rows = svc.buildWeeklyCorrectiveActions({
      input: {
        week_ending: "2026-06-21",
        assessments: [{ id: "i2", label: "Chiller", state: "problem" }],
      },
      userId: "u1",
      reviewId: "rev-123",
      weekEnding: "2026-06-21",
    });
    await expect(svc.insertCorrectiveActions(rows)).resolves.toBeUndefined();
    expect(repo.insertedCorrectiveActions).toEqual(rows);
  });
});
