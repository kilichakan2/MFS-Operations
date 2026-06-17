/**
 * lib/ports/__contracts__/RoutesRepository.contract.ts
 *
 * Shared behavioural contract for RoutesRepository (F-14). Both adapters
 * — the Supabase real implementation and the Fake in-memory twin — pass
 * the SAME suite (F-06 template). The Fake can never quietly drift from
 * the real database's behaviour because they sit the same exam.
 *
 * Adapter-agnostic by construction: imports the PORT type
 * (`RoutesRepository`), domain types, and Vitest primitives — nothing else.
 *
 * Setup contract (each adapter's test file supplies this):
 *   - `repo`         — the adapter under test.
 *   - `assignedTo`   — a user id valid as routes.assigned_to (FK).
 *   - `otherUserId`  — a DIFFERENT user id, for the "ignores other users"
 *                      case in getNextRouteForUser.
 *   - `customerId`   — a customer id valid as route_stops.customer_id (FK).
 *   - `cleanup()`    — deletes every route this case created (cascades stops).
 *
 * Each case builds its OWN routes via `repo.createRoute(...)` so the suite
 * never depends on pre-seeded fixtures, and registers them for cleanup.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { RoutesRepository } from "@/lib/ports";
import type { CreateRoutePersist, StopInput } from "@/lib/domain";

export interface RoutesContractSetup {
  repo: RoutesRepository;
  /** A user id valid as routes.assigned_to (FK-satisfying in the real DB). */
  assignedTo: string;
  /** A DIFFERENT valid user id (for the "ignores other users" case). */
  otherUserId: string;
  /** A customer id valid as route_stops.customer_id (FK-satisfying). */
  customerId: string;
  /** Remove every route this contract run created (route_stops cascade). */
  cleanup: () => Promise<void>;
}

