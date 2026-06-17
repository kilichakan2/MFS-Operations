/**
 * lib/adapters/fake/RoutesRepository.ts
 *
 * In-memory implementation of `RoutesRepository` (lib/ports/RoutesRepository.ts).
 * No Supabase SDK import — pure JavaScript Map storage of DOMAIN types.
 * The faithful twin of the Supabase adapter: it passes the SAME shared
 * contract suite, so the Fake can never drift from the real DB's behaviour.
 *
 * It deliberately mirrors the database's hard rules so both adapters
 * answer the contract identically:
 *   - UNIQUE(route_id, position) on stops → a duplicate position throws.
 *   - createRoute rolls back the header if the stop insert trips that
 *     constraint (mirrors the real adapter's rollback).
 *   - replaceRoute deletes old stops BEFORE inserting, so a re-used
 *     position never collides.
 *   - deleting a route cascades its stops.
 *
 * Construction:
 *   - `createFakeRoutesRepository(opts?)` factory — tests inject the
 *     people/customers the joins resolve against (so getRouteById can
 *     return a populated `assignee` / `customer`).
 *   - `fakeRoutesRepository` singleton — empty; exists for barrel symmetry.
 */

import type {
  RouteWithStops,
  RouteStop,
  RouteSummary,
  RoutePerson,
  StopCustomer,
  CreateRoutePersist,
  SaveRoutePersist,
  CreatedRoute,
  RouteStatusRow,
  RouteStatus,
} from "@/lib/domain";
import type { RoutesRepository, ListRoutesFilter } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";

/** Internal stored header (domain shape minus the joins, which are derived). */
interface StoredRoute {
  id: string;
  name: string | null;
  plannedDate: string;
  assignedTo: string | null;
  createdBy: string | null;
  departureTime: string;
  endPoint: RouteWithStops["endPoint"];
  status: RouteStatus;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  googleMapsUrl: string | null;
  createdAt: string;
}

/** Internal stored stop. */
interface StoredStop {
  id: string;
  routeId: string;
  customerId: string;
  position: number;
  priority: RouteStop["priority"];
  lockedPosition: boolean;
  priorityNote: string | null;
  estimatedArrival: string | null;
  driveTimeFromPrevMin: number | null;
  distanceFromPrevKm: number | null;
  visited: boolean;
}

/** Optional join directories so reads return populated assignee/customer. */
export interface FakeRoutesSeed {
  /** user id → person (assignee/creator joins resolve here). */
  readonly people?: Readonly<Record<string, RoutePerson>>;
  /** customer id → customer (stop.customer joins resolve here). */
  readonly customers?: Readonly<Record<string, StopCustomer>>;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

export function createFakeRoutesRepository(
  seed?: FakeRoutesSeed,
): RoutesRepository {
  const routes = new Map<string, StoredRoute>();
  const stops = new Map<string, StoredStop>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};

  function personFor(id: string | null, withRole: boolean): RoutePerson | null {
    if (id === null) return null;
    const p = people[id];
    if (!p) return null;
    return withRole ? p : { id: p.id, name: p.name };
  }

  function customerFor(id: string): StopCustomer | null {
    return customers[id] ?? null;
  }

  function stopsForRoute(routeId: string): StoredStop[] {
    return [...stops.values()]
      .filter((s) => s.routeId === routeId)
      .sort((a, b) => a.position - b.position);
  }

  function toRouteStop(s: StoredStop): RouteStop {
    return {
      id: s.id,
      position: s.position,
      priority: s.priority,
      lockedPosition: s.lockedPosition,
      priorityNote: s.priorityNote,
      estimatedArrival: s.estimatedArrival,
      driveTimeFromPrevMin: s.driveTimeFromPrevMin,
      distanceFromPrevKm: s.distanceFromPrevKm,
      visited: s.visited,
      customer: customerFor(s.customerId),
    };
  }

  function toRouteWithStops(r: StoredRoute): RouteWithStops {
    return {
      id: r.id,
      name: r.name,
      plannedDate: r.plannedDate,
      assignedTo: r.assignedTo,
      createdBy: r.createdBy,
      departureTime: r.departureTime,
      endPoint: r.endPoint,
      status: r.status,
      totalDistanceKm: r.totalDistanceKm,
      totalDurationMin: r.totalDurationMin,
      googleMapsUrl: r.googleMapsUrl,
      createdAt: r.createdAt,
      assignee: personFor(r.assignedTo, true),
      creator: personFor(r.createdBy, false),
      stops: stopsForRoute(r.id).map(toRouteStop),
    };
  }

  /** Insert stops for a route, enforcing UNIQUE(route_id, position). */
  function insertStops(
    routeId: string,
    incoming: CreateRoutePersist["stops"],
  ): void {
    const seen = new Set<number>();
    const staged: StoredStop[] = [];
    for (const s of incoming) {
      if (seen.has(s.position)) {
        throw new ServiceError(
          "duplicate key value violates unique constraint " +
            '"route_stops_route_id_position_key"',
        );
      }
      seen.add(s.position);
      staged.push({
        id: nextId(),
        routeId,
        customerId: s.customerId,
        position: s.position,
        priority: s.priority,
        lockedPosition: s.lockedPosition,
        priorityNote: s.priorityNote,
        estimatedArrival: s.estimatedArrival,
        driveTimeFromPrevMin: s.driveTimeFromPrevMin,
        distanceFromPrevKm: s.distanceFromPrevKm,
        visited: false,
      });
    }
    // All staged → commit (atomic — partial inserts never land).
    for (const st of staged) stops.set(st.id, st);
  }

