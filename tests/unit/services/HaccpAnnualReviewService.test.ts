/**
 * tests/unit/services/HaccpAnnualReviewService.test.ts
 *
 * F-19 PR5 — the Cluster D "annual review" service against the Fake repo.
 *
 * Pins:
 *   - `getReviews` returns { reviews } from seed;
 *   - `validateCreate` — 'Review year label is required' then the period string;
 *   - `buildCreatePersist` — blank checklist/action_plan via the imported
 *     builders, locked:false, created_by, updated_at = injected now;
 *   - `createDraft` — happy path returns createdRow; conflictOnCreate →
 *     ConflictError with the EXACT message;
 *   - `validatePatch` — 'Review ID required'; per-section 'items must be an
 *     array'; 'invalid status "x"'; sign-off missing-field; canSignOff-incomplete;
 *   - `buildSignOffPersist` — locked:true, signer/approver, injected now,
 *     checklist falls back to current.checklist when input omits it;
 *   - `buildUpdatePersist` — always updated_at; conditional checklist/action_plan;
 *   - `findCurrent` returns seeded current or null.
 *
 * Determinism: a FIXED now is injected; the service never calls new Date().
 */
import { describe, it, expect } from "vitest";
import { createHaccpAnnualReviewService } from "@/lib/services";
import { createFakeHaccpAnnualReviewRepository } from "@/lib/adapters/fake";
import {
  buildInitialChecklist,
  buildInitialActionPlan,
  type Checklist,
} from "@/lib/annualReview/sections";
import { ConflictError } from "@/lib/errors";
import type {
  AnnualReviewRow,
  AnnualReviewCurrent,
} from "@/lib/domain";

const NOW = new Date("2026-06-23T10:00:00.000Z");
const DRAFT_MSG =
  "A draft review already exists. Complete or delete it before starting a new one.";

/** A fully-complete checklist (every item status set) — passes canSignOff. */
function completeChecklist(): Checklist {
  const cl = buildInitialChecklist();
  for (const key of Object.keys(cl)) {
    cl[key] = {
      ...cl[key],
      items: cl[key].items.map((it) => ({ ...it, status: "ok" as const })),
    };
  }
  return cl;
}

function annualRow(overrides: Partial<AnnualReviewRow>): AnnualReviewRow {
  return {
    id: "ar1",
    review_year: "2026",
    review_period_from: "2025-01-01",
    review_period_to: "2025-12-31",
    checklist: buildInitialChecklist(),
    action_plan: buildInitialActionPlan(),
    locked: false,
    signed_off_at: null,
    approved_at: null,
    updated_at: "2026-06-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    signer: null,
    approver: null,
    creator: { name: "Ada" },
    ...overrides,
  };
}

describe("HaccpAnnualReviewService — getReviews", () => {
  it("returns { reviews } from seed", async () => {
    const reviews = [annualRow({ id: "ar1" }), annualRow({ id: "ar2" })];
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository({ reviews }),
    });
    const res = await svc.getReviews();
    expect(res).toEqual({ reviews });
  });

  it("returns { reviews: [] } when nothing seeded", async () => {
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository(),
    });
    expect(await svc.getReviews()).toEqual({ reviews: [] });
  });
});

describe("HaccpAnnualReviewService — validateCreate", () => {
  const svc = createHaccpAnnualReviewService({
    annualReview: createFakeHaccpAnnualReviewRepository(),
  });

  it("Review year label is required (blank)", () => {
    expect(
      svc.validateCreate({
        review_year: "   ",
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Review year label is required",
    });
  });

  it("Invalid review period (from after to)", () => {
    expect(
      svc.validateCreate({
        review_year: "2026",
        review_period_from: "2025-12-31",
        review_period_to: "2025-01-01",
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message:
        "Invalid review period — from must be before to, and to cannot be in the future",
    });
  });

  it("passes for a valid past period", () => {
    expect(
      svc.validateCreate({
        review_year: "2026",
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
      }),
    ).toEqual({ ok: true });
  });
});

describe("HaccpAnnualReviewService — buildCreatePersist", () => {
  it("blank checklist/action_plan, locked:false, created_by, updated_at = injected now", () => {
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository(),
    });
    const persist = svc.buildCreatePersist({
      input: {
        review_year: "  2026  ",
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
      },
      userId: "u1",
      now: NOW,
    });
    expect(persist).toEqual({
      review_year: "2026",
      review_period_from: "2025-01-01",
      review_period_to: "2025-12-31",
      checklist: buildInitialChecklist(),
      action_plan: buildInitialActionPlan(),
      locked: false,
      created_by: "u1",
      updated_at: NOW.toISOString(),
    });
  });
});

