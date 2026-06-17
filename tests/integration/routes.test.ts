/**
 * tests/integration/routes.test.ts
 *
 * Integration tests for the 5 Routes API endpoints after the F-14 PR2
 * re-point through `routesService`. Hits the running Next.js dev server with
 * cookie-based auth (the `api()` helper). These assert the wire shapes are
 * byte-identical to the pre-F-14 output — the ONE approved exception is N2:
 * GET /api/routes/[id] stops now include `visited` (aligning /[id] with
 * /today).
 *
 * Each test seeds its own route via POST /api/routes and removes it in
 * afterAll, so no pre-seeded fixture is required.
 *
 * Prereqs: npm run db:up (once) + the dev server the runner auto-boots.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  type TestUserSet,
} from "./_setup";

describe("/api/routes + /api/admin/runs integration (F-14 PR2 re-point)", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  const createdRouteIds = new Set<string>();

  // A planned date inside the current-week default is not guaranteed, so the
  // admin/runs tests pass explicit from/to bounds around PLANNED_DATE.
  const PLANNED_DATE = "2026-09-15"; // a Tuesday, well clear of "today"

  async function createRoute(over: Record<string, unknown> = {}) {
    const res = await api("/api/routes", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: {
        name: "ANVIL-TEST-route",
        plannedDate: PLANNED_DATE,
        assignedTo: users.driver.id,
        departureTime: "08:00",
        endPoint: "mfs",
        stops: [
          { customerId: customer.id, position: 1, priority: "none", lockedPosition: false },
          { customerId: customer.id, position: 2, priority: "urgent", lockedPosition: true },
        ],
        ...over,
      },
    });
    if (res.status === 201) {
      const body = res.body as { route: { id: string } };
      createdRouteIds.add(body.route.id);
    }
    return res;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
  }, 30_000);

  afterAll(async () => {
    if (createdRouteIds.size === 0) return;
    const supa = getServiceClient();
    await supa.from("routes").delete().in("id", [...createdRouteIds]);
    createdRouteIds.clear();
  }, 30_000);

  // ── Auth gates ──────────────────────────────────────────────

  it("GET /api/routes 401s without a user id (no cookies → middleware 307)", async () => {
    // No cookies → middleware redirects before the handler (307).
    const res = await api("/api/routes", { method: "GET" });
    expect(res.status).toBe(307);
  });

  it("PATCH /api/admin/runs/[id] 403s for a non-admin role", async () => {
    const created = await createRoute();
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/admin/runs/${id}`, {
      method: "PATCH",
      role: "driver",
      userId: users.driver.id,
      body: { status: "completed" },
    });
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe("Admin only");
  });

  // ── POST /api/routes ────────────────────────────────────────

  it("POST /api/routes returns 201 with { route, stopCount } echo shape", async () => {
    const res = await createRoute({ name: "ANVIL-TEST-post" });
    expect(res.status).toBe(201);
    const body = res.body as {
      route: Record<string, unknown>;
      stopCount: number;
    };
    expect(body.stopCount).toBe(2);
    // exactly the keys today's POST echoed (snake_case)
    expect(Object.keys(body.route).sort()).toEqual(
      ["assigned_to", "created_at", "id", "name", "planned_date", "status"].sort(),
    );
    expect(body.route.status).toBe("active");
    expect(body.route.name).toBe("ANVIL-TEST-post");
    expect(body.route.assigned_to).toBe(users.driver.id);
    expect(body.route.planned_date).toBe(PLANNED_DATE);
    expect(typeof body.route.created_at).toBe("string");
  });

  it("POST /api/routes 400s on missing plannedDate / assignedTo / stops", async () => {
    const noDate = await api("/api/routes", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { assignedTo: users.driver.id, stops: [{ customerId: customer.id, position: 1 }] },
    });
    expect(noDate.status).toBe(400);
    expect((noDate.body as { error: string }).error).toBe("plannedDate required");

    const noAssignee = await api("/api/routes", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { plannedDate: PLANNED_DATE, stops: [{ customerId: customer.id, position: 1 }] },
    });
    expect(noAssignee.status).toBe(400);
    expect((noAssignee.body as { error: string }).error).toBe("assignedTo required");

    const noStops = await api("/api/routes", {
      method: "POST",
      role: "admin",
      userId: users.admin.id,
      body: { plannedDate: PLANNED_DATE, assignedTo: users.driver.id, stops: [] },
    });
    expect(noStops.status).toBe(400);
    expect((noStops.body as { error: string }).error).toBe("stops required");
  });

  // ── GET /api/routes (list) ──────────────────────────────────

  it("GET /api/routes?all=true returns the full list wire shape with creator + created_at + visited", async () => {
    await createRoute({ name: "ANVIL-TEST-list" });
    const res = await api(`/api/routes?all=true&assignedTo=${users.driver.id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as { routes: Record<string, unknown>[] };
    expect(Array.isArray(body.routes)).toBe(true);
    const mine = body.routes.find((r) => r.name === "ANVIL-TEST-list");
    expect(mine).toBeTruthy();
    if (!mine) throw new Error("listed route not found");
    // both the bare assigned_to column AND the assignee join are present
    expect(mine.assigned_to).toBe(users.driver.id);
    expect(mine.assignee).toMatchObject({ id: users.driver.id });
    // the list includes created_at + the creator join (unlike /[id] and /today)
    expect(typeof mine.created_at).toBe("string");
    expect(mine.creator).toMatchObject({ id: users.admin.id });
    // stops carry visited + customer
    const stops = mine.route_stops as Record<string, unknown>[];
    expect(stops.length).toBe(2);
    expect(stops[0].position).toBe(1);
    expect(stops[0]).toHaveProperty("visited");
    expect(stops[0].customer).toMatchObject({ id: customer.id });
  });

  // ── GET /api/routes/[id] ────────────────────────────────────

  it("GET /api/routes/[id] returns { route } — stops include visited (N2), NO created_at/creator", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-byid" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/routes/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const route = (res.body as { route: Record<string, unknown> }).route;
    // byte-identical: NO top-level created_at / creator
    expect(route).not.toHaveProperty("created_at");
    expect(route).not.toHaveProperty("creator");
    // both assigned_to column and assignee join present
    expect(route.assigned_to).toBe(users.driver.id);
    expect(route.assignee).toMatchObject({ id: users.driver.id });
    const stops = route.route_stops as Record<string, unknown>[];
    expect(stops.map((s) => s.position)).toEqual([1, 2]);
    // N2: the [id] stop shape now includes `visited`
    expect(stops[0]).toHaveProperty("visited");
    expect(stops[0].visited).toBe(false);
    expect(stops[0].customer).toMatchObject({ id: customer.id });
  });

  it("GET /api/routes/[id] 404s on a missing id", async () => {
    const res = await api("/api/routes/00000000-0000-0000-0000-0000000000fe", {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("Route not found");
  });

  // ── GET /api/routes/today ───────────────────────────────────

  it("GET /api/routes/today returns { route } | { route: null } with visited, no created_at/creator", async () => {
    // Seed a future-dated route for the driver so today's query (>= effective
    // min date) finds *a* route. Note: today returns the SOONEST active/draft
    // route on/after the effective date, which may be an earlier route another
    // case seeded for this driver — so assert the wire SHAPE, not a specific id.
    await createRoute({ name: "ANVIL-TEST-today", plannedDate: "2027-01-04" });
    const res = await api(`/api/routes/today?userId=${users.driver.id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const route = (res.body as { route: Record<string, unknown> | null }).route;
    expect(route).not.toBeNull();
    if (!route) throw new Error("today route was null");
    // byte-identical: NO top-level created_at / creator on the /today wire
    expect(route).not.toHaveProperty("created_at");
    expect(route).not.toHaveProperty("creator");
    // both the bare assigned_to column and the assignee join present
    expect(route.assigned_to).toBe(users.driver.id);
    expect(route.assignee).toMatchObject({ id: users.driver.id });
    const stops = route.route_stops as Record<string, unknown>[];
    expect(stops.length).toBeGreaterThan(0);
    expect(stops[0]).toHaveProperty("visited");
    expect(stops[0].customer).not.toBeUndefined();
  });

  // ── GET /api/admin/runs ─────────────────────────────────────

  it("GET /api/admin/runs returns { runs, from, to } with stop_count + trimmed assignee", async () => {
    await createRoute({ name: "ANVIL-TEST-run" });
    const res = await api(
      `/api/admin/runs?from=2026-09-14&to=2026-09-20`,
      { method: "GET", role: "admin", userId: users.admin.id },
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      runs: Record<string, unknown>[];
      from: string;
      to: string;
    };
    expect(body.from).toBe("2026-09-14");
    expect(body.to).toBe("2026-09-20");
    const mine = body.runs.find((r) => r.name === "ANVIL-TEST-run");
    expect(mine).toBeTruthy();
    if (!mine) throw new Error("run not found");
    // the thin index card: stop_count present, NO route_stops array
    expect(mine.stop_count).toBe(2);
    expect(mine).not.toHaveProperty("route_stops");
    // assignee is the trimmed { id, name } — NO role key on the runs list
    expect(mine.assignee).toMatchObject({ id: users.driver.id });
    expect(mine.assignee).not.toHaveProperty("role");
    // header-ish snake_case keys preserved
    expect(mine).toHaveProperty("planned_date");
    expect(mine).toHaveProperty("departure_time");
    expect(mine).toHaveProperty("end_point");
    expect(mine).toHaveProperty("total_distance_km");
    expect(mine).toHaveProperty("total_duration_min");
  });

  it("GET /api/admin/runs defaults to the current UK Mon–Sun week when from/to omitted", async () => {
    const res = await api("/api/admin/runs", {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const body = res.body as { from: string; to: string };
    // Monday <= Sunday and exactly 6 days apart.
    const from = new Date(body.from + "T00:00:00");
    const to = new Date(body.to + "T00:00:00");
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    expect(days).toBe(6);
    expect(from.getDay()).toBe(1); // Monday
    expect(to.getDay()).toBe(0); // Sunday
  });

  // ── PUT /api/routes/[id] ────────────────────────────────────

  it("PUT /api/routes/[id] replaces header + stops, returns { id, updated: true }", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-put" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/routes/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: {
        name: "ANVIL-TEST-put-edited",
        plannedDate: PLANNED_DATE,
        assignedTo: users.driver.id,
        departureTime: "09:30",
        endPoint: "ozmen_john_street",
        stops: [
          { customerId: customer.id, position: 1, priority: "priority", lockedPosition: false },
        ],
        totalDistanceKm: 12.5,
        totalDurationMin: 40,
        googleMapsUrl: "https://maps.example/x",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, updated: true });

    // verify the replace landed
    const after = await api(`/api/routes/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    const route = (after.body as { route: Record<string, unknown> }).route;
    expect(route.name).toBe("ANVIL-TEST-put-edited");
    expect(route.end_point).toBe("ozmen_john_street");
    const stops = route.route_stops as Record<string, unknown>[];
    expect(stops.length).toBe(1);
    expect(stops[0].priority).toBe("priority");
  });

  it("W-NUM: numeric distance fields are emitted as JSON numbers, not strings", async () => {
    // Pin the W-NUM deviation: the two Postgres `numeric` columns
    // (routes.total_distance_km, route_stops.distance_from_prev_km) must come
    // back over the GET wire as JSON numbers, never quoted strings. Seed
    // non-null distances via PUT so the assertion is meaningful, then read back
    // through GET /api/routes/[id].
    const created = await createRoute({ name: "ANVIL-TEST-wnum" });
    const id = (created.body as { route: { id: string } }).route.id;

    const put = await api(`/api/routes/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: {
        name: "ANVIL-TEST-wnum",
        plannedDate: PLANNED_DATE,
        assignedTo: users.driver.id,
        departureTime: "08:00",
        endPoint: "mfs",
        stops: [
          {
            customerId: customer.id,
            position: 1,
            priority: "none",
            lockedPosition: false,
            distanceFromPrevKm: 3.7,
          },
        ],
        totalDistanceKm: 12.5,
        totalDurationMin: 40,
      },
    });
    expect(put.status).toBe(200);

    const res = await api(`/api/routes/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(200);
    const route = (res.body as { route: Record<string, unknown> }).route;
    // Header numeric: a real JSON number, with the seeded value preserved.
    expect(route.total_distance_km).not.toBeNull();
    expect(typeof route.total_distance_km).toBe("number");
    expect(route.total_distance_km).toBe(12.5);
    // Per-stop numeric: the stop with a non-null distance comes back as a number.
    const stops = route.route_stops as Record<string, unknown>[];
    const withDistance = stops.find((s) => s.distance_from_prev_km !== null);
    expect(withDistance).toBeTruthy();
    if (!withDistance) throw new Error("no stop with a non-null distance_from_prev_km");
    expect(typeof withDistance.distance_from_prev_km).toBe("number");
    expect(withDistance.distance_from_prev_km).toBe(3.7);
  });

  it("PUT /api/routes/[id] 400s on missing required fields and on empty stops", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-put400" });
    const id = (created.body as { route: { id: string } }).route.id;

    const missing = await api(`/api/routes/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: { plannedDate: PLANNED_DATE }, // no assignedTo/departureTime/endPoint
    });
    expect(missing.status).toBe(400);
    expect((missing.body as { error: string }).error).toBe("Missing required fields");

    const noStops = await api(`/api/routes/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: {
        plannedDate: PLANNED_DATE,
        assignedTo: users.driver.id,
        departureTime: "08:00",
        endPoint: "mfs",
        stops: [],
      },
    });
    expect(noStops.status).toBe(400);
    expect((noStops.body as { error: string }).error).toBe(
      "Route must have at least one stop",
    );
  });

  it("PUT /api/routes/[id] reproduces the stop-insert partial-failure message verbatim", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-put-partial" });
    const id = (created.body as { route: { id: string } }).route.id;
    // Two stops at the SAME position trip UNIQUE(route_id, position) on the
    // insert step (header + delete already succeeded). The adapter throws the
    // exact human message today's route returned.
    const res = await api(`/api/routes/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: {
        plannedDate: PLANNED_DATE,
        assignedTo: users.driver.id,
        departureTime: "08:00",
        endPoint: "mfs",
        stops: [
          { customerId: customer.id, position: 1, priority: "none", lockedPosition: false },
          { customerId: customer.id, position: 1, priority: "none", lockedPosition: false },
        ],
      },
    });
    expect(res.status).toBe(500);
    const msg = (res.body as { error: string }).error;
    expect(msg.startsWith("Route header saved but stops could not be written: ")).toBe(true);
    expect(msg.endsWith(". Please re-save to restore stops.")).toBe(true);
  });

  // ── PATCH + DELETE /api/admin/runs/[id] ─────────────────────

  it("PATCH /api/admin/runs/[id] updates status and returns the bare snake_case row (200)", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-patch" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/admin/runs/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { status: "completed" },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // bare row, NOT wrapped in { route }
    expect(Object.keys(body).sort()).toEqual(
      ["id", "name", "planned_date", "status"].sort(),
    );
    expect(body.id).toBe(id);
    expect(body.status).toBe("completed");
    expect(body.name).toBe("ANVIL-TEST-patch");
  });

  it("PATCH /api/admin/runs/[id] 400s on an invalid status", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-patch400" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/admin/runs/${id}`, {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      body: { status: "bogus" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("status must be one of");
  });

  it("DELETE /api/admin/runs/[id] removes the route and returns 204", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-delete" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/admin/runs/${id}`, {
      method: "DELETE",
      role: "admin",
      userId: users.admin.id,
    });
    expect(res.status).toBe(204);
    expect(res.raw).toBe("");
    createdRouteIds.delete(id); // already gone

    // gone → GET now 404s
    const after = await api(`/api/routes/${id}`, {
      method: "GET",
      role: "admin",
      userId: users.admin.id,
    });
    expect(after.status).toBe(404);
  });

  it("DELETE /api/admin/runs/[id] 403s for a non-admin", async () => {
    const created = await createRoute({ name: "ANVIL-TEST-delete403" });
    const id = (created.body as { route: { id: string } }).route.id;
    const res = await api(`/api/admin/runs/${id}`, {
      method: "DELETE",
      role: "driver",
      userId: users.driver.id,
    });
    expect(res.status).toBe(403);
  });
});
