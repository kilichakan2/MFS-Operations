/**
 * lib/ports/DiscrepanciesRepository.ts
 *
 * The Discrepancies port (F-21) — the persistence interface the app owns for
 * the `discrepancies` table (short / not-sent deliveries), described in
 * BUSINESS operations, not vendor calls. Pure TypeScript: imports domain types
 * only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a route operation — none is speculative:
 *
 *   listToday        → GET /api/dashboard (Zone 2: discrepancies today)
 *   listWeekRollup   → GET /api/dashboard (Zone 3: reason + product rollup)
 *   findDetailById   → GET /api/detail/discrepancy
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case columns
 * to camelCase domain fields and Postgres error codes to app-owned errors
 * INSIDE the adapter; callers see only `@/lib/domain` types and `@/lib/errors`.
 * Reads define errors out of existence (null on miss); every DB failure throws
 * ServiceError. The RAW `reason` is carried in the domain type (no
 * `.replace`) — the presentation transform stays in the route/service.
 */

import type {
  DiscrepancyToday,
  DiscrepancyWeekRollupRow,
  DiscrepancyDetail,
} from "@/lib/domain";

/** Inclusive ISO date window [from, to] for the dashboard reads. */
export interface DiscrepancyWindow {
  readonly from: string;
  readonly to: string;
}

export interface DiscrepanciesRepository {
  /** Discrepancies in [from,to], newest first, limit 50. customers(name) +
   *  products(name) + logged-by users(name) resolved. RAW reason (no replace).
   *  → dashboard Zone 2. @throws ServiceError on DB failure. */
  listToday(window: DiscrepancyWindow): Promise<readonly DiscrepancyToday[]>;

  /** Discrepancies in [from,to] (no limit), reason + products(name) only — the
   *  rollup feed. → dashboard Zone 3. @throws ServiceError on DB failure. */
  listWeekRollup(
    window: DiscrepancyWindow,
  ): Promise<readonly DiscrepancyWeekRollupRow[]>;

  /** One discrepancy by id with customer{id,name} + product{id,name,category} +
   *  logged-by rep name. null on miss (route maps null→404). RAW reason.
   *  → GET /api/detail/discrepancy. @throws ServiceError on DB failure. */
  findDetailById(id: string): Promise<DiscrepancyDetail | null>;
}
