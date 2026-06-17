/**
 * lib/domain/Route.ts
 *
 * The Delivery-Routes domain vocabulary (F-14). Pure TypeScript — no
 * framework import, no vendor import. The app's OWN clean shape for a
 * delivery route and its stops; every field is camelCase, never the
 * database's snake_case spelling (ADR-0002 line 27 — vendor types stop
 * at the adapter door).
 *
 * Two read shapes by design (mirrors UserSummary vs UserCredential):
 *   - `RouteWithStops` — the FULL folder: a `Route` header + its ordered
 *     stops + the assignee/creator/customer joins. Returned by the
 *     screens that draw the map (listRoutes / getRouteById / today).
 *   - `RouteSummary` — the thin INDEX CARD: header-ish fields + a
 *     `stopCount`, NO stops array. Returned by the weekly admin/runs
 *     table, which deliberately drops the full stops and adds a count.
 *
 * The small `CreatedRoute` / `RouteStatusRow` shapes exist ONLY so the
 * adapter can return exactly the handful of fields each write endpoint
 * echoes back today, keeping the wire output byte-identical after PR2.
 *
 * Schema anchor (supabase/migrations/20260101000000_baseline.sql):
 *   routes.name nullable; planned_date NOT NULL (date); assigned_to /
 *   created_by nullable uuid; departure_time NOT NULL (time);
 *   end_point / status NOT NULL (checked text); total_distance_km
 *   numeric nullable; total_duration_min int nullable; google_maps_url
 *   nullable; created_at NOT NULL (timestamptz). route_stops: priority /
 *   locked_position / visited NOT NULL with defaults; the rest nullable;
 *   UNIQUE(route_id, position).
 */

/** Route lifecycle (DB `routes_status_check`). */
export type RouteStatus = "draft" | "active" | "completed";
/** Where the route ends (DB `routes_end_point_check`). */
export type RouteEndPoint = "mfs" | "ozmen_john_street";
/** Stop urgency (DB `route_stops_priority_check`). */
export type StopPriority = "none" | "urgent" | "priority";

/** A trimmed person reference from a users join. */
export interface RoutePerson {
  readonly id: string;
  readonly name: string;
  /** assignee carries role; creator does not. */
  readonly role?: string;
}

/** A customer reference embedded on a stop. */
export interface StopCustomer {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** A delivery route header (camelCase domain shape). */
export interface Route {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string; // YYYY-MM-DD
  readonly assignedTo: string | null; // user id
  readonly createdBy: string | null; // user id
  readonly departureTime: string; // HH:MM(:SS)
  readonly endPoint: RouteEndPoint;
  readonly status: RouteStatus;
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
  readonly createdAt: string; // ISO-8601
  /** Embedded join — present on full reads (listRoutes/getRouteById/today). */
  readonly assignee: RoutePerson | null;
  /** Creator join — only present where today's select includes it (list). */
  readonly creator: RoutePerson | null;
}

/** One stop on a route (camelCase domain shape). */
export interface RouteStop {
  readonly id: string;
  readonly position: number; // 1-based
  readonly priority: StopPriority;
  readonly lockedPosition: boolean;
  readonly priorityNote: string | null;
  readonly estimatedArrival: string | null;
  readonly driveTimeFromPrevMin: number | null;
  readonly distanceFromPrevKm: number | null;
  readonly visited: boolean;
  readonly customer: StopCustomer | null;
}

/** A route header WITH its ordered stops — the full read aggregate. */
export interface RouteWithStops extends Route {
  readonly stops: readonly RouteStop[];
}

/** The lightweight admin-runs row: header-ish fields + a count, no stops. */
export interface RouteSummary {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string;
  readonly departureTime: string;
  readonly status: RouteStatus;
  readonly endPoint: RouteEndPoint;
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly assignee: RoutePerson | null;
  readonly stopCount: number;
}

/** One stop as supplied on create/save (the POST/PUT body becomes this). */
export interface StopInput {
  readonly customerId: string;
  readonly position: number;
  readonly priority: StopPriority;
  readonly lockedPosition: boolean;
  readonly priorityNote: string | null;
  readonly estimatedArrival: string | null;
  readonly driveTimeFromPrevMin: number | null;
  readonly distanceFromPrevKm: number | null;
}

/** Service-facing create input (what a POST body becomes). */
export interface CreateRouteInput {
  readonly name: string | null;
  readonly plannedDate: string;
  readonly assignedTo: string;
  readonly createdBy: string; // from x-mfs-user-id
  readonly departureTime: string;
  readonly endPoint: RouteEndPoint;
  readonly stops: readonly StopInput[];
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
}

/** Service-facing save/replace input (what a PUT body becomes). */
export interface SaveRouteInput {
  readonly name: string | null;
  readonly plannedDate: string;
  readonly assignedTo: string;
  readonly departureTime: string;
  readonly endPoint: RouteEndPoint;
  readonly stops: readonly StopInput[];
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
}

/**
 * Adapter-facing twin of `CreateRouteInput` (same fields; named so the
 * adapter signature is unambiguous, mirroring `CreateUserPersist`). The
 * service hands the adapter this exact shape.
 */
export type CreateRoutePersist = CreateRouteInput;

/**
 * Adapter-facing twin of `SaveRouteInput`. The service hands the adapter
 * this exact shape for `replaceRoute`.
 */
export type SaveRoutePersist = SaveRouteInput;

/**
 * The exact fields today's POST /api/routes selects back and echoes —
 * `{ id, name, planned_date, assigned_to, status, created_at }` in the
 * wire, mapped to camelCase here.
 */
export interface CreatedRoute {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string;
  readonly assignedTo: string | null;
  readonly status: RouteStatus;
  readonly createdAt: string;
}

/**
 * The exact fields today's PATCH /api/admin/runs/[id] selects back —
 * `{ id, name, planned_date, status }` in the wire, camelCase here.
 */
export interface RouteStatusRow {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string;
  readonly status: RouteStatus;
}