  return {
    async listRoutes(
      filter: ListRoutesFilter,
    ): Promise<readonly RouteWithStops[]> {
      let rows = [...routes.values()];
      if (!filter.all && filter.plannedDate !== undefined) {
        rows = rows.filter((r) => r.plannedDate === filter.plannedDate);
      }
      if (filter.assignedTo !== undefined) {
        rows = rows.filter((r) => r.assignedTo === filter.assignedTo);
      }
      // today's list order: planned_date desc, created_at desc
      rows.sort((a, b) => {
        if (a.plannedDate !== b.plannedDate)
          return b.plannedDate.localeCompare(a.plannedDate);
        return b.createdAt.localeCompare(a.createdAt);
      });
      return rows.map(toRouteWithStops);
    },

    async getRouteById(id: string): Promise<RouteWithStops | null> {
      const r = routes.get(id);
      return r ? toRouteWithStops(r) : null;
    },

    async getNextRouteForUser(
      userId: string,
      minDate: string,
    ): Promise<RouteWithStops | null> {
      const candidates = [...routes.values()]
        .filter(
          (r) =>
            r.assignedTo === userId &&
            r.plannedDate >= minDate &&
            (r.status === "active" || r.status === "draft"),
        )
        .sort((a, b) => {
          if (a.plannedDate !== b.plannedDate)
            return a.plannedDate.localeCompare(b.plannedDate);
          return a.departureTime.localeCompare(b.departureTime);
        });
      const first = candidates[0];
      return first ? toRouteWithStops(first) : null;
    },

    async listRouteSummaries(
      from: string,
      to: string,
    ): Promise<readonly RouteSummary[]> {
      const rows = [...routes.values()]
        .filter((r) => r.plannedDate >= from && r.plannedDate <= to)
        .sort((a, b) => {
          if (a.plannedDate !== b.plannedDate)
            return a.plannedDate.localeCompare(b.plannedDate);
          return a.departureTime.localeCompare(b.departureTime);
        });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        plannedDate: r.plannedDate,
        departureTime: r.departureTime,
        status: r.status,
        endPoint: r.endPoint,
        totalDistanceKm: r.totalDistanceKm,
        totalDurationMin: r.totalDurationMin,
        assignee: personFor(r.assignedTo, false),
        stopCount: stopsForRoute(r.id).length,
      }));
    },

    async createRoute(input: CreateRoutePersist): Promise<CreatedRoute> {
      const id = nextId();
      const row: StoredRoute = {
        id,
        name: input.name,
        plannedDate: input.plannedDate,
        assignedTo: input.assignedTo,
        createdBy: input.createdBy,
        departureTime: input.departureTime,
        endPoint: input.endPoint,
        status: "active", // today's create literal
        totalDistanceKm: input.totalDistanceKm,
        totalDurationMin: input.totalDurationMin,
        googleMapsUrl: input.googleMapsUrl,
        createdAt: new Date().toISOString(),
      };
      routes.set(id, row);
      try {
        insertStops(id, input.stops);
      } catch (err) {
        // Rollback the header (mirrors the real adapter's createOrder).
        routes.delete(id);
        throw err;
      }
      return {
        id: row.id,
        name: row.name,
        plannedDate: row.plannedDate,
        assignedTo: row.assignedTo,
        status: row.status,
        createdAt: row.createdAt,
      };
    },

    async replaceRoute(id: string, input: SaveRoutePersist): Promise<void> {
      const existing = routes.get(id);
      if (existing) {
        // Step 1: update header (always saved first — metadata never lost).
        routes.set(id, {
          ...existing,
          name: input.name,
          plannedDate: input.plannedDate,
          assignedTo: input.assignedTo,
          departureTime: input.departureTime,
          endPoint: input.endPoint,
          totalDistanceKm: input.totalDistanceKm,
          totalDurationMin: input.totalDurationMin,
          googleMapsUrl: input.googleMapsUrl,
        });
      }
      // Step 2: delete existing stops (clears UNIQUE before re-insert).
      for (const [sid, s] of stops) {
        if (s.routeId === id) stops.delete(sid);
      }
      // Step 3: insert the new stops.
      insertStops(id, input.stops);
    },

    async setRouteStatus(
      id: string,
      status: RouteStatus,
    ): Promise<RouteStatusRow | null> {
      const existing = routes.get(id);
      if (!existing) return null;
      const updated: StoredRoute = { ...existing, status };
      routes.set(id, updated);
      return {
        id: updated.id,
        name: updated.name,
        plannedDate: updated.plannedDate,
        status: updated.status,
      };
    },

    async deleteRoute(id: string): Promise<void> {
      routes.delete(id);
      for (const [sid, s] of stops) {
        if (s.routeId === id) stops.delete(sid); // cascade
      }
    },
  };
}

export const fakeRoutesRepository: RoutesRepository =
  createFakeRoutesRepository();
