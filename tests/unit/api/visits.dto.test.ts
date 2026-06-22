/**
 * tests/unit/api/visits.dto.test.ts
 *
 * Key-for-key AND key-ORDER unit tests for the Visits DTO translators
 * (lib/api/visits/dto.ts). The visit routes emit MIXED wire shapes: snake_case
 * on screen3/today + screen3/visit/notes, camelCase on detail/visit +
 * admin/visits. These translators reshape camelCase domain → each route's exact
 * wire shape.
 *
 * Key order is load-bearing: NextResponse.json serialises object keys in
 * insertion order. CRITICAL: `visit_type`/`visitType` and `outcome` are emitted
 * RAW here — the underscore→space prettify lives at the ROUTE edge (plan §3 /
 * the PR1 design note in lib/domain/Visit.ts). These tests assert the RAW enum
 * value survives the translator un-prettified.
 */
import { describe, it, expect } from "vitest";
import type { Visit, VisitDetail, VisitNote } from "@/lib/domain";
import {
  toTodayVisitWireDto,
  toVisitNoteWireDto,
  toNoteUpdateWireDto,
  toVisitDetailWireDto,
  toAdminVisitWireDto,
} from "@/lib/api/visits/dto";

// A fully-populated visit fixture (camelCase domain shape).
const visit: Visit = {
  id: "visit-1",
  createdAt: "2026-06-21T09:00:00.000Z",
  userId: "user-1",
  loggedById: "user-1",
  loggedByName: "Alice",
  customerId: "cust-1",
  customerName: "Acme Ltd",
  visitType: "new_pitch",
  outcome: "at_risk",
  pipelineStatus: "In Talks",
  commitmentMade: true,
  commitmentDetail: "trial order next week",
  notes: "went well",
  prospectName: "Prospect Co",
  prospectPostcode: "EC1A 1BB",
};

const note: VisitNote = {
  id: "note-1",
  visitId: "visit-1",
  body: "chased the rep",
  authorId: "user-2",
  authorName: "Bob",
  createdAt: "2026-06-21T09:30:00.000Z",
  updatedAt: "2026-06-21T10:00:00.000Z",
};

const detail: VisitDetail = {
  ...visit,
  customerId: "cust-1",
};

describe("toTodayVisitWireDto (screen3/today)", () => {
  it("reshape + 14-key order; visit_type/outcome survive RAW", () => {
    const dto = toTodayVisitWireDto(visit);
    expect(dto).toEqual({
      id: "visit-1",
      created_at: "2026-06-21T09:00:00.000Z",
      visit_type: "new_pitch", // RAW — route does NOT prettify here
      outcome: "at_risk", // RAW
      pipeline_status: "In Talks",
      commitment_made: true,
      commitment_detail: "trial order next week",
      notes: "went well",
      customer_id: "cust-1",
      customer_name: "Acme Ltd",
      prospect_name: "Prospect Co",
      prospect_postcode: "EC1A 1BB",
      logged_by_name: "Alice",
      logged_by_id: "user-1",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "created_at",
      "visit_type",
      "outcome",
      "pipeline_status",
      "commitment_made",
      "commitment_detail",
      "notes",
      "customer_id",
      "customer_name",
      "prospect_name",
      "prospect_postcode",
      "logged_by_name",
      "logged_by_id",
    ]);
  });
});

describe("toVisitNoteWireDto (screen3/visit/notes GET + POST echo)", () => {
  it("reshape + 7-key order; author_name copied straight (not re-defaulted)", () => {
    const dto = toVisitNoteWireDto(note);
    expect(dto).toEqual({
      id: "note-1",
      visit_id: "visit-1",
      body: "chased the rep",
      created_at: "2026-06-21T09:30:00.000Z",
      updated_at: "2026-06-21T10:00:00.000Z",
      author_id: "user-2",
      author_name: "Bob",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "visit_id",
      "body",
      "created_at",
      "updated_at",
      "author_id",
      "author_name",
    ]);
  });

  it("does NOT re-default author_name — copies the domain value verbatim", () => {
    // The adapter's toNote already defaults authorName to 'Unknown'; the dto must
    // not re-apply it. A non-Unknown name proves it's a straight copy.
    const dto = toVisitNoteWireDto({ ...note, authorName: "Carol" });
    expect(dto.author_name).toBe("Carol");
  });
});

describe("toNoteUpdateWireDto (screen3/visit/notes PATCH echo)", () => {
  it("trimmed 3-key shape {id, body, updated_at} + key order", () => {
    const dto = toNoteUpdateWireDto(note);
    expect(dto).toEqual({
      id: "note-1",
      body: "chased the rep",
      updated_at: "2026-06-21T10:00:00.000Z",
    });
    expect(Object.keys(dto)).toEqual(["id", "body", "updated_at"]);
  });
});

describe("toVisitDetailWireDto (detail/visit)", () => {
  it("reshape + 12-key order; visitType/outcome RAW; customer←customerName", () => {
    const dto = toVisitDetailWireDto(detail);
    expect(dto).toEqual({
      id: "visit-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      visitType: "new_pitch", // RAW — route prettifies at edge
      outcome: "at_risk", // RAW
      commitmentMade: true,
      commitmentDetail: "trial order next week",
      notes: "went well",
      customer: "Acme Ltd",
      prospectName: "Prospect Co",
      prospectPostcode: "EC1A 1BB",
      loggedBy: "Alice",
      pipelineStatus: "In Talks",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "createdAt",
      "visitType",
      "outcome",
      "commitmentMade",
      "commitmentDetail",
      "notes",
      "customer",
      "prospectName",
      "prospectPostcode",
      "loggedBy",
      "pipelineStatus",
    ]);
  });

  it("loggedBy falls back to 'Unknown' when loggedByName is null", () => {
    const dto = toVisitDetailWireDto({ ...detail, loggedByName: null });
    expect(dto.loggedBy).toBe("Unknown");
  });
});

describe("toAdminVisitWireDto (admin/visits)", () => {
  it("reshape + 8-key order; visitType/outcome RAW", () => {
    const dto = toAdminVisitWireDto(visit);
    expect(dto).toEqual({
      id: "visit-1",
      customer: "Acme Ltd",
      rep: "Alice",
      visitType: "new_pitch", // RAW
      outcome: "at_risk", // RAW
      notes: "went well",
      pipelineStatus: "In Talks",
      createdAt: "2026-06-21T09:00:00.000Z",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "customer",
      "rep",
      "visitType",
      "outcome",
      "notes",
      "pipelineStatus",
      "createdAt",
    ]);
  });

  it("customer fallback chain: customerName → prospectName → 'Unknown'", () => {
    // 1. customerName present → use it
    expect(toAdminVisitWireDto(visit).customer).toBe("Acme Ltd");
    // 2. no customerName, prospectName present → use prospectName
    expect(
      toAdminVisitWireDto({ ...visit, customerName: null }).customer,
    ).toBe("Prospect Co");
    // 3. neither → 'Unknown'
    expect(
      toAdminVisitWireDto({
        ...visit,
        customerName: null,
        prospectName: null,
      }).customer,
    ).toBe("Unknown");
  });

  it("rep falls back to 'Unknown'; notes/pipelineStatus null-coalesce", () => {
    const dto = toAdminVisitWireDto({
      ...visit,
      loggedByName: null,
      notes: null,
      pipelineStatus: "",
    });
    expect(dto.rep).toBe("Unknown");
    expect(dto.notes).toBeNull();
    expect(dto.pipelineStatus).toBeNull();
  });
});
