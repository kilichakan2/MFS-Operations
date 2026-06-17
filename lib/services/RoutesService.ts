/**
 * lib/services/RoutesService.ts
 *
 * The Routes service (F-14) — business orchestration for delivery routes.
 * It copies OrdersService / UsersService posture exactly: factory here,
 * wiring in `lib/wiring/routes.ts`; primitives not Caller; ONE port, never
 * another service.
 *
 * What this file OWNS (the business decisions worth hiding):
 *   - The 7pm UK rollover. `getNextRouteForUser(userId, atTime?)` computes
 *     the effective minDate via the already-unit-tested
 *     getUKDateAndHour + getEffectiveMinDate, then hands the repo a PLAIN
 *     DATE STRING. After 19:00 UK, "today" rolls to tomorrow.
 *   - The Mon–Sun week boundary. `listWeekRuns(from?, to?)` defaults the
 *     bounds via getUKWeekBounds (Monday-start), then hands the repo plain
 *     `from`/`to` strings.
 *   The repository never computes a date — it only applies the filter it
 *   is handed. This keeps the rollover/week logic unit-testable with a
 *   Fake repo and no clock in the database.
 *
 * Everything else is a pure passthrough to the port (listRoutes,
 * getRouteById, createRoute, saveRoute, setRouteStatus, deleteRoute). The
 * multi-step writes (insert+rollback, delete-then-insert replace) are
 * hidden in the adapter (depth rule; matches Orders) — the service just
 * validates/maps and delegates.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11):
 *   - `createRoutesService({ routes })` factory — tests pass a Fake repo.
 *   - Production wiring lives in `lib/wiring/routes.ts` (service-role
 *     singleton) — NEVER a pre-wired singleton here. Service files import
 *     ports only, never the adapters folder (lint-enforced).
 */

import type {
  RouteWithStops,
  RouteSummary,
  CreateRouteInput,
  SaveRouteInput,
  CreatedRoute,
  RouteStatusRow,
  RouteStatus,
} from "@/lib/domain";
import type { RoutesRepository, ListRoutesFilter } from "@/lib/ports";
import {
  getUKDateAndHour,
  getEffectiveMinDate,
  getUKWeekBounds,
} from "@/lib/utils/ukDateAndHour";

// ─── Repository bundle ──────────────────────────────────────

/**
 * Ports accepted by `createRoutesService`, passed as a named object so the
 * call site is unambiguous: createRoutesService({ routes }).
 */
export interface RoutesServiceDeps {
  readonly routes: RoutesRepository;
}

/** The resolved bounds returned alongside the runs list (echoed on the wire). */
export interface WeekRuns {
  readonly runs: readonly RouteSummary[];
  readonly from: string;
  readonly to: string;
}

// ─── The RoutesService interface ────────────────────────────

export interface RoutesService {
  /** List full routes for the filter (passthrough). */
  listRoutes(filter: ListRoutesFilter): Promise<readonly RouteWithStops[]>;

  /** Fetch one full route by id; null on miss (passthrough). */
  getRouteById(id: string): Promise<RouteWithStops | null>;

  /**
   * The chronologically next active/draft route for a user. The SERVICE
   * computes the effective minDate (7pm UK rollover) from `atTime`
   * (defaults to now) and hands the repo a plain date string. Null on none.
   */
  getNextRouteForUser(
    userId: string,
    atTime?: Date,
  ): Promise<RouteWithStops | null>;

  /**
   * The week's runs (lightweight summaries + the resolved bounds). When
   * `from`/`to` are omitted the SERVICE defaults them to the current UK
   * Mon–Sun week. The repo only applies the bounds.
   */
  listWeekRuns(from?: string, to?: string): Promise<WeekRuns>;

  /** Create a route header + its stops (passthrough; adapter does the work). */
  createRoute(input: CreateRouteInput): Promise<CreatedRoute>;

  /** Replace a route entirely (passthrough; adapter does the atomic replace). */
  saveRoute(id: string, input: SaveRouteInput): Promise<void>;

  /** Update only a route's status; null on missing id (passthrough). */
  setRouteStatus(
    id: string,
    status: RouteStatus,
  ): Promise<RouteStatusRow | null>;

  /** Permanently delete a route; idempotent (passthrough). */
  deleteRoute(id: string): Promise<void>;
}

// ─── The factory ────────────────────────────────────────────

export function createRoutesService(deps: RoutesServiceDeps): RoutesService {
  const { routes } = deps;

  return {
    listRoutes: (filter) => routes.listRoutes(filter),
    getRouteById: (id) => routes.getRouteById(id),

    async getNextRouteForUser(userId, atTime) {
      // The one business rule here: after 19:00 UK, roll "today" forward.
      const { dateStr, hour } = getUKDateAndHour(atTime ?? new Date());
      const minDate = getEffectiveMinDate(dateStr, hour);
      return routes.getNextRouteForUser(userId, minDate);
    },

    async listWeekRuns(from, to) {
      // Default the bounds to the current UK Mon–Sun week when omitted.
      const bounds = getUKWeekBounds();
      const resolvedFrom = from ?? bounds.from;
      const resolvedTo = to ?? bounds.to;
      const runs = await routes.listRouteSummaries(resolvedFrom, resolvedTo);
      return { runs, from: resolvedFrom, to: resolvedTo };
    },

    createRoute: (input) => routes.createRoute(input),
    saveRoute: (id, input) => routes.replaceRoute(id, input),
    setRouteStatus: (id, status) => routes.setRouteStatus(id, status),
    deleteRoute: (id) => routes.deleteRoute(id),
  };
}
