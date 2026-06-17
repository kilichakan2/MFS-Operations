/**
 * lib/adapters/supabase/RoutesRepository.ts
 *
 * Supabase implementation of `RoutesRepository`
 * (lib/ports/RoutesRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the
 * `lib/adapters/supabase` directory tree at `.eslintrc.json`). The ONLY
 * file that imports the vendor SDK for Routes.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   PostgREST row shapes are touched only inside the method bodies.
 *   Vendor column names (planned_date, departure_time, end_point,
 *   total_distance_km, locked_position, route_stops, …) are mapped to
 *   camelCase domain fields, so the rest of the app never sees the
 *   database's spelling. The vendor's embedded count array
 *   (`route_stops (id)`) is collapsed to a plain `stopCount` here — it
 *   never crosses the port.
 *
 * Depth (ADR-0002): the reads hide the two-table embedded join + the
 * per-route position sort; the writes hide the multi-step insert+rollback
 * (createRoute) and the delete-then-insert replace (replaceRoute),
 * mirroring OrdersRepository.createOrder / updateOrder exactly.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseRoutesRepository(client)` factory — tests pass
 *     `getServiceClient()`; wiring passes the per-caller authed client.
 *   - `supabaseRoutesRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
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
  RouteEndPoint,
  StopPriority,
} from "@/lib/domain";
import type { RoutesRepository, ListRoutesFilter } from "@/lib/ports";

// Select field lists copied VERBATIM from the routes the PR2 re-point
// will replace, so the wire output stays byte-identical. The route file
// remains the source of truth for which keys each endpoint returns.
const FULL_STOP_COLS =
  "id, position, priority, locked_position, priority_note, " +
  "estimated_arrival, drive_time_from_prev_min, distance_from_prev_km, " +
  "visited, customer:customers (id, name, postcode, lat, lng)";

// listRoutes (GET /api/routes) selects assignee + creator + stops.
const LIST_COLS = `
  id, name, planned_date, departure_time, end_point, status,
  total_distance_km, total_duration_min, google_maps_url, created_at,
  assigned_to,
  assignee:users!routes_assigned_to_fkey (id, name, role),
  creator:users!routes_created_by_fkey   (id, name),
  route_stops ( ${FULL_STOP_COLS} )
`;

// getRouteById + today: the WIRE omits creator/created_at (the routes map
// only the keys they emit today), but the ADAPTER now hydrates created_at,
// created_by and the creator join so the domain object is honest and the
// Supabase single-read matches the Fake (W1 kills the createdAt="" sentinel;
// N1 ends the creator/createdBy single-read divergence). The route mapping —
// not this projection — is what keeps the [id]/today wire byte-identical.
const SINGLE_COLS = `
  id, name, planned_date, departure_time, end_point, status,
  total_distance_km, total_duration_min, google_maps_url, created_at,
  assigned_to, created_by,
  assignee:users!routes_assigned_to_fkey (id, name, role),
  creator:users!routes_created_by_fkey   (id, name),
  route_stops ( ${FULL_STOP_COLS} )
`;

// admin/runs select: header-ish + trimmed assignee (NO role) + count only.
const SUMMARY_COLS = `
  id, name, planned_date, departure_time, status, end_point,
  total_distance_km, total_duration_min,
  assignee:users!routes_assigned_to_fkey (id, name),
  route_stops (id)
`;

// ─── coercion helpers (Postgres numeric arrives as string|number) ────

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isNaN(n) ? null : n;
}

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── row → domain mappers ────────────────────────────────────────────

interface PersonRow {
  id: string;
  name: string;
  role?: string;
}

function toPerson(row: unknown, withRole: boolean): RoutePerson | null {
  const p = one(row as PersonRow | PersonRow[] | null);
  if (p === null) return null;
  return withRole && p.role !== undefined
    ? { id: p.id, name: p.name, role: p.role }
    : { id: p.id, name: p.name };
}

function toCustomer(row: unknown): StopCustomer | null {
  const c = one(
    row as
      | { id: string; name: string; postcode: string | null; lat: unknown; lng: unknown }
      | { id: string; name: string; postcode: string | null; lat: unknown; lng: unknown }[]
      | null,
  );
  if (c === null) return null;
  return {
    id: c.id,
    name: c.name,
    postcode: c.postcode,
    lat: num(c.lat),
    lng: num(c.lng),
  };
}

interface StopRow {
  id: string;
  position: number;
  priority: string;
  locked_position: boolean;
  priority_note: string | null;
  estimated_arrival: string | null;
  drive_time_from_prev_min: number | null;
  distance_from_prev_km: unknown;
  visited: boolean;
  customer: unknown;
}

function toStop(row: StopRow): RouteStop {
  return {
    id: row.id,
    position: row.position,
    priority: row.priority as StopPriority,
    lockedPosition: row.locked_position,
    priorityNote: row.priority_note,
    estimatedArrival: row.estimated_arrival,
    driveTimeFromPrevMin: row.drive_time_from_prev_min,
    distanceFromPrevKm: num(row.distance_from_prev_km),
    visited: row.visited,
    customer: toCustomer(row.customer),
  };
}

interface RouteRow {
  id: string;
  name: string | null;
  planned_date: string;
  departure_time: string;
  end_point: string;
  status: string;
  total_distance_km: unknown;
  total_duration_min: number | null;
  google_maps_url: string | null;
  created_at?: string;
  assigned_to: string | null;
  created_by?: string | null;
  assignee?: unknown;
  creator?: unknown;
  route_stops?: StopRow[] | null;
}

/** Map a full route row (LIST_COLS or SINGLE_COLS) to RouteWithStops. */
function toRouteWithStops(row: RouteRow): RouteWithStops {
  const sorted = [...(row.route_stops ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return {
    id: row.id,
    name: row.name,
    plannedDate: row.planned_date,
    assignedTo: row.assigned_to,
    // Both LIST_COLS and SINGLE_COLS now select created_by — the domain
    // object is fully hydrated on every read (N1). The [id]/today routes
    // simply don't emit it to the wire.
    createdBy: row.created_by ?? null,
    departureTime: row.departure_time,
    endPoint: row.end_point as RouteEndPoint,
    status: row.status as RouteStatus,
    totalDistanceKm: num(row.total_distance_km),
    totalDurationMin: row.total_duration_min,
    googleMapsUrl: row.google_maps_url,
    createdAt: row.created_at ?? "",
    assignee: toPerson(row.assignee, true),
    creator: row.creator !== undefined ? toPerson(row.creator, false) : null,
    stops: sorted.map(toStop),
  };
}

export function createSupabaseRoutesRepository(
  client: SupabaseClient,
): RoutesRepository {
  return {
    async listRoutes(
      filter: ListRoutesFilter,
    ): Promise<readonly RouteWithStops[]> {
      let query = client
        .from("routes")
        .select(LIST_COLS)
        .order("planned_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!filter.all && filter.plannedDate !== undefined) {
        query = query.eq("planned_date", filter.plannedDate);
      }
      if (filter.assignedTo !== undefined) {
        query = query.eq("assigned_to", filter.assignedTo);
      }
      const { data, error } = await query;
      if (error) {
        log.error("RoutesRepository.listRoutes DB error", {
          error: error.message,
        });
        throw new ServiceError("Route list failed", { cause: error });
      }
      return (data ?? []).map((r) =>
        toRouteWithStops(r as unknown as RouteRow),
      );
    },

    async getRouteById(id: string): Promise<RouteWithStops | null> {
      const { data, error } = await client
        .from("routes")
        .select(SINGLE_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("RoutesRepository.getRouteById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Route lookup failed", { cause: error });
      }
      return data === null
        ? null
        : toRouteWithStops(data as unknown as RouteRow);
    },

    async getNextRouteForUser(
      userId: string,
      minDate: string,
    ): Promise<RouteWithStops | null> {
      const { data, error } = await client
        .from("routes")
        .select(SINGLE_COLS)
        .eq("assigned_to", userId)
        .gte("planned_date", minDate)
        .in("status", ["active", "draft"])
        .order("planned_date", { ascending: true })
        .order("departure_time", { ascending: true })
        .limit(1);
      if (error) {
        log.error("RoutesRepository.getNextRouteForUser DB error", {
          userId,
          error: error.message,
        });
        throw new ServiceError("Route lookup failed", { cause: error });
      }
      if (!data || data.length === 0) return null;
      return toRouteWithStops(data[0] as unknown as RouteRow);
    },

    async listRouteSummaries(
      from: string,
      to: string,
    ): Promise<readonly RouteSummary[]> {
      const { data, error } = await client
        .from("routes")
        .select(SUMMARY_COLS)
        .gte("planned_date", from)
        .lte("planned_date", to)
        .order("planned_date", { ascending: true })
        .order("departure_time", { ascending: true });
      if (error) {
        log.error("RoutesRepository.listRouteSummaries DB error", {
          error: error.message,
        });
        throw new ServiceError("Route summary list failed", { cause: error });
      }
      return (data ?? []).map((r) => {
        const row = r as unknown as RouteRow;
        return {
          id: row.id,
          name: row.name,
          plannedDate: row.planned_date,
          departureTime: row.departure_time,
          status: row.status as RouteStatus,
          endPoint: row.end_point as RouteEndPoint,
          totalDistanceKm: num(row.total_distance_km),
          totalDurationMin: row.total_duration_min,
          assignee: toPerson(row.assignee, false),
          // stop_count computed INSIDE the adapter; the embedded array
          // never crosses the port.
          stopCount: (row.route_stops ?? []).length,
        };
      });
    },

    async createRoute(input: CreateRoutePersist): Promise<CreatedRoute> {
      // 1. Insert the routes header (status literal 'active' — today's value).
      const { data: route, error: routeErr } = await client
        .from("routes")
        .insert({
          name: input.name,
          planned_date: input.plannedDate,
          assigned_to: input.assignedTo,
          created_by: input.createdBy,
          departure_time: input.departureTime,
          end_point: input.endPoint,
          status: "active",
          total_distance_km: input.totalDistanceKm,
          total_duration_min: input.totalDurationMin,
          google_maps_url: input.googleMapsUrl,
        })
        .select("id, name, planned_date, assigned_to, status, created_at")
        .single();
      if (routeErr || !route) {
        log.error("RoutesRepository.createRoute header insert failed", {
          error: routeErr?.message,
        });
        throw new ServiceError("Failed to create route", {
          cause: routeErr ?? new Error("no row returned"),
        });
      }
      const newId = route.id as string;

      // 2. Insert the stops.
      const stopRows = input.stops.map((s) => ({
        route_id: newId,
        customer_id: s.customerId,
        position: s.position,
        priority: s.priority,
        locked_position: s.lockedPosition,
        priority_note: s.priorityNote,
        estimated_arrival: s.estimatedArrival,
        drive_time_from_prev_min: s.driveTimeFromPrevMin,
        distance_from_prev_km: s.distanceFromPrevKm,
        visited: false,
      }));
      const { error: stopsErr } = await client
        .from("route_stops")
        .insert(stopRows);
      if (stopsErr) {
        // Roll back the header row (mirrors createOrder; route_stops that
        // landed before the failure go via the route's ON DELETE CASCADE).
        const { error: rollbackErr } = await client
          .from("routes")
          .delete()
          .eq("id", newId);
        if (rollbackErr) {
          log.error(
            "RoutesRepository.createRoute stops insert failed AND rollback failed",
            {
              routeId: newId,
              stopsError: stopsErr.message,
              rollbackError: rollbackErr.message,
            },
          );
        } else {
          log.error(
            "RoutesRepository.createRoute stops insert failed; rolled back",
            { routeId: newId, stopsError: stopsErr.message },
          );
        }
        throw new ServiceError("Failed to insert route stops", {
          cause: stopsErr,
        });
      }

      return {
        id: route.id as string,
        name: route.name as string | null,
        plannedDate: route.planned_date as string,
        assignedTo: route.assigned_to as string | null,
        status: route.status as RouteStatus,
        createdAt: route.created_at as string,
      };
    },

    async replaceRoute(id: string, input: SaveRoutePersist): Promise<void> {
      // Step 1: update the header (always persisted first — never lost).
      const { error: updateErr } = await client
        .from("routes")
        .update({
          name: input.name,
          planned_date: input.plannedDate,
          assigned_to: input.assignedTo,
          departure_time: input.departureTime,
          end_point: input.endPoint,
          total_distance_km: input.totalDistanceKm,
          total_duration_min: input.totalDurationMin,
          google_maps_url: input.googleMapsUrl,
        })
        .eq("id", id);
      if (updateErr) {
        log.error("RoutesRepository.replaceRoute header update failed", {
          id,
          error: updateErr.message,
        });
        throw new ServiceError(updateErr.message, { cause: updateErr });
      }

      // Step 2: delete the existing stops (clears UNIQUE before re-insert).
      const { error: deleteErr } = await client
        .from("route_stops")
        .delete()
        .eq("route_id", id);
      if (deleteErr) {
        // Header already updated — stops stale but route not lost. Preserve
        // today's exact human message shape (PR2 carries it to the wire).
        log.error("RoutesRepository.replaceRoute stop delete failed", {
          id,
          error: deleteErr.message,
        });
        throw new ServiceError(
          `Header saved but could not clear old stops: ${deleteErr.message}`,
          { cause: deleteErr },
        );
      }

      // Step 3: insert the new stops.
      const stopRows = input.stops.map((s) => ({
        route_id: id,
        customer_id: s.customerId,
        position: s.position,
        priority: s.priority,
        locked_position: s.lockedPosition,
        priority_note: s.priorityNote,
        estimated_arrival: s.estimatedArrival,
        drive_time_from_prev_min: s.driveTimeFromPrevMin,
        distance_from_prev_km: s.distanceFromPrevKm,
      }));
      const { error: insertErr } = await client
        .from("route_stops")
        .insert(stopRows);
      if (insertErr) {
        log.error("RoutesRepository.replaceRoute stop insert failed", {
          id,
          error: insertErr.message,
        });
        throw new ServiceError(
          `Route header saved but stops could not be written: ${insertErr.message}. Please re-save to restore stops.`,
          { cause: insertErr },
        );
      }
    },

    async setRouteStatus(
      id: string,
      status: RouteStatus,
    ): Promise<RouteStatusRow | null> {
      const { data, error } = await client
        .from("routes")
        .update({ status })
        .eq("id", id)
        .select("id, name, planned_date, status")
        .maybeSingle();
      if (error) {
        log.error("RoutesRepository.setRouteStatus DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id as string,
        name: data.name as string | null,
        plannedDate: data.planned_date as string,
        status: data.status as RouteStatus,
      };
    },

    async deleteRoute(id: string): Promise<void> {
      const { error } = await client.from("routes").delete().eq("id", id);
      if (error) {
        log.error("RoutesRepository.deleteRoute DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },
  };
}

export const supabaseRoutesRepository: RoutesRepository =
  createSupabaseRoutesRepository(supabaseService);
