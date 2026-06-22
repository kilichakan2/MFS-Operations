/**
 * tests/unit/api/visit-notes.route.test.ts
 *
 * F-18 PR2 (W1) — pins the one deliberate behaviour change on
 * PATCH /api/screen3/visit/notes: editing a NON-EXISTENT note now returns 404
 * (it was a latent 500 before — the old route used Supabase `.single()`, which
 * THROWS on 0 rows, so the `!data` 404 branch was unreachable).
 *
 * The route invokes visitsService.updateNote, which (via the adapter's
 * `.maybeSingle()`) returns null on a no-match. The route maps null → 404. This
 * test calls the handler DIRECTLY with the wiring singleton mocked, so it never
 * touches the DB. A positive 200 case proves the path isn't always-404.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Stand in for the wired visitsService — never hits the DB.
const updateNote = vi.fn();
const validateUpdateNote = vi.fn((..._args: unknown[]) => ({ ok: true }) as const);

vi.mock("@/lib/wiring/visits", () => ({
  visitsService: {
    updateNote: (...args: unknown[]) => updateNote(...args),
    validateUpdateNote: (...args: unknown[]) => validateUpdateNote(...args),
  },
}));

import { PATCH } from "@/app/api/screen3/visit/notes/route";

function makeReq(body: unknown, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/screen3/visit/notes", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/screen3/visit/notes — W1 (no-match → 404, not 500)", () => {
  it("returns 404 when the note does not exist / is not owned", async () => {
    updateNote.mockResolvedValueOnce(null);
    const res = await PATCH(
      makeReq(
        { id: "00000000-0000-0000-0000-000000000000", body: "edit" },
        { "x-mfs-user-id": "user-1", "x-mfs-user-role": "sales" },
      ),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Note not found or not authorised",
    });
    expect(updateNote).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with the trimmed {id, body, updated_at} echo on a match", async () => {
    updateNote.mockResolvedValueOnce({
      id: "note-1",
      visitId: "",
      body: "edited body",
      authorId: null,
      authorName: "Unknown",
      createdAt: "",
      updatedAt: "2026-06-21T10:00:00.000Z",
    });
    const res = await PATCH(
      makeReq(
        { id: "note-1", body: "edited body" },
        { "x-mfs-user-id": "user-1", "x-mfs-user-role": "admin" },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      note: {
        id: "note-1",
        body: "edited body",
        updated_at: "2026-06-21T10:00:00.000Z",
      },
    });
  });
});
