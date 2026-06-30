/**
 * tests/integration/haccpHubUiPhase1.test.ts
 *
 * Integration test for the HACCP hub UI Phase 1 rebuild (ADR-0014 Tier A).
 *
 * The ONLY backend change in this unit is delta #3 — the honest progress
 * denominator: `HaccpReportingService.getTodayStatus` now counts the full
 * EIGHT mandatory daily checks (cold AM/PM, room AM/PM, diary opening /
 * operational / closing, cleaning) instead of 6. Everything else is
 * presentation.
 *
 * This drives the LIVE `GET /api/haccp/today-status` HTTP route on the
 * booted local-wired dev server (real route → service → Supabase repo),
 * so it proves the delta lands through the whole stack AND — critically —
 * that the response SHAPE is unchanged, so no consumer (`page.tsx`,
 * `useHACCPAlarm`, the audit/overview surfaces) breaks.
 *
 * Why a dedicated file (vs the existing haccpReportingRoutes.test.ts which
 * spot-checks the shape): that suite predates the 6→8 change and only
 * asserts `total_checks` is "a number". This file pins the EXACT new
 * contract value (=== 8) and the completed/total relationship, so a future
 * regression to 6 is caught at the HTTP layer, not just the unit oracle.
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed). Run via
 * npm run test:integration (auto-boots the local-wired dev server).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { api, setupTestUsers, type TestUserSet } from "./_setup";

// Every field the home screen + alarm + reporting consumers read off
// today-status. If the rebuild dropped any of these, a consumer breaks.
// Mirrors lib/services/HaccpReportingService.ts getTodayStatus output and
// app/haccp/hubModel.ts TodayStatus.
const REQUIRED_TOP_LEVEL_KEYS = [
  "cold_storage",
  "processing_room",
  "daily_diary",
  "cleaning",
  "deliveries",
  "mince_runs",
  "product_returns",
  "corrective_actions",
  "calibration_due",
  "calibration_done",
  "calibration_pass",
  "weekly_review_due",
  "weekly_review_overdue",
  "monthly_review_due",
  "monthly_review_overdue",
  "training_overdue",
  "training_due_soon",
  "total_checks",
  "completed_checks",
];

describe("HACCP hub UI Phase 1 — today-status honest 8-set (delta #3)", () => {
  let users: TestUserSet;
  let warehouse: { role: string; userId: string; name: string };

  beforeAll(async () => {
    users = await setupTestUsers();
    warehouse = {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    };
  }, 30_000);

  it("today-status → 200 for an allowed role (warehouse)", async () => {
    const res = await api("/api/haccp/today-status", { ...warehouse });
    expect(res.status).toBe(200);
  });

  it("total_checks is the honest 8 (delta #3 — was 6)", async () => {
    const res = await api("/api/haccp/today-status", { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.total_checks).toBe(8);
  });

  it("completed_checks is a number in the inclusive range 0..8", async () => {
    const res = await api("/api/haccp/today-status", { ...warehouse });
    const body = res.body as Record<string, unknown>;
    expect(typeof body.completed_checks).toBe("number");
    const done = body.completed_checks as number;
    expect(Number.isInteger(done)).toBe(true);
    expect(done).toBeGreaterThanOrEqual(0);
    // The denominator is the ceiling — completed can never exceed the 8-set.
    expect(done).toBeLessThanOrEqual(8);
    expect(done).toBeLessThanOrEqual(body.total_checks as number);
  });

  it("response SHAPE is unchanged — every consumer key still present", async () => {
    const res = await api("/api/haccp/today-status", { ...warehouse });
    const body = res.body as Record<string, unknown>;
    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(body, `today-status missing key '${key}'`).toHaveProperty(key);
    }
    // The diary block must still carry the operational (mid-day) phase that
    // delta #4 surfaces visually — its absence would blank the room tile.
    const diary = body.daily_diary as Record<string, unknown>;
    for (const key of [
      "opening",
      "operational",
      "closing",
      "opening_overdue",
      "operational_overdue",
      "closing_overdue",
    ]) {
      expect(diary, `daily_diary missing key '${key}'`).toHaveProperty(key);
    }
  });
});
