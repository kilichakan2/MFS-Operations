/**
 * tests/unit/services/HaccpHandbookService.test.ts
 *
 * F-19 PR9a — the Cluster F "handbook" service against the Fake repo.
 *
 * Pins:
 *   - `getHandbook` with `section` → { section, doc:null, entries } (key order),
 *     entries mirror the seeded rows; with `doc` → { section:null, doc, entries };
 *     with neither → the 400-equivalent the route returns (validation modelled).
 *   - `search`: q<2 chars (after trim) → { results:[] } with NO repo call; valid
 *     q → { results, query } mirroring seeded RPC rows.
 *   - `getDocuments`: a BARE ARRAY (NOT wrapped) — R-F-B1 pin.
 */
import { describe, it, expect } from "vitest";
import { createHaccpHandbookService } from "@/lib/services";
import { createFakeHaccpHandbookRepository } from "@/lib/adapters/fake";
import type { SopContentEntry, HaccpDocument } from "@/lib/domain";

function entry(overrides: Partial<SopContentEntry>): SopContentEntry {
  return {
    sop_ref: "SOP-001",
    title: "Cold storage",
    content_md: "# body",
    version: "1.0",
    source_doc: "HB-001",
    ...overrides,
  };
}

function doc(overrides: Partial<HaccpDocument>): HaccpDocument {
  return {
    doc_ref: "HB-001",
    title: "Handbook",
    version: "1.0",
    category: "A",
    register_type: "doc",
    description: "d",
    purpose: "p",
    linked_docs: [],
    status: "active",
    updated_at: "2026-06-01T00:00:00.000Z",
    review_due: "2027-06-01",
    owner: "Hakan",
    ...overrides,
  };
}

describe("HaccpHandbookService — getHandbook", () => {
  it("section set → { section, doc:null, entries } in that key order", async () => {
    const entries = [entry({ sop_ref: "SOP-001" })];
    const repo = createFakeHaccpHandbookRepository({ sopContent: entries });
    const svc = createHaccpHandbookService({ handbook: repo });

    const res = await svc.getHandbook({ section: "cold_storage", doc: null });
    expect(Object.keys(res)).toEqual(["section", "doc", "entries"]);
    expect(res).toEqual({ section: "cold_storage", doc: null, entries });
  });

  it("doc set → { section:null, doc, entries }", async () => {
    const entries = [entry({ sop_ref: "SOP-002" })];
    const repo = createFakeHaccpHandbookRepository({ sopContent: entries });
    const svc = createHaccpHandbookService({ handbook: repo });

    const res = await svc.getHandbook({ section: null, doc: "HB-001" });
    expect(res).toEqual({ section: null, doc: "HB-001", entries });
  });

  it("neither section nor doc → the 400-equivalent reject (no repo call)", async () => {
    const repo = createFakeHaccpHandbookRepository({});
    const svc = createHaccpHandbookService({ handbook: repo });

    const res = await svc.getHandbook({ section: null, doc: null });
    expect(res).toEqual({
      ok: false,
      status: 400,
      message: "Missing section or doc parameter",
    });
  });
});

describe("HaccpHandbookService — search", () => {
  it("q under 2 chars (after trim) → { results: [] } with no repo call", async () => {
    let called = false;
    const repo = createFakeHaccpHandbookRepository({});
    const wrapped = {
      ...repo,
      searchSop: async (q: string) => {
        called = true;
        return repo.searchSop(q);
      },
    };
    const svc = createHaccpHandbookService({ handbook: wrapped });

    const res = await svc.search(" a ");
    expect(res).toEqual({ results: [] });
    expect(called).toBe(false);
  });

  it("valid q → { results, query } mirroring seeded RPC rows (query is trimmed)", async () => {
    const results = [{ sop_ref: "SOP-001", rank: 0.9 }];
    const repo = createFakeHaccpHandbookRepository({ searchResults: results });
    const svc = createHaccpHandbookService({ handbook: repo });

    const res = await svc.search("  steriliser  ");
    expect(Object.keys(res)).toEqual(["results", "query"]);
    expect(res).toEqual({ results, query: "steriliser" });
  });
});

describe("HaccpHandbookService — getDocuments", () => {
  it("returns a BARE ARRAY (not wrapped) mirroring the seeded register (R-F-B1)", async () => {
    const docs = [doc({ doc_ref: "HB-001" }), doc({ doc_ref: "HB-002" })];
    const repo = createFakeHaccpHandbookRepository({ documents: docs });
    const svc = createHaccpHandbookService({ handbook: repo });

    const res = await svc.getDocuments();
    expect(Array.isArray(res)).toBe(true);
    expect(res).toEqual(docs);
  });

  it("empty register → []", async () => {
    const repo = createFakeHaccpHandbookRepository({});
    const svc = createHaccpHandbookService({ handbook: repo });
    expect(await svc.getDocuments()).toEqual([]);
  });
});
