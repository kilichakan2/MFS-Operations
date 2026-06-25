/**
 * lib/services/HaccpHandbookService.ts
 *
 * The F-19 PR9a Cluster F "handbook" service — business orchestration for the SOP
 * handbook reader, the search box, and the document-control register. Factory
 * here, wiring in `lib/wiring/haccp.ts`; depends on the `handbook` port alone,
 * never on another service and never on the adapters folder (lint-enforced,
 * ADR-0002 / F-TD-11).
 *
 * The pure logic the 3 routes do today is LIFTED here verbatim so it is unit-
 * tested now and the PR9b re-point is thin:
 *   - getHandbook owns the "neither section nor doc → 400" validation
 *     (handbook/route.ts:24-26) and the `section ?? null` / `doc ?? null`
 *     response assembly (route.ts:48). The section-vs-doc branch is pushed into
 *     the port call (the adapter runs the actual `.eq`/`.ilike`).
 *   - search owns the q<2 short-circuit (search/route.ts:21-24) — NO repo call —
 *     and the `{ results, query }` assembly with the TRIMMED query (route.ts:33).
 *   - getDocuments returns a BARE ARRAY (documents/route.ts:30) — R-F-B1.
 */

import type {
  SopContentEntry,
  HandbookResponse,
  SearchResponse,
  HaccpDocument,
} from "@/lib/domain";
import type { HaccpHandbookRepository } from "@/lib/ports";

/** The route's 400-equivalent for the missing-params branch (PR9b → HTTP). */
export type HandbookReject = {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
};

export interface HaccpHandbookServiceDeps {
  readonly handbook: HaccpHandbookRepository;
}

export interface HaccpHandbookService {
  /**
   * GET /api/haccp/handbook. Exactly one of section/doc should be set; neither →
   * the 400-equivalent reject. Returns { section, doc, entries } (key order).
   */
  getHandbook(args: {
    section: string | null;
    doc: string | null;
  }): Promise<HandbookResponse | HandbookReject>;

  /**
   * GET /api/haccp/search. q is TRIMMED at the route edge then passed in; the
   * service short-circuits to { results: [] } when q is missing or <2 chars
   * (NO repo call). Otherwise returns { results, query }.
   */
  search(q: string | null | undefined): Promise<SearchResponse | { results: readonly never[] }>;

  /** GET /api/haccp/documents — a BARE ARRAY (R-F-B1). */
  getDocuments(): Promise<readonly HaccpDocument[]>;
}

export function createHaccpHandbookService(
  deps: HaccpHandbookServiceDeps,
): HaccpHandbookService {
  const { handbook } = deps;

  return {
    async getHandbook({ section, doc }): Promise<HandbookResponse | HandbookReject> {
      // handbook/route.ts:24-26 — neither set → 400.
      if (!section && !doc) {
        return { ok: false, status: 400, message: "Missing section or doc parameter" };
      }
      const entries: readonly SopContentEntry[] = await handbook.listSopContent({
        section,
        doc,
      });
      // handbook/route.ts:48 — key order section, doc, entries.
      return { section: section ?? null, doc: doc ?? null, entries };
    },

    async search(q) {
      // search/route.ts:21-24 — trim happens at the route edge; guard q<2.
      const trimmed = q?.trim();
      if (!trimmed || trimmed.length < 2) {
        return { results: [] };
      }
      const results = await handbook.searchSop(trimmed);
      // search/route.ts:33 — key order results, query (the trimmed q).
      return { results, query: trimmed } satisfies SearchResponse;
    },

    getDocuments: () => handbook.listDocuments(),
  };
}
