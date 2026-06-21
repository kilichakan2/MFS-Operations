/**
 * tests/unit/services/ComplaintsService.test.ts
 *
 * F-17 PR1 — unit tests for the Complaints business rules, run against the
 * Fake adapter. Introduce-only extraction: the whole value is that the lifted
 * logic is BYTE-IDENTICAL to the complaint routes, so the weight is here
 * (every-branch validation with the routes' EXACT message strings + the
 * resolution-check / duplicate behaviour).
 */
import { describe, it, expect } from "vitest";
import { createComplaintsService } from "@/lib/services";
import { createFakeComplaintsRepository } from "@/lib/adapters/fake";
import type {
  CreateComplaintInput,
  ResolveComplaintInput,
  CreateNoteInput,
} from "@/lib/domain";

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

function makeService(
  seed?: Parameters<typeof createFakeComplaintsRepository>[0],
) {
  const complaints = createFakeComplaintsRepository(seed);
  const service = createComplaintsService({ complaints });
  return { service, complaints };
}

function createInput(
  overrides: Partial<CreateComplaintInput> = {},
): CreateComplaintInput {
  return {
    customerId: "c1",
    category: "quality",
    description: "Something went wrong",
    receivedVia: "phone",
    status: "open",
    resolutionNote: null,
    loggedBy: "u1",
    ...overrides,
  };
}

function resolveInput(
  overrides: Partial<ResolveComplaintInput> = {},
): ResolveComplaintInput {
  return {
    complaintId: "00000000-0000-0000-0000-000000000001",
    resolutionNote: "Sorted it out",
    resolvedBy: "u1",
    ...overrides,
  };
}

function noteInput(overrides: Partial<CreateNoteInput> = {}): CreateNoteInput {
  return {
    complaintId: "00000000-0000-0000-0000-000000000001",
    body: "Following up",
    userId: "u1",
    ...overrides,
  };
}

// ── validateCreate (screen2/sync cascade) ──────────────────────

