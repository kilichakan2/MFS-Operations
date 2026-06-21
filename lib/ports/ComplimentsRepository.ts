/**
 * lib/ports/ComplimentsRepository.ts
 *
 * The Compliments port (F-17) — the persistence interface the app owns for
 * the compliments table + the active-users recipient lookup, described in
 * BUSINESS operations, not vendor calls. Pure TypeScript: imports domain
 * types only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 route operation — none is speculative:
 *
 *   listRecent            → GET  /api/compliments
 *   createCompliment      → POST /api/compliments
 *   listActiveRecipients  → GET  /api/compliments/users
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to app-owned
 * errors INSIDE the adapter; callers see only `@/lib/domain` types and
 * `@/lib/errors`. Reads define errors out of existence (empty on miss);
 * every DB failure throws ServiceError.
 */

import type {
  Compliment,
  ComplimentRecipient,
  CreateComplimentInput,
} from "@/lib/domain";

export interface ComplimentsRepository {
  /** Newest-first, limit 100, poster + recipient joins resolved.
   *  → GET /api/compliments. */
  listRecent(): Promise<readonly Compliment[]>;

  /** Insert a compliment; returns it with joins resolved (poster + recipient).
   *  → POST /api/compliments. */
  createCompliment(input: CreateComplimentInput): Promise<Compliment>;

  /** Active users (id,name,role) ordered by name, for the recipient dropdown.
   *  → GET /api/compliments/users. */
  listActiveRecipients(): Promise<readonly ComplimentRecipient[]>;
}
