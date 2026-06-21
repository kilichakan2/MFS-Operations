/**
 * tests/unit/api/compliments.dto.test.ts
 *
 * Key-for-key AND key-ORDER unit tests for the Compliments DTO translators
 * (lib/api/compliments/dto.ts). The compliments wire is snake_case
 * (posted_by_id, posted_by_name, …) while the domain is camelCase — these
 * translators are the only place that mapping happens, so a misnamed or
 * re-ordered key here changes the wire bytes the front-end reads.
 *
 * Key order is load-bearing: NextResponse.json serialises object keys in
 * insertion order. Every shape is asserted with a POPULATED domain object so a
 * dropped or misnamed key surfaces (the F-15 PR2 T1/T2 lesson).
 *
 * Defaults (posted_by_name 'Unknown', recipient_name null) are baked into the
 * domain by the adapter — the translator is a straight field copy. We assert a
 * domain object that already carries those defaults flows through unchanged
 * (the plan §3 / R4 verification).
 */
import { describe, it, expect } from "vitest";
import type { Compliment, ComplimentRecipient } from "@/lib/domain";
import {
  toComplimentWireDto,
  toRecipientWireDto,
} from "@/lib/api/compliments/dto";

const compliment: Compliment = {
  id: "comp-1",
  body: "Great work on the delivery",
  createdAt: "2026-06-21T09:00:00.000Z",
  postedById: "user-1",
  postedByName: "Alice",
  recipientId: "user-2",
  recipientName: "Bob",
};

describe("toComplimentWireDto", () => {
  it("maps camelCase → snake_case + key order (id, body, created_at, posted_by_id, posted_by_name, recipient_id, recipient_name)", () => {
    const dto = toComplimentWireDto(compliment);
    expect(dto).toEqual({
      id: "comp-1",
      body: "Great work on the delivery",
      created_at: "2026-06-21T09:00:00.000Z",
      posted_by_id: "user-1",
      posted_by_name: "Alice",
      recipient_id: "user-2",
      recipient_name: "Bob",
    });
    expect(Object.keys(dto)).toEqual([
      "id",
      "body",
      "created_at",
      "posted_by_id",
      "posted_by_name",
      "recipient_id",
      "recipient_name",
    ]);
  });

  it("passes through the adapter-baked defaults (posted_by_name 'Unknown', recipient_id null, recipient_name null) verbatim — no re-defaulting", () => {
    const orphan: Compliment = {
      id: "comp-2",
      body: "thanks",
      createdAt: "2026-06-21T10:00:00.000Z",
      postedById: null,
      postedByName: "Unknown",
      recipientId: null,
      recipientName: null,
    };
    const dto = toComplimentWireDto(orphan);
    expect(dto).toEqual({
      id: "comp-2",
      body: "thanks",
      created_at: "2026-06-21T10:00:00.000Z",
      posted_by_id: null,
      posted_by_name: "Unknown",
      recipient_id: null,
      recipient_name: null,
    });
  });
});

describe("toRecipientWireDto", () => {
  it("straight pass-through with key order (id, name, role)", () => {
    const r: ComplimentRecipient = { id: "user-3", name: "Carol", role: "office" };
    const dto = toRecipientWireDto(r);
    expect(dto).toEqual({ id: "user-3", name: "Carol", role: "office" });
    expect(Object.keys(dto)).toEqual(["id", "name", "role"]);
  });
});
