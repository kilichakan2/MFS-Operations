/**
 * lib/ports/RoutesRepository.ts
 *
 * The Routes port (F-14) — the delivery-route persistence interface the
 * app owns, described in BUSINESS operations, not vendor calls. Pure
 * TypeScript: imports domain types only, never an adapter or a vendor SDK.
 *
 * Every method maps 1:1 to a PR2 endpoint operation — none is
 * speculative. If a method ever ends up with no consumer, delete it
 * (same discipline as UsersRepository):
 *
 *   listRoutes          → GET  /api/routes
 *   getRouteById        → GET  /api/routes/[id]
 *   getNextRouteForUser → GET  /api/routes/today
 *   listRouteSummaries  → GET  /api/admin/runs
 *   createRoute         → POST /api/routes
 *   replaceRoute        → PUT  /api/routes/[id]
 *   setRouteStatus      → PATCH /api/admin/runs/[id]
 *   deleteRoute         → DELETE /api/admin/runs/[id]
 *
 * The depth rule (ADR-0002): none of these is a bare passthrough. The
 * reads hide a two-table embedded join + per-route position sort +
 * vendor→domain mapping; the writes hide a multi-step insert/replace
 * with rollback / delete-then-insert ordering (mirroring
 * OrdersRepository.createOrder / updateOrder).
 *
 * The date boundary (the key design call): this port speaks PLAIN DATE
 * STRINGS. `getNextRouteForUser` receives an already-computed `minDate`;
 * `listRouteSummaries` receives already-computed `from`/`to`. The 7pm
 * rollover and the Mon–Sun week boundary are BUSINESS decisions and live
 * in RoutesService — the repository never knows what time it is, so the
 * date logic stays unit-testable with a Fake repo.
 *
 * Boundary discipline (ADR-0002 line 27): the adapter maps snake_case
 * columns to camelCase domain fields and Postgres error codes to
 * app-owned errors INSIDE the adapter; callers see only `@/lib/domain`
 * types and `@/lib/errors`. Reads define errors out of existence
 * (null/empty on miss); every DB failure throws ServiceError.
 */

import type {
  RouteWithStops,
  RouteSummary,
  CreateRoutePersist,
  SaveRoutePersist,
  CreatedRoute,
  RouteStatusRow,
  RouteStatus,
} from "@/lib/domain";

/** Filter for the route list (GET /api/routes). */
export interface ListRoutesFilter {
  /** When set, only routes with this planned_date (YYYY-MM-DD). */
  readonly plannedDate?: string;
  /** When set, only routes assigned to this user id. */
  readonly assignedTo?: string;
  /** When true, ignore plannedDate entirely (the ?all=true case). */
  readonly all: boolean;
}

export interface RoutesRepository {
  // ─── Reads ──────────────────────────────────────────────────

  /**
   * List full routes (header + ordered stops + assignee/creator/customer
   * joins) for the filter. Stops within each route are returned
   * position-sorted ascending; routes are ordered planned_date desc then
   * created_at desc (today's list order). Hides the two-table embedded
   * join + per-route sort + vendor mapping.
   * → app/api/routes GET. @throws ServiceError on DB failure.
   */
  listRoutes(filter: ListRoutesFilter): Promise<readonly RouteWithStops[]>;

  /**
   * Fetch one full route (header + position-sorted stops + joins) by id.
   * Null on miss (define errors out of existence — the route maps null→404).
   * → app/api/routes/[id] GET. @throws ServiceError on DB failure.
   */
  getRouteById(id: string): Promise<RouteWithStops | null>;

  /**
   * The chronologically NEXT active/draft route for a user, on or after
   * `minDate`, ordered planned_date asc then departure_time asc, limit 1.
   * Null on none. `minDate` is computed by the SERVICE (7pm rollover) —
   * the repo only applies it as a filter.
   * → app/api/routes/today GET. @throws ServiceError on DB failure.
   */
  getNextRouteForUser(
    userId: string,
    minDate: string,
  ): Promise<RouteWithStops | null>;

  /**
   * Lightweight route rows for [from,to] (inclusive), ordered
   * planned_date asc then departure_time asc, each carrying an
   * adapter-computed `stopCount` and a trimmed assignee. The bounds are
   * computed by the SERVICE (Mon–Sun week). The vendor's embedded count
   * array never crosses this boundary.
   * → app/api/admin/runs GET. @throws ServiceError on DB failure.
   */
  listRouteSummaries(from: string, to: string): Promise<readonly RouteSummary[]>;

  // ─── Writes ─────────────────────────────────────────────────

  /**
   * Create a route header + its stops in one call. Inserts the routes
   * row, then the route_stops; on stop-insert failure rolls back the
   * route row (mirrors createOrder). Status is set to 'active' on create
   * (today's literal). Returns the created header summary — the exact
   * fields the POST response echoes.
   * → app/api/routes POST. @throws ServiceError on DB failure.
   */
  createRoute(input: CreateRoutePersist): Promise<CreatedRoute>;

  /**
   * Replace a route entirely: update the header → delete all existing
   * route_stops for the id → insert the new stops. ONE method (mirrors
   * updateOrder's lineReplacement). Preserves delete-then-insert order so
   * UNIQUE(route_id, position) never collides. Partial-failure semantics:
   * the header is saved first; a stop-delete or stop-insert failure
   * throws ServiceError with the same human message shape the route
   * returns today.
   * → app/api/routes/[id] PUT. @throws ServiceError on DB failure.
   */
  replaceRoute(id: string, input: SaveRoutePersist): Promise<void>;

  /**
   * Update only a route's status. Returns the trimmed row the PATCH
   * response echoes (id, name, plannedDate, status), or null if no row
   * matched id.
   * → app/api/admin/runs/[id] PATCH. @throws ServiceError on DB failure.
   */
  setRouteStatus(
    id: string,
    status: RouteStatus,
  ): Promise<RouteStatusRow | null>;

  /**
   * Permanently delete a route by id (route_stops cascade). Idempotent —
   * deleting a missing id is not an error.
   * → app/api/admin/runs/[id] DELETE. @throws ServiceError on DB failure.
   */
  deleteRoute(id: string): Promise<void>;
}
