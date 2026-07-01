/**
 * tests/integration/haccp-process-room-thresholds.test.ts
 *
 * DB-driven CCP-3 thresholds: the process-room GET carries the thresholds, and
 * the admin-only thresholds route reads + edits them with an audit trail.
 *
 * The process-room AM/PM POST-temps slots for TODAY are consumed by
 * haccp.test.ts (append-only, one run per db:reset), so the band-aware POST
 * assertions live there; this file covers the read paths + the admin route,
 * which don't consume a session slot.
 *
 * Prereqs: npm run db:up + npm run db:reset + the auto-booted dev server.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

function todayUK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
const TODAY = todayUK();

describe("/api/haccp process-room thresholds — DB-driven CCP-3 limits", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  it("GET /process-room carries the seeded thresholds (Product core + Room ambient)", async () => {
    const res = await api(`/api/haccp/process-room?date=${TODAY}`, {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as { thresholds: { name: string; target_temp_c: number; max_temp_c: number }[] };
    const names = body.thresholds.map((t) => t.name).sort();
    expect(names).toContain("Product core");
    expect(names).toContain("Room ambient");
    const product = body.thresholds.find((t) => t.name === "Product core");
    expect(Number(product?.target_temp_c)).toBe(4);
    expect(Number(product?.max_temp_c)).toBe(7);
  });

  it("admin thresholds GET → 200 for admin, 403 for warehouse", async () => {
    const admin = await api("/api/haccp/admin/process-room-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(admin.status).toBe(200);
    const body = admin.body as { thresholds: { name: string }[] };
    expect(body.thresholds.length).toBeGreaterThanOrEqual(2);

    const denied = await api("/api/haccp/admin/process-room-thresholds", {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe("Admin only");
  });

  it("admin PATCH updates a threshold, writes an audit row (old→new), and restores", async () => {
    const supa = getServiceClient();

    // Find Product core's id.
    const list = await api("/api/haccp/admin/process-room-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const product = (list.body as { thresholds: { id: string; name: string; target_temp_c: number }[] })
      .thresholds.find((t) => t.name === "Product core")!;
    expect(product).toBeDefined();
    const originalTarget = Number(product.target_temp_c);

    // PATCH target 4 → 3.
    const patch = await api("/api/haccp/admin/process-room-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: product.id, target_temp_c: 3, max_temp_c: 7 },
    });
    expect(patch.status).toBe(200);
    expect(Number((patch.body as { target_temp_c: number }).target_temp_c)).toBe(3);

    // An immutable audit row exists with old 4 / new 3 / changed_by.
    const { data: audits } = await supa
      .from("haccp_threshold_audit")
      .select("threshold_id, changed_by, old_target_temp_c, new_target_temp_c")
      .eq("threshold_id", product.id)
      .eq("new_target_temp_c", 3);
    expect(audits && audits.length).toBeGreaterThanOrEqual(1);
    expect(audits![0].changed_by).toBe(users.admin.id);
    expect(Number(audits![0].old_target_temp_c)).toBe(4);

    // Restore original value so later tests / the shared band stay unchanged.
    const restore = await api("/api/haccp/admin/process-room-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: product.id, target_temp_c: originalTarget, max_temp_c: 7 },
    });
    expect(restore.status).toBe(200);
  });

  it("admin PATCH with max < target → 400", async () => {
    const list = await api("/api/haccp/admin/process-room-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const product = (list.body as { thresholds: { id: string; name: string }[] })
      .thresholds.find((t) => t.name === "Product core")!;

    const bad = await api("/api/haccp/admin/process-room-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: product.id, target_temp_c: 9, max_temp_c: 5 },
    });
    expect(bad.status).toBe(400);
  });
});
