/**
 * lib/adapters/supabase/HaccpHandbookRepository.ts
 *
 * Supabase implementation of `HaccpHandbookRepository`
 * (lib/ports/HaccpHandbookRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY file that imports the vendor SDK for
 * the Cluster F handbook surfaces (haccp_sop_content, RPC haccp_search,
 * haccp_documents).
 *
 * Boundary discipline (ADR-0002): every `.select(…)` column list, the `.rpc()`,
 * the `.eq('active',true)`/`.order(...)` chain, and the section-vs-doc branch are
 * copied VERBATIM from the three route files (handbook, search, documents) so the
 * PR9b re-point's wire output stays byte-identical.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpHandbookRepository(client)` factory.
 *   - `supabaseHaccpHandbookRepository` singleton — `supabaseService` (the
 *     server-only service-role key), exactly the access the routes have today.
 *
 * Error contract: reads return [] on miss; every DB failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  SopContentEntry,
  SearchResult,
  HaccpDocument,
} from "@/lib/domain";
import type { HaccpHandbookRepository } from "@/lib/ports";

// ─── verbatim select strings (the byte-identity anchor) ──────────────────────

const SOP_COLS = "sop_ref, title, content_md, version, source_doc";
const DOCUMENT_COLS =
  "doc_ref, title, version, category, register_type, description, purpose, linked_docs, status, updated_at, review_due, owner";

export function createSupabaseHaccpHandbookRepository(
  client: SupabaseClient,
): HaccpHandbookRepository {
  return {
    async listSopContent({
      section,
      doc,
    }): Promise<readonly SopContentEntry[]> {
      // handbook/route.ts:28-41 — base query then the section-vs-doc branch.
      let query = client
        .from("haccp_sop_content")
        .select(SOP_COLS)
        .eq("active", true)
        .order("sop_ref");
      if (section) {
        query = query.eq("section_key", section);
      } else if (doc) {
        query = query.ilike("source_doc", `%${doc}%`);
      }
      const { data, error } = await query;
      if (error) {
        log.error("HaccpHandbookRepository.listSopContent DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load SOP content", { cause: error });
      }
      return (data ?? []) as unknown as SopContentEntry[];
    },

    async searchSop(query: string): Promise<readonly SearchResult[]> {
      // search/route.ts:26 — RPC haccp_search({ query }).
      const { data, error } = await client.rpc("haccp_search", { query });
      if (error) {
        log.error("HaccpHandbookRepository.searchSop DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to run search", { cause: error });
      }
      return (data ?? []) as unknown as SearchResult[];
    },

    async listDocuments(): Promise<readonly HaccpDocument[]> {
      // documents/route.ts:19-24 — order(category) then order(doc_ref).
      const { data, error } = await client
        .from("haccp_documents")
        .select(DOCUMENT_COLS)
        .order("category")
        .order("doc_ref");
      if (error) {
        log.error("HaccpHandbookRepository.listDocuments DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load documents", { cause: error });
      }
      return (data ?? []) as unknown as HaccpDocument[];
    },
  };
}

export const supabaseHaccpHandbookRepository: HaccpHandbookRepository =
  createSupabaseHaccpHandbookRepository(supabaseService);
