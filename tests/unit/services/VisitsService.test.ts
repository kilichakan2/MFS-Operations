/**
 * tests/unit/services/VisitsService.test.ts
 *
 * F-18 PR1 — unit tests for the Visits business rules, run against the Fake
 * adapter. Introduce-only extraction: the whole value is that the lifted logic
 * is BYTE-IDENTICAL to the visit routes, so the weight is here (every-branch
 * validation with the routes' EXACT message strings + the create/upsert,
 * owner-filter, and manager-bypass behaviour).
 */
import { describe, it, expect } from "vitest";
import { createVisitsService } from "@/lib/services";
import { createFakeVisitsRepository } from "@/lib/adapters/fake";
import { VALID_PIPELINE_STATUSES } from "@/lib/domain";
import type { CreateVisitInput } from "@/lib/domain";

// ── helpers ────────────────────────────────────────────────────

const SEED = {
  people: {
    u1: { id: "u1", name: "Hakan" },
    u2: { id: "u2", name: "Mert" },
  },
  customers: {
    c1: { id: "c1", name: "Acme Ltd" },
  },
} as const;

function makeService(seed?: Parameters<typeof createFakeVisitsRepository>[0]) {
  const visits = createFakeVisitsRepository(seed);
  const service = createVisitsService({ visits });
  return { service, visits };
}

function createInput(
  overrides: Partial<CreateVisitInput> = {},
): CreateVisitInput {
  return {
    userId: "u1",
    customerId: "c1",
    prospectName: null,
    prospectPostcode: null,
    visitType: "routine",
    outcome: "positive",
    commitmentMade: false,
    commitmentDetail: null,
    notes: null,
    ...overrides,
  };
}

// ── validateCreate (screen3/sync cascade) ──────────────────────