describe("ComplaintsService.validateCreate", () => {
  const { service } = makeService();

  it("accepts a valid open complaint", () => {
    expect(service.validateCreate(createInput())).toEqual({ ok: true });
  });

  it("rejects missing customer_id", () => {
    expect(service.validateCreate(createInput({ customerId: "" }))).toEqual({
      ok: false,
      status: 400,
      message: "Missing: customer_id",
    });
  });

  it("rejects missing category", () => {
    expect(
      service.validateCreate(
        createInput({ category: "" as CreateComplaintInput["category"] }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: category" });
  });

  it("rejects description shorter than 5 chars (trimmed)", () => {
    expect(
      service.validateCreate(createInput({ description: "  ab  " })),
    ).toEqual({ ok: false, status: 400, message: "Missing: description" });
  });

  it("rejects missing received_via", () => {
    expect(
      service.validateCreate(
        createInput({
          receivedVia: "" as CreateComplaintInput["receivedVia"],
        }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: received_via" });
  });

  it("rejects missing status", () => {
    expect(
      service.validateCreate(
        createInput({ status: "" as CreateComplaintInput["status"] }),
      ),
    ).toEqual({ ok: false, status: 400, message: "Missing: status" });
  });

  it("rejects resolved status with no resolution_note", () => {
    expect(
      service.validateCreate(
        createInput({ status: "resolved", resolutionNote: "   " }),
      ),
    ).toEqual({
      ok: false,
      status: 400,
      message: "Missing: resolution_note",
    });
  });

  it("accepts resolved status WITH a resolution_note", () => {
    expect(
      service.validateCreate(
        createInput({ status: "resolved", resolutionNote: "Fixed" }),
      ),
    ).toEqual({ ok: true });
  });

  it("lists every missing field in cascade order", () => {
    expect(
      service.validateCreate({
        customerId: "",
        category: "" as CreateComplaintInput["category"],
        description: "x",
        receivedVia: "" as CreateComplaintInput["receivedVia"],
        status: "resolved",
        resolutionNote: null,
        loggedBy: "u1",
      }),
    ).toEqual({
      ok: false,
      status: 400,
      message:
        "Missing: customer_id, category, description, received_via, resolution_note",
    });
  });
});

// ── validateResolve (screen2/resolve) ──────────────────────────

describe("ComplaintsService.validateResolve", () => {
  const { service } = makeService();

  it("accepts a valid resolve request", () => {
    expect(service.validateResolve(resolveInput())).toEqual({ ok: true });
  });

  it("rejects blank complaint_id", () => {
    expect(
      service.validateResolve(resolveInput({ complaintId: "   " })),
    ).toEqual({ ok: false, status: 400, message: "complaint_id required" });
  });

  it("rejects blank resolution_note", () => {
    expect(
      service.validateResolve(resolveInput({ resolutionNote: "   " })),
    ).toEqual({ ok: false, status: 400, message: "resolution_note required" });
  });
});

// ── validateNote (screen2/note) ────────────────────────────────

describe("ComplaintsService.validateNote", () => {
  const { service } = makeService();

  it("accepts a valid note", () => {
    expect(service.validateNote(noteInput())).toEqual({ ok: true });
  });

  it("rejects blank complaint_id", () => {
    expect(service.validateNote(noteInput({ complaintId: "  " }))).toEqual({
      ok: false,
      status: 400,
      message: "complaint_id required",
    });
  });

  it("rejects blank body", () => {
    expect(service.validateNote(noteInput({ body: "   " }))).toEqual({
      ok: false,
      status: 400,
      message: "body required",
    });
  });
});

// ── createComplaint ────────────────────────────────────────────

describe("ComplaintsService.createComplaint", () => {
  it("persists an open complaint with all resolution fields null", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(createInput());
    expect(created.duplicate).toBe(false);
    expect(created.customerName).toBe("Acme Ltd");

    const detail = await service.findDetailById(created.id);
    expect(detail?.status).toBe("open");
    expect(detail?.resolutionNote).toBeNull();
    expect(detail?.resolvedAt).toBeNull();
    expect(detail?.resolvedByName).toBeNull();
  });

  it("persists a resolved complaint with all three resolution fields set", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(
      createInput({ status: "resolved", resolutionNote: "Handled" }),
    );
    const detail = await service.findDetailById(created.id);
    expect(detail?.status).toBe("resolved");
    expect(detail?.resolutionNote).toBe("Handled");
    expect(detail?.resolvedAt).not.toBeNull();
    expect(detail?.resolvedByName).toBe("Hakan");
  });

  it("returns the resolved customer name (Decision 1)", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(
      createInput({ customerId: "c1" }),
    );
    expect(created.customerName).toBe("Acme Ltd");
  });

  it("returns 'Unknown' for an unseeded customer", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(
      createInput({ customerId: "ghost" }),
    );
    expect(created.customerName).toBe("Unknown");
  });

  it("reports duplicate:true on a replayed client-supplied id", async () => {
    const { service } = makeService(SEED);
    const id = "00000000-0000-0000-0000-0000000000aa";
    const first = await service.createComplaint(createInput({ id }));
    expect(first.duplicate).toBe(false);
    const second = await service.createComplaint(createInput({ id }));
    expect(second).toEqual({
      id,
      customerName: "Acme Ltd",
      duplicate: true,
    });
  });

  it("rejects a description shorter than 5 chars (CHECK parity)", async () => {
    const { service } = makeService(SEED);
    await expect(
      service.createComplaint(createInput({ description: "abc" })),
    ).rejects.toThrow(/complaints_description_check/);
  });

  it("rejects a resolved create with a missing resolution_note (CHECK parity)", async () => {
    const { service } = makeService(SEED);
    await expect(
      service.createComplaint(
        createInput({ status: "resolved", resolutionNote: "   " }),
      ),
    ).rejects.toThrow(/complaints_resolution_check/);
  });
});

// ── resolveOpen ────────────────────────────────────────────────

describe("ComplaintsService.resolveOpen", () => {
  it("resolves an open complaint and returns its id", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(createInput());
    const result = await service.resolveOpen(
      resolveInput({ complaintId: created.id }),
    );
    expect(result).toEqual({ id: created.id });

    const detail = await service.findDetailById(created.id);
    expect(detail?.status).toBe("resolved");
    expect(detail?.resolutionNote).toBe("Sorted it out");
  });

  it("returns null for an already-resolved complaint", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(
      createInput({ status: "resolved", resolutionNote: "Done" }),
    );
    const result = await service.resolveOpen(
      resolveInput({ complaintId: created.id }),
    );
    expect(result).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    const { service } = makeService(SEED);
    const result = await service.resolveOpen(
      resolveInput({ complaintId: "00000000-0000-0000-0000-deadbeef0000" }),
    );
    expect(result).toBeNull();
  });
});

