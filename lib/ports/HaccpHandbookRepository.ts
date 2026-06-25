/**
 * lib/ports/HaccpHandbookRepository.ts
 *
 * The F-19 PR9a Cluster F "handbook" persistence port — the interface the app
 * owns over the HACCP SOP library (haccp_sop_content), its full-text search
 * (RPC haccp_search), and the document-control register (haccp_documents).
 * Pure TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * Boundary discipline (ADR-0002): the adapter runs the `.select()` / `.rpc()`
 * chains and maps snake_case rows → domain types at the return boundary. Reads
 * that the routes 500 on throw `ServiceError` inside the adapter; the service /
 * route maps to HTTP later in PR9b. The "which branch" (section vs doc) is a
 * business rule the SERVICE owns — the port just fetches both inputs.
 */

import type {
  SopContentEntry,
  SearchResult,
  HaccpDocument,
} from "@/lib/domain";

export interface HaccpHandbookRepository {
  /**
   * handbook route. Lists active SOP content for EITHER a `section` key OR a
   * `doc` source substring match. The adapter runs `.eq('active',true)`,
   * `.order('sop_ref')`, and the section-vs-doc branch on the two inputs;
   * exactly one of section/doc is non-null (the service guarantees it).
   */
  listSopContent(args: {
    section: string | null;
    doc: string | null;
  }): Promise<readonly SopContentEntry[]>;

  /** search route. RPC `haccp_search`. Returns ranked results domain-mapped. */
  searchSop(query: string): Promise<readonly SearchResult[]>;

  /** documents route. Full document-control register, ordered by (category, doc_ref). */
  listDocuments(): Promise<readonly HaccpDocument[]>;
}