describe("VisitsService.validateCreate", () => {
  const { service } = makeService();

  it("accepts a valid customer visit", () => {
    expect(service.validateCreate(createInput())).toEqual({ ok: true });
  });

  it("accepts a valid prospect visit", () => {
    expect(
      service.validateCreate(
        createInput({ customerId: null, prospectName: "New Cafe" }),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects when neither customer_id nor prospect_name present", () => {
    expect(
      service.validateCreate(createInput({ customerId: null, prospectName: null })),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Missing: customer_id or prospect_name required",
    });
  });

  it("rejects when BOTH customer_id and prospect_name present", () => {
    expect(
      service.validateCreate(
        createInput({ customerId: "c1", prospectName: "New Cafe" }),
      ),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Missing: only one of customer_id/prospect_name allowed",
    });
  });

  it("rejects missing visit_type", () => {
    expect(
      service.validateCreate(
        createInput({ visitType: "" as CreateVisitInput["visitType"] }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: visit_type" });
  });

  it("rejects missing outcome", () => {
    expect(
      service.validateCreate(
        createInput({ outcome: "" as CreateVisitInput["outcome"] }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: outcome" });
  });

  it("rejects commitment_made with no commitment_detail", () => {
    expect(
      service.validateCreate(
        createInput({ commitmentMade: true, commitmentDetail: null }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: commitment_detail" });
  });

  it("accepts commitment_made WITH a commitment_detail", () => {
    expect(
      service.validateCreate(
        createInput({ commitmentMade: true, commitmentDetail: "Sample drop" }),
      ),
    ).toEqual({ ok: true });
  });

  it("lists every missing field in cascade order", () => {
    expect(
      service.validateCreate({
        userId: "u1",
        customerId: null,
        prospectName: null,
        prospectPostcode: null,
        visitType: "" as CreateVisitInput["visitType"],
        outcome: "" as CreateVisitInput["outcome"],
        commitmentMade: true,
        commitmentDetail: null,
        notes: null,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message:
        "Missing: customer_id or prospect_name required, visit_type, outcome, commitment_detail",
    });
  });
});

// ── validatePipelineStatus (screen3/visit PATCH) ───────────────

describe("VisitsService.validatePipelineStatus", () => {
  const { service } = makeService();

  it("accepts a valid status", () => {
    expect(
      service.validatePipelineStatus({ id: "v1", status: "In Talks" }),
    ).toEqual({ ok: true });
  });

  it("rejects missing id", () => {
    expect(
      service.validatePipelineStatus({ id: "", status: "Won" }),
    ).toEqual({ ok: false, status: 400, message: "id required" });
  });

  it("rejects missing pipeline_status", () => {
    expect(service.validatePipelineStatus({ id: "v1", status: "" })).toEqual({
      ok: false,
      status: 400,
      message: "pipeline_status required",
    });
  });

  it("rejects an out-of-set status with the exact message", () => {
    expect(
      service.validatePipelineStatus({ id: "v1", status: "Bananas" }),
    ).toEqual({
      ok: false,
      status: 400,
      message: `Invalid status. Must be one of: ${VALID_PIPELINE_STATUSES.join(", ")}`,
    });
  });

  it("accepts every valid status in the canonical set", () => {
    for (const s of VALID_PIPELINE_STATUSES) {
      expect(service.validatePipelineStatus({ id: "v1", status: s })).toEqual({
        ok: true,
      });
    }
  });
});

// ── validateNote (screen3/visit/notes POST) ────────────────────

describe("VisitsService.validateNote", () => {
  const { service } = makeService();

  it("accepts a valid note", () => {
    expect(service.validateNote({ visitId: "v1", body: "Hi" })).toEqual({
      ok: true,
    });
  });

  it("rejects missing visit_id", () => {
    expect(service.validateNote({ visitId: "", body: "Hi" })).toEqual({
      ok: false,
      status: 400,
      message: "visit_id required",
    });
  });

  it("rejects blank body", () => {
    expect(service.validateNote({ visitId: "v1", body: "   " })).toEqual({
      ok: false,
      status: 400,
      message: "body required",
    });
  });
});

// ── validateUpdateNote (screen3/visit/notes PATCH) ─────────────

describe("VisitsService.validateUpdateNote", () => {
  const { service } = makeService();

  it("accepts a valid update", () => {
    expect(service.validateUpdateNote({ id: "n1", body: "Edited" })).toEqual({
      ok: true,
    });
  });

  it("rejects missing id", () => {
    expect(service.validateUpdateNote({ id: "", body: "Edited" })).toEqual({
      ok: false,
      status: 400,
      message: "id required",
    });
  });

  it("rejects blank body", () => {
    expect(service.validateUpdateNote({ id: "n1", body: "  " })).toEqual({
      ok: false,
      status: 400,
      message: "body required",
    });
  });
});

// ── createVisit + reads (passthrough delegation to the port) ───

describe("VisitsService.createVisit", () => {
  it("persists a visit and returns {id, duplicate:false}", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput());
    expect(created.duplicate).toBe(false);
    const detail = await service.findDetailById(created.id);
    expect(detail?.customerName).toBe("Acme Ltd");
    expect(detail?.pipelineStatus).toBe("Logged");
  });

  it("reports duplicate:true on a replayed client-supplied id (no upsert)", async () => {
    const { service } = makeService(SEED);
    const id = "00000000-0000-0000-0000-0000000000aa";
    const first = await service.createVisit(createInput({ id }));
    expect(first.duplicate).toBe(false);
    const second = await service.createVisit(createInput({ id }));
    expect(second).toEqual({ id, duplicate: true });
  });

  it("upsert:true merges a replayed id instead of reporting duplicate", async () => {
    const { service } = makeService(SEED);
    const id = "00000000-0000-0000-0000-0000000000bb";
    await service.createVisit(createInput({ id, outcome: "neutral" }));
    const merged = await service.createVisit(
      createInput({ id, upsert: true, outcome: "at_risk" }),
    );
    expect(merged.duplicate).toBe(false);
    const detail = await service.findDetailById(id);
    expect(detail?.outcome).toBe("at_risk");
  });

  it("forces commitment_detail null unless commitment_made", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(
      createInput({ commitmentMade: false, commitmentDetail: "ignored" }),
    );
    const detail = await service.findDetailById(created.id);
    expect(detail?.commitmentDetail).toBeNull();
  });
});

// ── listForCaller (manager vs sales) ───────────────────────────

describe("VisitsService.listForCaller", () => {
  it("manager sees all reps' visits, newest first", async () => {
    const { service } = makeService(SEED);
    const a = await service.createVisit(createInput({ userId: "u1" }));
    const b = await service.createVisit(
      createInput({ userId: "u2", customerId: "c1" }),
    );
    const list = await service.listForCaller({ userId: "u1", isManager: true });
    expect(list.map((v) => v.id)).toEqual([b.id, a.id]);
  });

  it("sales sees only their own visits", async () => {
    const { service } = makeService(SEED);
    const mine = await service.createVisit(createInput({ userId: "u1" }));
    await service.createVisit(createInput({ userId: "u2" }));
    const list = await service.listForCaller({ userId: "u1", isManager: false });
    expect(list.map((v) => v.id)).toEqual([mine.id]);
    expect(list[0].loggedByName).toBe("Hakan");
  });
});

// ── deleteOwnVisit (owner-only) ────────────────────────────────

describe("VisitsService.deleteOwnVisit", () => {
  it("deletes a visit owned by the caller", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    await service.deleteOwnVisit(created.id, "u1");
    expect(await service.findDetailById(created.id)).toBeNull();
  });

  it("does not delete a visit owned by someone else", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    await service.deleteOwnVisit(created.id, "u2");
    expect(await service.findDetailById(created.id)).not.toBeNull();
  });
});

// ── updatePipelineStatus (owner filter + 404) ──────────────────

describe("VisitsService.updatePipelineStatus", () => {
  it("sales updates their own visit", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    const result = await service.updatePipelineStatus({
      id: created.id,
      status: "Won",
      userId: "u1",
      isManager: false,
    });
    expect(result).toEqual({ id: created.id });
    const detail = await service.findDetailById(created.id);
    expect(detail?.pipelineStatus).toBe("Won");
  });

  it("returns null when sales targets someone else's visit", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    const result = await service.updatePipelineStatus({
      id: created.id,
      status: "Won",
      userId: "u2",
      isManager: false,
    });
    expect(result).toBeNull();
  });

  it("manager updates any visit", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    const result = await service.updatePipelineStatus({
      id: created.id,
      status: "Won",
      userId: "u2",
      isManager: true,
    });
    expect(result).toEqual({ id: created.id });
  });

  it("returns null for an unknown id", async () => {
    const { service } = makeService(SEED);
    const result = await service.updatePipelineStatus({
      id: "00000000-0000-0000-0000-deadbeef0000",
      status: "Won",
      userId: "u1",
      isManager: true,
    });
    expect(result).toBeNull();
  });
});

// ── notes: ownership, create, update, ordering ─────────────────

describe("VisitsService notes", () => {
  it("verifyVisitOwnership is true only for the owner", async () => {
    const { service } = makeService(SEED);
    const created = await service.createVisit(createInput({ userId: "u1" }));
    expect(await service.verifyVisitOwnership(created.id, "u1")).toBe(true);
    expect(await service.verifyVisitOwnership(created.id, "u2")).toBe(false);
    expect(await service.verifyVisitOwnership("ghost", "u1")).toBe(false);
  });

  it("createNote trims, resolves author, listNotes is oldest first", async () => {
    const { service } = makeService(SEED);
    const v = await service.createVisit(createInput({ userId: "u1" }));
    const first = await service.createNote({
      visitId: v.id,
      body: "  earlier  ",
      userId: "u1",
    });
    const second = await service.createNote({
      visitId: v.id,
      body: "later",
      userId: "u2",
    });
    const list = await service.listNotes(v.id);
    expect(list.map((n) => n.id)).toEqual([first.id, second.id]);
    expect(list[0].body).toBe("earlier");
    expect(list[0].authorName).toBe("Hakan");
    expect(list[1].authorName).toBe("Mert");
  });

  it("updateNote edits the author's own note and sets updatedAt", async () => {
    const { service } = makeService(SEED);
    const v = await service.createVisit(createInput({ userId: "u1" }));
    const note = await service.createNote({
      visitId: v.id,
      body: "original",
      userId: "u1",
    });
    const updated = await service.updateNote({
      id: note.id,
      body: "edited",
      userId: "u1",
      isManager: false,
    });
    expect(updated?.body).toBe("edited");
    expect(updated?.updatedAt).not.toBeNull();
  });

  it("updateNote returns null when sales targets another author's note (W1)", async () => {
    const { service } = makeService(SEED);
    const v = await service.createVisit(createInput({ userId: "u1" }));
    const note = await service.createNote({
      visitId: v.id,
      body: "original",
      userId: "u1",
    });
    const updated = await service.updateNote({
      id: note.id,
      body: "hijack",
      userId: "u2",
      isManager: false,
    });
    expect(updated).toBeNull();
  });

  it("updateNote (manager) edits any note", async () => {
    const { service } = makeService(SEED);
    const v = await service.createVisit(createInput({ userId: "u1" }));
    const note = await service.createNote({
      visitId: v.id,
      body: "original",
      userId: "u1",
    });
    const updated = await service.updateNote({
      id: note.id,
      body: "manager edit",
      userId: "u2",
      isManager: true,
    });
    expect(updated?.body).toBe("manager edit");
  });
});

// ── reads: detail, admin filters ───────────────────────────────

describe("VisitsService reads", () => {
  it("findDetailById returns null on miss", async () => {
    const { service } = makeService(SEED);
    expect(await service.findDetailById("ghost")).toBeNull();
  });

  it("listAllWithFilters honours range + rep/type/outcome", async () => {
    const { service } = makeService(SEED);
    const a = await service.createVisit(
      createInput({ userId: "u1", visitType: "routine", outcome: "positive" }),
    );
    await service.createVisit(
      createInput({ userId: "u2", visitType: "new_pitch", outcome: "lost" }),
    );
    const filtered = await service.listAllWithFilters({
      from: "2000-01-01T00:00:00.000Z",
      to: "2999-01-01T00:00:00.000Z",
      repId: "u1",
    });
    expect(filtered.map((v) => v.id)).toEqual([a.id]);
    expect(filtered[0].visitType).toBe("routine");
  });

  it("listAllWithFilters with no optional filters returns all in range, newest first", async () => {
    const { service } = makeService(SEED);
    const a = await service.createVisit(createInput({ userId: "u1" }));
    const b = await service.createVisit(createInput({ userId: "u2" }));
    const all = await service.listAllWithFilters({
      from: "2000-01-01T00:00:00.000Z",
      to: "2999-01-01T00:00:00.000Z",
    });
    expect(all.map((v) => v.id)).toEqual([b.id, a.id]);
  });
});