export function routesRepositoryContract(
  setup: () => Promise<RoutesContractSetup>,
): void {
  describe("RoutesRepository contract", () => {
    let ctx: RoutesContractSetup;
    // Track route ids created in each case so cleanup is exact.
    const createdIds: string[] = [];

    // Helpers bound to the current ctx ────────────────────────────

    function stop(
      position: number,
      over: Partial<StopInput> = {},
    ): StopInput {
      return {
        customerId: ctx.customerId,
        position,
        priority: "none",
        lockedPosition: false,
        priorityNote: null,
        estimatedArrival: null,
        driveTimeFromPrevMin: null,
        distanceFromPrevKm: null,
        ...over,
      };
    }

    function routeInput(
      over: Partial<CreateRoutePersist> = {},
    ): CreateRoutePersist {
      return {
        name: "ANVIL-TEST-route",
        plannedDate: "2026-06-20",
        assignedTo: ctx.assignedTo,
        createdBy: ctx.assignedTo,
        departureTime: "08:00",
        endPoint: "mfs",
        stops: [stop(1), stop(2)],
        totalDistanceKm: null,
        totalDurationMin: null,
        googleMapsUrl: null,
        ...over,
      };
    }

    async function create(over: Partial<CreateRoutePersist> = {}) {
      const created = await ctx.repo.createRoute(routeInput(over));
      createdIds.push(created.id);
      return created;
    }

    // The contract supplies a fresh ctx per case via a closure; we build
    // it once here (Routes have FK setup that's cheap to reuse) and clean
    // created rows after each case.
    afterEach(async () => {
      await ctx.cleanup();
      createdIds.length = 0;
    });

    // ─── createRoute ────────────────────────────────────────────

    it("createRoute persists the header and its stops, read back position-sorted", async () => {
      ctx = await setup();
      const created = await create({
        name: "ANVIL-TEST-create",
        // supply stops out of order to prove the read sorts them
        stops: [
          {
            customerId: ctx.customerId,
            position: 2,
            priority: "urgent",
            lockedPosition: false,
            priorityNote: null,
            estimatedArrival: null,
            driveTimeFromPrevMin: null,
            distanceFromPrevKm: null,
          },
          {
            customerId: ctx.customerId,
            position: 1,
            priority: "none",
            lockedPosition: true,
            priorityNote: "first",
            estimatedArrival: null,
            driveTimeFromPrevMin: null,
            distanceFromPrevKm: null,
          },
        ],
      });
      expect(created.id).toBeTruthy();
      expect(created.name).toBe("ANVIL-TEST-create");
      expect(created.status).toBe("active"); // create literal
      expect(created.assignedTo).toBe(ctx.assignedTo);
      expect(typeof created.createdAt).toBe("string");

      const full = await ctx.repo.getRouteById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("route was null after expect");
      expect(full.stops.map((s) => s.position)).toEqual([1, 2]);
      expect(full.stops[0].lockedPosition).toBe(true);
      expect(full.stops[0].priorityNote).toBe("first");
      expect(full.stops[1].priority).toBe("urgent");
      // a fresh stop has not been visited
      expect(full.stops[0].visited).toBe(false);
    });

    it("createRoute rolls back the header if a stop insert fails (duplicate position)", async () => {
      ctx = await setup();
      // Two stops at the SAME position violate UNIQUE(route_id, position).
      // The real adapter trips the constraint; the Fake mirrors it. Either
      // way the route header must NOT survive (rollback).
      await expect(
        ctx.repo.createRoute(
          routeInput({
            name: "ANVIL-TEST-rollback",
            stops: [stop(1), stop(1)],
          }),
        ),
      ).rejects.toBeTruthy();

      // No header should have been left behind: a list for that plannedDate
      // assigned to us must not contain a rolled-back "ANVIL-TEST-rollback".
      const list = await ctx.repo.listRoutes({
        plannedDate: "2026-06-20",
        assignedTo: ctx.assignedTo,
        all: false,
      });
      expect(list.some((r) => r.name === "ANVIL-TEST-rollback")).toBe(false);
    });

    // ─── getRouteById ───────────────────────────────────────────

    it("getRouteById returns the full aggregate with joins", async () => {
      ctx = await setup();
      const created = await create({ name: "ANVIL-TEST-byid" });
      const full = await ctx.repo.getRouteById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("route was null after expect");
      expect(full.id).toBe(created.id);
      expect(full.plannedDate).toBe("2026-06-20");
      expect(full.status).toBe("active");
      expect(full.endPoint).toBe("mfs");
      expect(full.assignee).not.toBeNull();
      expect(full.assignee?.id).toBe(ctx.assignedTo);
      expect(full.stops.length).toBe(2);
      expect(full.stops[0].customer).not.toBeNull();
      expect(full.stops[0].customer?.id).toBe(ctx.customerId);
    });

    it("getRouteById returns null on miss (does NOT throw)", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fe";
      const full = await ctx.repo.getRouteById(missing);
      expect(full).toBeNull();
    });

    // ─── replaceRoute ───────────────────────────────────────────

    it("replaceRoute swaps the stops entirely; reusing a position does not collide", async () => {
      ctx = await setup();
      const created = await create({
        name: "ANVIL-TEST-replace",
        stops: [stop(1), stop(2), stop(3)],
      });

      // Replace with a brand-new set that REUSES positions 1 and 2. The
      // delete-then-insert ordering must clear the old stops first so the
      // UNIQUE(route_id, position) constraint never collides.
      await ctx.repo.replaceRoute(created.id, {
        name: "ANVIL-TEST-replaced",
        plannedDate: "2026-06-21",
        assignedTo: ctx.assignedTo,
        departureTime: "09:30",
        endPoint: "ozmen_john_street",
        stops: [stop(1, { priority: "priority" }), stop(2)],
        totalDistanceKm: 12.5,
        totalDurationMin: 40,
        googleMapsUrl: "https://maps.example/test",
      });

      const full = await ctx.repo.getRouteById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("route was null after expect");
      // header updated
      expect(full.name).toBe("ANVIL-TEST-replaced");
      expect(full.plannedDate).toBe("2026-06-21");
      expect(full.departureTime).toMatch(/^09:30/);
      expect(full.endPoint).toBe("ozmen_john_street");
      expect(full.totalDistanceKm).toBe(12.5);
      expect(full.totalDurationMin).toBe(40);
      // exactly the new stop set, position-sorted
      expect(full.stops.map((s) => s.position)).toEqual([1, 2]);
      expect(full.stops[0].priority).toBe("priority");
    });

    // ─── getNextRouteForUser ────────────────────────────────────

    it("getNextRouteForUser returns the soonest active/draft on or after minDate", async () => {
      ctx = await setup();
      // Three dates for the same user; the soonest >= minDate wins.
      await create({ name: "ANVIL-TEST-past", plannedDate: "2026-06-10" });
      await create({ name: "ANVIL-TEST-soon", plannedDate: "2026-06-20" });
      await create({ name: "ANVIL-TEST-later", plannedDate: "2026-06-25" });

      const next = await ctx.repo.getNextRouteForUser(
        ctx.assignedTo,
        "2026-06-15",
      );
      expect(next).not.toBeNull();
      expect(next?.name).toBe("ANVIL-TEST-soon");
    });

    it("getNextRouteForUser tie-breaks by departure_time ascending", async () => {
      ctx = await setup();
      await create({
        name: "ANVIL-TEST-late-departure",
        plannedDate: "2026-06-20",
        departureTime: "14:00",
      });
      await create({
        name: "ANVIL-TEST-early-departure",
        plannedDate: "2026-06-20",
        departureTime: "06:00",
      });
      const next = await ctx.repo.getNextRouteForUser(
        ctx.assignedTo,
        "2026-06-20",
      );
      expect(next?.name).toBe("ANVIL-TEST-early-departure");
    });

    it("getNextRouteForUser ignores other users and completed routes; null on none", async () => {
      ctx = await setup();
      // A route for a DIFFERENT user — must be ignored.
      await create({
        name: "ANVIL-TEST-other-user",
        plannedDate: "2026-06-20",
        assignedTo: ctx.otherUserId,
        createdBy: ctx.otherUserId,
      });
      // A completed route for OUR user — must be ignored.
      const done = await create({
        name: "ANVIL-TEST-completed",
        plannedDate: "2026-06-20",
      });
      await ctx.repo.setRouteStatus(done.id, "completed");

      const next = await ctx.repo.getNextRouteForUser(
        ctx.assignedTo,
        "2026-06-20",
      );
      expect(next).toBeNull();
    });

    // ─── listRoutes ─────────────────────────────────────────────

    it("listRoutes honours plannedDate + assignedTo filters", async () => {
      ctx = await setup();
      await create({ name: "ANVIL-TEST-day20", plannedDate: "2026-06-20" });
      await create({ name: "ANVIL-TEST-day21", plannedDate: "2026-06-21" });

      const day20 = await ctx.repo.listRoutes({
        plannedDate: "2026-06-20",
        assignedTo: ctx.assignedTo,
        all: false,
      });
      const names = day20.map((r) => r.name);
      expect(names).toContain("ANVIL-TEST-day20");
      expect(names).not.toContain("ANVIL-TEST-day21");
      // stops are position-sorted within each route
      for (const r of day20) {
        const positions = r.stops.map((s) => s.position);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    });

    it("listRoutes with all=true ignores the plannedDate filter", async () => {
      ctx = await setup();
      await create({ name: "ANVIL-TEST-allA", plannedDate: "2026-06-20" });
      await create({ name: "ANVIL-TEST-allB", plannedDate: "2026-06-28" });

      const all = await ctx.repo.listRoutes({
        assignedTo: ctx.assignedTo,
        all: true,
      });
      const names = all.map((r) => r.name);
      expect(names).toContain("ANVIL-TEST-allA");
      expect(names).toContain("ANVIL-TEST-allB");
    });

    // ─── listRouteSummaries ─────────────────────────────────────

    it("listRouteSummaries returns rows in range with correct stopCount, ordered", async () => {
      ctx = await setup();
      await create({
        name: "ANVIL-TEST-sum-mid",
        plannedDate: "2026-06-20",
        departureTime: "10:00",
        stops: [stop(1), stop(2), stop(3)],
      });
      await create({
        name: "ANVIL-TEST-sum-early",
        plannedDate: "2026-06-20",
        departureTime: "07:00",
        stops: [stop(1)],
      });
      // Out of range — must be excluded.
      await create({
        name: "ANVIL-TEST-sum-out",
        plannedDate: "2026-07-15",
        stops: [stop(1)],
      });

      const summaries = await ctx.repo.listRouteSummaries(
        "2026-06-16",
        "2026-06-22",
      );
      const mine = summaries.filter((s) =>
        ["ANVIL-TEST-sum-mid", "ANVIL-TEST-sum-early", "ANVIL-TEST-sum-out"].includes(
          s.name ?? "",
        ),
      );
      const names = mine.map((s) => s.name);
      expect(names).toContain("ANVIL-TEST-sum-early");
      expect(names).toContain("ANVIL-TEST-sum-mid");
      expect(names).not.toContain("ANVIL-TEST-sum-out");

      const early = mine.find((s) => s.name === "ANVIL-TEST-sum-early");
      const mid = mine.find((s) => s.name === "ANVIL-TEST-sum-mid");
      expect(early?.stopCount).toBe(1);
      expect(mid?.stopCount).toBe(3);
      // summaries carry NO stops array (the thin index card)
      expect(
        Object.keys(early as unknown as Record<string, unknown>),
      ).not.toContain("stops");

      // ordered planned_date asc then departure_time asc → early before mid
      const earlyIdx = mine.findIndex((s) => s.name === "ANVIL-TEST-sum-early");
      const midIdx = mine.findIndex((s) => s.name === "ANVIL-TEST-sum-mid");
      expect(earlyIdx).toBeLessThan(midIdx);
    });

    // ─── setRouteStatus ─────────────────────────────────────────

    it("setRouteStatus updates and returns the trimmed row", async () => {
      ctx = await setup();
      const created = await create({ name: "ANVIL-TEST-status" });
      const row = await ctx.repo.setRouteStatus(created.id, "completed");
      expect(row).not.toBeNull();
      expect(row?.id).toBe(created.id);
      expect(row?.name).toBe("ANVIL-TEST-status");
      expect(row?.status).toBe("completed");
      expect(row?.plannedDate).toBe("2026-06-20");

      const full = await ctx.repo.getRouteById(created.id);
      expect(full?.status).toBe("completed");
    });

    it("setRouteStatus returns null on a missing id", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fd";
      const row = await ctx.repo.setRouteStatus(missing, "active");
      expect(row).toBeNull();
    });

    // ─── deleteRoute ────────────────────────────────────────────

    it("deleteRoute removes the route and cascades its stops", async () => {
      ctx = await setup();
      const created = await create({ name: "ANVIL-TEST-delete" });
      await ctx.repo.deleteRoute(created.id);
      const gone = await ctx.repo.getRouteById(created.id);
      expect(gone).toBeNull();
    });

    it("deleteRoute on a missing id is not an error (idempotent)", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fc";
      await expect(ctx.repo.deleteRoute(missing)).resolves.toBeUndefined();
    });
  });
}
