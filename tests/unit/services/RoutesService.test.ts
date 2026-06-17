/**
 * tests/unit/services/RoutesService.test.ts
 *
 * Unit tests for RoutesService — the business brain (no DB). The headline
 * cases pin the two date decisions the service OWNS (R5):
 *   - the 7pm UK rollover: 18:59 → minDate = today; 19:00 → tomorrow,
 *     asserted by spying on the exact `minDate` string handed to the repo.
 *   - the Mon–Sun week boundary default on listWeekRuns.
 * Plus: passthrough methods delegate to the port unchanged.
 *
 * The service is tested against the Fake adapter (and a thin spy repo for
 * the argument-capture cases) — never Supabase. The clock is fixed by
 * passing an explicit `atTime` so the boundary is deterministic.
 */
import { describe, it, expect, vi } from "vitest";
import { createRoutesService } from "@/lib/services";
import { createFakeRoutesRepository } from "@/lib/adapters/fake";
import type { RoutesRepository } from "@/lib/ports";
import type { RouteWithStops } from "@/lib/domain";

const USER = "00000000-0000-0000-0000-0000000000a1";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

function fakeWithPeople() {
  return createFakeRoutesRepository({
    people: {
      [USER]: { id: USER, name: "ANVIL-FAKE-driver", role: "driver" },
    },
    customers: {
      [CUSTOMER]: {
        id: CUSTOMER,
        name: "ANVIL-FAKE-customer",
        postcode: null,
        lat: null,
        lng: null,
      },
    },
  });
}

// ─── 7pm rollover (the headline business-logic test) ───────────────────

describe("RoutesService — 7pm UK rollover (getNextRouteForUser)", () => {
  it("at 18:59 UK (winter) → minDate handed to repo is TODAY", async () => {
    // 2026-01-20 18:30 UTC = 18:30 UK (GMT) → hour 18 → no rollover.
    const spy = vi.fn().mockResolvedValue(null);
    const repo = {
      getNextRouteForUser: spy,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    await service.getNextRouteForUser(USER, new Date("2026-01-20T18:30:00Z"));

    expect(spy).toHaveBeenCalledWith(USER, "2026-01-20");
  });

  it("at 19:00 UK (winter) → minDate handed to repo rolls to TOMORROW", async () => {
    // 2026-01-20 19:01 UTC = 19:01 UK (GMT) → hour 19 → rollover.
    const spy = vi.fn().mockResolvedValue(null);
    const repo = {
      getNextRouteForUser: spy,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    await service.getNextRouteForUser(USER, new Date("2026-01-20T19:01:00Z"));

    expect(spy).toHaveBeenCalledWith(USER, "2026-01-21");
  });

  it("BST trap: 18:01 UTC in summer is already 19:01 UK → rolls to tomorrow", async () => {
    const spy = vi.fn().mockResolvedValue(null);
    const repo = {
      getNextRouteForUser: spy,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    await service.getNextRouteForUser(USER, new Date("2026-07-20T18:01:00Z"));

    expect(spy).toHaveBeenCalledWith(USER, "2026-07-21");
  });

  it("returns the route the repo resolves for the computed minDate", async () => {
    // End-to-end through the Fake: a route on 2026-01-21 is found when the
    // 19:00 rollover pushes minDate to that date.
    const repo = fakeWithPeople();
    const service = createRoutesService({ routes: repo });
    const created = await repo.createRoute({
      name: "tomorrow-route",
      plannedDate: "2026-01-21",
      assignedTo: USER,
      createdBy: USER,
      departureTime: "08:00",
      endPoint: "mfs",
      stops: [
        {
          customerId: CUSTOMER,
          position: 1,
          priority: "none",
          lockedPosition: false,
          priorityNote: null,
          estimatedArrival: null,
          driveTimeFromPrevMin: null,
          distanceFromPrevKm: null,
        },
      ],
      totalDistanceKm: null,
      totalDurationMin: null,
      googleMapsUrl: null,
    });

    const next = (await service.getNextRouteForUser(
      USER,
      new Date("2026-01-20T19:01:00Z"),
    )) as RouteWithStops;
    expect(next).not.toBeNull();
    expect(next.id).toBe(created.id);
  });
});

// ─── Mon–Sun week boundary default (listWeekRuns) ──────────────────────

describe("RoutesService — listWeekRuns week-boundary default", () => {
  it("with no args, defaults the bounds to the current UK Mon–Sun week", async () => {
    const spy = vi.fn().mockResolvedValue([]);
    const repo = {
      listRouteSummaries: spy,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    const result = await service.listWeekRuns();

    // Bounds are a Monday..Sunday pair (7-day span, Monday start).
    expect(spy).toHaveBeenCalledTimes(1);
    const [from, to] = spy.mock.calls[0] as [string, string];
    const fromDate = new Date(from + "T12:00:00");
    const toDate = new Date(to + "T12:00:00");
    expect(fromDate.getDay()).toBe(1); // Monday
    expect(toDate.getDay()).toBe(0); // Sunday
    const spanDays =
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(spanDays).toBe(6);
    // The resolved bounds are echoed back on the result (wire shape).
    expect(result.from).toBe(from);
    expect(result.to).toBe(to);
  });

  it("explicit from/to override the default and are passed through verbatim", async () => {
    const spy = vi.fn().mockResolvedValue([]);
    const repo = {
      listRouteSummaries: spy,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    const result = await service.listWeekRuns("2026-03-01", "2026-03-07");

    expect(spy).toHaveBeenCalledWith("2026-03-01", "2026-03-07");
    expect(result.from).toBe("2026-03-01");
    expect(result.to).toBe("2026-03-07");
  });
});

// ─── passthrough delegation ────────────────────────────────────────────

describe("RoutesService — passthrough methods delegate to the port", () => {
  it("listRoutes / getRouteById / setRouteStatus / deleteRoute delegate unchanged", async () => {
    const listRoutes = vi.fn().mockResolvedValue([]);
    const getRouteById = vi.fn().mockResolvedValue(null);
    const createRoute = vi.fn().mockResolvedValue({ id: "x" });
    const replaceRoute = vi.fn().mockResolvedValue(undefined);
    const setRouteStatus = vi.fn().mockResolvedValue(null);
    const deleteRoute = vi.fn().mockResolvedValue(undefined);
    const repo = {
      listRoutes,
      getRouteById,
      createRoute,
      replaceRoute,
      setRouteStatus,
      deleteRoute,
    } as unknown as RoutesRepository;
    const service = createRoutesService({ routes: repo });

    const filter = { assignedTo: USER, all: false };
    await service.listRoutes(filter);
    expect(listRoutes).toHaveBeenCalledWith(filter);

    await service.getRouteById("r1");
    expect(getRouteById).toHaveBeenCalledWith("r1");

    await service.setRouteStatus("r1", "completed");
    expect(setRouteStatus).toHaveBeenCalledWith("r1", "completed");

    await service.deleteRoute("r1");
    expect(deleteRoute).toHaveBeenCalledWith("r1");

    // saveRoute delegates to the port's replaceRoute (name maps through).
    const saveInput = {
      name: null,
      plannedDate: "2026-06-20",
      assignedTo: USER,
      departureTime: "08:00",
      endPoint: "mfs" as const,
      stops: [],
      totalDistanceKm: null,
      totalDurationMin: null,
      googleMapsUrl: null,
    };
    await service.saveRoute("r1", saveInput);
    expect(replaceRoute).toHaveBeenCalledWith("r1", saveInput);
  });
});