// ── findEmailContext ───────────────────────────────────────────

describe("ComplaintsService.findEmailContext", () => {
  it("returns the context for a known complaint", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(createInput());
    const ctx = await service.findEmailContext(created.id);
    expect(ctx).toEqual({
      id: created.id,
      category: "quality",
      description: "Something went wrong",
      status: "open",
      customerName: "Acme Ltd",
    });
  });

  it("returns null on miss", async () => {
    const { service } = makeService(SEED);
    expect(await service.findEmailContext("nope")).toBeNull();
  });
});

// ── createNote ─────────────────────────────────────────────────

describe("ComplaintsService.createNote", () => {
  it("persists a note and returns {id, body, createdAt}", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(createInput());
    const note = await service.createNote(
      noteInput({ complaintId: created.id, body: "Looking into it" }),
    );
    expect(note.id).toBeTruthy();
    expect(note.body).toBe("Looking into it");
    expect(note.createdAt).toBeTruthy();
  });

  it("trims the body and resolves the author in the thread", async () => {
    const { service } = makeService(SEED);
    const created = await service.createComplaint(createInput());
    await service.createNote(
      noteInput({ complaintId: created.id, body: "  Padded note  ", userId: "u2" }),
    );
    const all = await service.listAllWithNotes();
    const row = all.find((c) => c.id === created.id);
    expect(row?.notes).toHaveLength(1);
    expect(row?.notes[0].body).toBe("Padded note");
    expect(row?.notes[0].authorName).toBe("Mert");
  });

  it("rejects a blank body (CHECK parity)", async () => {
    const { service } = makeService(SEED);
    await expect(
      service.createNote(noteInput({ body: "   " })),
    ).rejects.toThrow(/complaint_notes_body_check/);
  });
});

// ── reads: ordering, grouping, join fallbacks ──────────────────

describe("ComplaintsService reads", () => {
  it("listAllWithNotes is newest-first and groups notes per complaint", async () => {
    const { service } = makeService(SEED);
    const a = await service.createComplaint(
      createInput({ description: "First complaint" }),
    );
    const b = await service.createComplaint(
      createInput({ description: "Second complaint" }),
    );
    await service.createNote(noteInput({ complaintId: a.id, body: "note A" }));

    const all = await service.listAllWithNotes();
    expect(all.map((c) => c.id)).toEqual([b.id, a.id]); // newest first
    expect(all.find((c) => c.id === a.id)?.notes).toHaveLength(1);
    expect(all.find((c) => c.id === b.id)?.notes).toHaveLength(0);
  });

  it("listOpen excludes resolved complaints, newest first", async () => {
    const { service } = makeService(SEED);
    const open = await service.createComplaint(createInput());
    await service.createComplaint(
      createInput({ status: "resolved", resolutionNote: "Done" }),
    );
    const list = await service.listOpen();
    expect(list.map((c) => c.id)).toEqual([open.id]);
    expect(list[0].notes).toHaveLength(0);
  });

  it("falls back to 'Unknown' for an unseeded logger / customer", async () => {
    const { service } = makeService(); // no seed
    const created = await service.createComplaint(createInput());
    const detail = await service.findDetailById(created.id);
    expect(detail?.loggedByName).toBe("Unknown");
    expect(detail?.customerName).toBe("Unknown");
  });

  it("findDetailById returns null on miss", async () => {
    const { service } = makeService(SEED);
    expect(await service.findDetailById("ghost")).toBeNull();
  });
});
