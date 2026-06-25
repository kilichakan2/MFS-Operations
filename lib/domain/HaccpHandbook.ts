/**
 * lib/domain/HaccpHandbook.ts
 *
 * Domain types for the F-19 PR9a Cluster F "handbook" hexagon — the HACCP SOP
 * handbook reader (haccp_sop_content), its full-text search (RPC haccp_search
 * over the same content), and the document-control register (haccp_documents).
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * Boundary discipline (ADR-0002): the row types carry the RAW columns each route
 * `.select()`s today (snake_case) so the wire output stays byte-identical after
 * the PR9b re-point. The `…Response` types pin the EXACT route response objects.
 *
 * ⚠ R-F-B1 — the `documents` route returns a BARE ARRAY (`data ?? []`), every
 * other surface returns a wrapped object. So there is NO `DocumentsResponse`
 * wrapper type: the service returns `readonly HaccpDocument[]` directly.
 */

// ─── 1. handbook (haccp_sop_content) ─────────────────────────────────────────

/**
 * GET /api/haccp/handbook entry — verbatim `.select` columns
 * (handbook/route.ts:30): 'sop_ref, title, content_md, version, source_doc'.
 */
export interface SopContentEntry {
  readonly sop_ref: string;
  readonly title: string;
  readonly content_md: string;
  readonly version: string;
  readonly source_doc: string;
}

/**
 * The EXACT GET /api/haccp/handbook response shape (handbook/route.ts:48).
 * Key order: section, doc, entries.
 */
export interface HandbookResponse {
  readonly section: string | null;
  readonly doc: string | null;
  readonly entries: readonly SopContentEntry[];
}

// ─── 2. search (RPC haccp_search) ────────────────────────────────────────────

/**
 * A ranked search result row from RPC `haccp_search` (search/route.ts:26). The
 * RPC defines the column set; the route returns it as-is, so the domain keeps it
 * an opaque record — no projection happens at the route edge.
 */
export type SearchResult = Record<string, unknown>;

/**
 * The EXACT GET /api/haccp/search response shape (search/route.ts:33).
 * Key order: results, query.
 */
export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly query: string;
}

// ─── 3. documents (haccp_documents) ──────────────────────────────────────────

/**
 * GET /api/haccp/documents register row — verbatim `.select` columns
 * (documents/route.ts:21): 'doc_ref, title, version, category, register_type,
 * description, purpose, linked_docs, status, updated_at, review_due, owner'.
 */
export interface HaccpDocument {
  readonly doc_ref: string;
  readonly title: string;
  readonly version: string;
  readonly category: string;
  readonly register_type: string;
  readonly description: string;
  readonly purpose: string;
  readonly linked_docs: unknown;
  readonly status: string;
  readonly updated_at: string;
  readonly review_due: string;
  readonly owner: string;
}
