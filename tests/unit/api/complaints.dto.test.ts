/**
 * tests/unit/api/complaints.dto.test.ts
 *
 * Key-for-key AND key-ORDER unit tests for the Complaints DTO translators
 * (lib/api/complaints/dto.ts). The complaint routes emit camelCase, so these
 * translators reshape camelCase domain → camelCase wire (dropping fields the
 * wire never carried, e.g. loggedById / receivedVia on the list shapes).
 *
 * Key order is load-bearing: NextResponse.json serialises object keys in
 * insertion order. CRITICAL: `category` (and `receivedVia` on the detail shape)
 * are emitted RAW here — the underscore→space prettify lives at the ROUTE edge
 * (plan §5, G1 / the PR1 design note in lib/domain/Complaint.ts). These tests
 * assert the RAW enum value survives the translator un-prettified.
 */
import { describe, it, expect } from "vitest";
import type {
  Complaint,
  ComplaintDetail,
  ComplaintNote,
} from "@/lib/domain";
import {
  toComplaintListItemWireDto,
  toOpenComplaintWireDto,
  toNoteWireDto,
  toComplaintDetailWireDto,
} from "@/lib/api/complaints/dto";

const note: ComplaintNote = {
  id: "note-1",
  complaintId: "comp-1",
  body: "chased the supplier",
  authorName: "Alice",
  createdAt: "2026-06-21T09:30:00.000Z",
};

const complaint: Complaint = {
  id: "comp-1",
  createdAt: "2026-06-21T09:00:00.000Z",
  category: "missing_item",
  description: "two boxes short",
  receivedVia: "in_person",
  status: "resolved",
  resolutionNote: "credited the customer",
  resolvedAt: "2026-06-21T11:00:00.000Z",
  customerName: "Acme Ltd",
  loggedByName: "Alice",
  loggedById: "user-1",
  resolvedByName: "Bob",
  notes: [note],
};

const detail: ComplaintDetail = {
  ...complaint,
  customerId: "cust-1",
  customerName: "Acme Ltd",
};

describe("toComplaintListItemWireDto (screen2/all)", () => {
  it("reshape + key order; category RAW (route prettifies); notes nested", () => {
    const dto = toComplaintListItemWireDto(complaint);
    expect(dto).toEqual({
      id: "comp-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      category: "missing_item", // RAW — not prettified here
      description: "two boxes short",
      status: "resolved",
      resolutionNote: "credited the customer",
      resolvedAt: "2026-06-21T11:00:00.000Z",
      customer: "Acme Ltd",
      loggedBy: "Alice",
      resolvedBy: "Bob",
      notes: [
        {
          id: "note-1",
          body: "chased the supplier",
          author: "Alice",
          createdAt: "2026-06-21T09:30:00.000Z",
        },
      ],
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "createdAt",
      "category",
      "description",
      "status",
      "resolutionNote",
      "resolvedAt",
      "customer",
      "loggedBy",
      "resolvedBy",
      "notes",
    ]);
    expect(Object.keys(dto.notes[0])).toEqual([
      "id",
      "body",
      "author",
      "createdAt",
    ]);
    // the wire never carried these — confirm dropped
    const rec = dto as unknown as Record<string, unknown>;
    expect("receivedVia" in rec).toBe(false);
    expect("loggedById" in rec).toBe(false);
  });
});

describe("toOpenComplaintWireDto (screen2/open)", () => {
  it("reshape + key order; category RAW (route prettifies)", () => {
    const dto = toOpenComplaintWireDto(complaint);
    expect(dto).toEqual({
      id: "comp-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      category: "missing_item", // RAW
      description: "two boxes short",
      customer: "Acme Ltd",
      loggedBy: "Alice",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "createdAt",
      "category",
      "description",
      "customer",
      "loggedBy",
    ]);
  });
});

describe("toNoteWireDto", () => {
  it("maps authorName→author + key order (id, body, author, createdAt)", () => {
    const dto = toNoteWireDto(note);
    expect(dto).toEqual({
      id: "note-1",
      body: "chased the supplier",
      author: "Alice",
      createdAt: "2026-06-21T09:30:00.000Z",
    });
    expect(Object.keys(dto)).toEqual(["id", "body", "author", "createdAt"]);
  });
});

describe("toComplaintDetailWireDto (detail/complaint)", () => {
  it("reshape + key order; BOTH category and receivedVia RAW (route prettifies both)", () => {
    const dto = toComplaintDetailWireDto(detail);
    expect(dto).toEqual({
      id: "comp-1",
      createdAt: "2026-06-21T09:00:00.000Z",
      category: "missing_item", // RAW
      description: "two boxes short",
      receivedVia: "in_person", // RAW
      status: "resolved",
      resolutionNote: "credited the customer",
      resolvedAt: "2026-06-21T11:00:00.000Z",
      customer: "Acme Ltd",
      loggedBy: "Alice",
      resolvedBy: "Bob",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "createdAt",
      "category",
      "description",
      "receivedVia",
      "status",
      "resolutionNote",
      "resolvedAt",
      "customer",
      "loggedBy",
      "resolvedBy",
    ]);
  });
});
