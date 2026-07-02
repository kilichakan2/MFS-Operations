/**
 * tests/integration/haccp-goods-in-thresholds.test.ts
 *
 * DB-driven CCP-1 Goods In thresholds: the delivery GET carries the 11-row
 * threshold set, and the admin-only thresholds route reads + edits it with an
 * immutable audit trail (mirror of haccp-process-room-thresholds.test.ts).
 *
 * Also proves the POST grading path is server-authoritative against the DB
 * bands: a poultry delivery at 4.5°C persists temp_status 'urgent' (the fix —
 * it silently passed at ≤8°C before this unit). Deliveries are append-only per
 * day, so the POST keys on its own response, not on list counts.
 *
 * Prereqs: npm run db:up + npm run db:reset + the auto-booted dev server.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

describe("/api/haccp goods-in thresholds — DB-driven CCP-1 limits", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  it("GET /delivery carries the 11 seeded threshold rows (poultry = 4/5)", async () => {
    const res = await api("/api/haccp/delivery", {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      thresholds: { category: string; pass_max_c: number | null; amber_max_c: number | null }[];
    };
    expect(body.thresholds).toHaveLength(11);
    const poultry = body.thresholds.find((t) => t.category === "poultry");
    expect(Number(poultry?.pass_max_c)).toBe(4);
    expect(Number(poultry?.amber_max_c)).toBe(5);
    const dry = body.thresholds.find((t) => t.category === "dry_goods");
    expect(dry?.pass_max_c).toBeNull();
  });

  it("POST /delivery grades poultry 4.5°C as urgent against the DB bands (the fix)", async () => {
    // Self-heal the delivery_number sequence first: haccp.test.ts's
    // 409-conflict test deliberately pre-occupies (COUNT+1) and leaves the gap
    // in place, so any later route POST would 409 forever. Fill the gap(s)
    // directly so this POST's COUNT+1 lands on a free number — order-proof
    // whichever file runs first.
    const supa = getServiceClient();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    for (let i = 0; i < 5; i++) {
      const { data } = await supa
        .from("haccp_deliveries")
        .select("delivery_number")
        .eq("date", today);
      const taken = new Set((data ?? []).map((r) => r.delivery_number));
      const next = (data?.length ?? 0) + 1;
      if (!taken.has(next)) break;
      let free = 1;
      while (taken.has(free)) free++;
      const { error } = await supa.from("haccp_deliveries").insert({
        submitted_by: users.warehouse.id,
        date: today,
        time_of_delivery: "09:00:00",
        supplier: "GI-Test sequence filler",
        supplier_id: null,
        product: "Sequence filler",
        product_category: "dry_goods",
        temperature_c: null,
        temp_status: "pass",
        covered_contaminated: "no",
        contamination_type: null,
        contamination_notes: null,
        corrective_action_required: false,
        notes: null,
        born_in: null,
        reared_in: null,
        slaughter_site: null,
        cut_site: null,
        delivery_number: free,
        batch_number: `GIH-${Date.now()}-${free}`,
        allergens_identified: false,
        allergen_notes: null,
      });
      expect(error, "sequence-filler insert").toBeNull();
    }

    const post = await api("/api/haccp/delivery", {
      method: "POST",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
      body: {
        supplier_name: `GI-Test Poultry ${Date.now()}`,
        product: "Chicken crowns — integration goods-in",
        product_category: "poultry",
        temperature_c: 4.5,
        covered_contaminated: "no",
        allergens_identified: false,
        corrective_action_temp: {
          cause: "Cold chain break in transport",
          disposition: "Conditional accept",
          recurrence: "Contact supplier — cold chain audit",
        },
      },
    });
    expect(post.status).toBe(200);
    const body = post.body as { temp_status: string; corrective_action_required: boolean };
    expect(body.temp_status).toBe("urgent");
    expect(body.corrective_action_required).toBe(true);
  });

  it("admin thresholds GET → 200 for admin, 403 for warehouse", async () => {
    const admin = await api("/api/haccp/admin/goods-in-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(admin.status).toBe(200);
    const body = admin.body as { thresholds: { category: string }[] };
    expect(body.thresholds).toHaveLength(11);

    const denied = await api("/api/haccp/admin/goods-in-thresholds", {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe("Admin only");
  });

  it("non-admin PATCH → 403", async () => {
    const denied = await api("/api/haccp/admin/goods-in-thresholds", {
      method: "PATCH",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
      body: { id: "00000000-0000-0000-0000-000000000000", pass_max_c: 1, amber_max_c: 2 },
    });
    expect(denied.status).toBe(403);
  });

  it("admin PATCH updates poultry amber, writes an audit row (old→new), and restores", async () => {
    const supa = getServiceClient();

    const list = await api("/api/haccp/admin/goods-in-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const poultry = (
      list.body as {
        thresholds: { id: string; category: string; pass_max_c: number; amber_max_c: number }[];
      }
    ).thresholds.find((t) => t.category === "poultry")!;
    expect(poultry).toBeDefined();
    const originalAmber = Number(poultry.amber_max_c);

    // PATCH amber 5 → 5.5.
    const patch = await api("/api/haccp/admin/goods-in-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: poultry.id, pass_max_c: Number(poultry.pass_max_c), amber_max_c: 5.5 },
    });
    expect(patch.status).toBe(200);
    expect(Number((patch.body as { amber_max_c: number }).amber_max_c)).toBe(5.5);

    // An immutable audit row exists with old 5 / new 5.5 / changed_by.
    const { data: audits } = await supa
      .from("haccp_goods_in_threshold_audit")
      .select("threshold_id, changed_by, old_amber_max_c, new_amber_max_c")
      .eq("threshold_id", poultry.id)
      .eq("new_amber_max_c", 5.5);
    expect(audits && audits.length).toBeGreaterThanOrEqual(1);
    expect(audits![0].changed_by).toBe(users.admin.id);
    expect(Number(audits![0].old_amber_max_c)).toBe(originalAmber);

    // Restore original value so later tests / the shared band stay unchanged.
    const restore = await api("/api/haccp/admin/goods-in-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: poultry.id, pass_max_c: Number(poultry.pass_max_c), amber_max_c: originalAmber },
    });
    expect(restore.status).toBe(200);
  });

  it("admin PATCH with an inverted band (amber < pass) → 400", async () => {
    const list = await api("/api/haccp/admin/goods-in-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const poultry = (
      list.body as { thresholds: { id: string; category: string }[] }
    ).thresholds.find((t) => t.category === "poultry")!;

    const bad = await api("/api/haccp/admin/goods-in-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: poultry.id, pass_max_c: 4, amber_max_c: 3 },
    });
    expect(bad.status).toBe(400);
  });

  it("admin PATCH changing a band's structure (nulling amber) → 400", async () => {
    const list = await api("/api/haccp/admin/goods-in-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const poultry = (
      list.body as { thresholds: { id: string; category: string }[] }
    ).thresholds.find((t) => t.category === "poultry")!;

    const bad = await api("/api/haccp/admin/goods-in-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: poultry.id, pass_max_c: 4, amber_max_c: null },
    });
    expect(bad.status).toBe(400);
  });
});