describe("HaccpAnnualReviewService — createDraft", () => {
  it("happy path returns the seeded createdRow", async () => {
    const createdRow = annualRow({ id: "new-1" });
    const repo = createFakeHaccpAnnualReviewRepository({ createdRow });
    const svc = createHaccpAnnualReviewService({ annualReview: repo });
    const persist = svc.buildCreatePersist({
      input: {
        review_year: "2026",
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
      },
      userId: "u1",
      now: NOW,
    });
    const res = await svc.createDraft(persist);
    expect(res).toEqual(createdRow);
    expect(repo.createdPayloads).toEqual([persist]);
  });

  it("conflictOnCreate → ConflictError with the EXACT message", async () => {
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository({
        conflictOnCreate: true,
      }),
    });
    const persist = svc.buildCreatePersist({
      input: {
        review_year: "2026",
        review_period_from: "2025-01-01",
        review_period_to: "2025-12-31",
      },
      userId: "u1",
      now: NOW,
    });
    await expect(svc.createDraft(persist)).rejects.toBeInstanceOf(ConflictError);
    await expect(svc.createDraft(persist)).rejects.toThrow(DRAFT_MSG);
  });
});

describe("HaccpAnnualReviewService — validatePatch", () => {
  const svc = createHaccpAnnualReviewService({
    annualReview: createFakeHaccpAnnualReviewRepository(),
  });
  const incomplete = buildInitialChecklist();

  it("Review ID required", () => {
    expect(
      svc.validatePatch({
        input: { id: "" },
        currentChecklist: incomplete,
      }),
    ).toEqual({ ok: false, status: 400, message: "Review ID required" });
  });

  it("Section X: items must be an array", () => {
    const bad = {
      "3.1": { items: "nope" as unknown as never, section_notes: "" },
    } as unknown as Checklist;
    expect(
      svc.validatePatch({
        input: { id: "ar1", checklist: bad },
        currentChecklist: incomplete,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Section 3.1: items must be an array",
    });
  });

  it('invalid status "x" string', () => {
    const bad = {
      "3.1": {
        items: [{ label: "L", status: "weird" as never, notes: "" }],
        section_notes: "",
      },
    } as unknown as Checklist;
    expect(
      svc.validatePatch({
        input: { id: "ar1", checklist: bad },
        currentChecklist: incomplete,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message:
        'Section 3.1: invalid status "weird" — must be ok, na, action, or null',
    });
  });

  it("approved_by and approved_at required for sign-off", () => {
    expect(
      svc.validatePatch({
        input: {
          id: "ar1",
          sign_off: { approved_by: "", approved_at: "2026-06-23" },
        },
        currentChecklist: completeChecklist(),
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "approved_by and approved_at required for sign-off",
    });
  });

  it("Cannot sign off — not all checklist sections are complete", () => {
    expect(
      svc.validatePatch({
        input: {
          id: "ar1",
          sign_off: { approved_by: "Boss", approved_at: "2026-06-23" },
        },
        currentChecklist: incomplete, // not all sections complete
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Cannot sign off — not all checklist sections are complete",
    });
  });

  it("passes sign-off when complete (falls back to currentChecklist)", () => {
    expect(
      svc.validatePatch({
        input: {
          id: "ar1",
          sign_off: { approved_by: "Boss", approved_at: "2026-06-23" },
        },
        currentChecklist: completeChecklist(),
      }),
    ).toEqual({ ok: true });
  });

  it("passes a plain id-only patch", () => {
    expect(
      svc.validatePatch({ input: { id: "ar1" }, currentChecklist: incomplete }),
    ).toEqual({ ok: true });
  });
});

describe("HaccpAnnualReviewService — buildSignOffPersist", () => {
  const svc = createHaccpAnnualReviewService({
    annualReview: createFakeHaccpAnnualReviewRepository(),
  });

  it("locked:true, signer/approver, injected now; checklist from input", () => {
    const cl = completeChecklist();
    const current: AnnualReviewCurrent = {
      id: "ar1",
      locked: false,
      checklist: buildInitialChecklist(),
    };
    const persist = svc.buildSignOffPersist({
      input: {
        id: "ar1",
        checklist: cl,
        sign_off: { approved_by: "Boss", approved_at: "2026-06-22" },
      },
      current,
      userId: "u1",
      now: NOW,
    });
    expect(persist).toEqual({
      checklist: cl,
      action_plan: undefined,
      signed_off_by: "u1",
      signed_off_at: NOW.toISOString(),
      approved_by: "Boss",
      approved_at: "2026-06-22",
      locked: true,
      updated_at: NOW.toISOString(),
    });
  });

  it("checklist falls back to current.checklist when input omits it", () => {
    const current: AnnualReviewCurrent = {
      id: "ar1",
      locked: false,
      checklist: completeChecklist(),
    };
    const persist = svc.buildSignOffPersist({
      input: {
        id: "ar1",
        sign_off: { approved_by: "Boss", approved_at: "2026-06-22" },
      },
      current,
      userId: "u1",
      now: NOW,
    });
    expect(persist.checklist).toEqual(current.checklist);
  });
});

describe("HaccpAnnualReviewService — buildUpdatePersist", () => {
  const svc = createHaccpAnnualReviewService({
    annualReview: createFakeHaccpAnnualReviewRepository(),
  });

  it("always sets updated_at; includes checklist/action_plan only when truthy", () => {
    const cl = buildInitialChecklist();
    const ap = buildInitialActionPlan();
    expect(
      svc.buildUpdatePersist({
        input: { id: "ar1", checklist: cl, action_plan: ap },
        now: NOW,
      }),
    ).toEqual({ updated_at: NOW.toISOString(), checklist: cl, action_plan: ap });

    const onlyTimestamp = svc.buildUpdatePersist({
      input: { id: "ar1" },
      now: NOW,
    });
    expect(onlyTimestamp).toEqual({ updated_at: NOW.toISOString() });
    expect(Object.keys(onlyTimestamp)).toEqual(["updated_at"]);
  });
});

describe("HaccpAnnualReviewService — findCurrent + delegation", () => {
  it("findCurrent returns the seeded current", async () => {
    const current: AnnualReviewCurrent = {
      id: "ar1",
      locked: false,
      checklist: buildInitialChecklist(),
    };
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository({ current }),
    });
    expect(await svc.findCurrent("ar1")).toEqual(current);
  });

  it("findCurrent returns null on miss", async () => {
    const svc = createHaccpAnnualReviewService({
      annualReview: createFakeHaccpAnnualReviewRepository(),
    });
    expect(await svc.findCurrent("nope")).toBeNull();
  });

  it("signOff / update delegate and record payloads", async () => {
    const signedRow = annualRow({ id: "ar1", locked: true });
    const updatedRow = annualRow({ id: "ar1" });
    const repo = createFakeHaccpAnnualReviewRepository({
      signedRow,
      updatedRow,
    });
    const svc = createHaccpAnnualReviewService({ annualReview: repo });

    const signPayload = svc.buildSignOffPersist({
      input: {
        id: "ar1",
        checklist: completeChecklist(),
        sign_off: { approved_by: "Boss", approved_at: "2026-06-22" },
      },
      current: {
        id: "ar1",
        locked: false,
        checklist: completeChecklist(),
      },
      userId: "u1",
      now: NOW,
    });
    expect(await svc.signOff("ar1", signPayload)).toEqual(signedRow);
    expect(repo.signedPayloads).toEqual([{ id: "ar1", payload: signPayload }]);

    const updatePayload = svc.buildUpdatePersist({
      input: { id: "ar1", checklist: buildInitialChecklist() },
      now: NOW,
    });
    expect(await svc.update("ar1", updatePayload)).toEqual(updatedRow);
    expect(repo.updatedPayloads).toEqual([
      { id: "ar1", payload: updatePayload },
    ]);
  });
});
