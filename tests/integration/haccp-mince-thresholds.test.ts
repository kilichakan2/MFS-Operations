/**
 * tests/integration/haccp-mince-thresholds.test.ts
 *
 * DB-driven CCP-M mince/meat-prep thresholds: the mince-prep GET carries the
 * 9-row threshold set, and the admin-only thresholds route reads + edits it
 * with an immutable audit trail (mirror of haccp-goods-in-thresholds.test.ts).
 *
 * Also proves the two spec-critical server behaviours end-to-end:
 *   - AMBER FILES PAPERWORK: a mince input of 7.5°C (amber band) still 400s
 *     without a corrective action, and with one persists
 *     `input_temp_pass:false` + a CCP-M1 register row (plan risk R1 — the
 *     amber band is display-only, unlike goods-in's saves-free amber).
 *   - TIMESEP CA (bug fix 1): a timesep POST with free text persists the
 *     `corrective_action` column AND files an MMP-TS register row; without
 *     text it files nothing.
 *
 * Prereqs: npm run db:up + npm run db:reset + the auto-booted dev server.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

async function caRowsFor(sourceId: string) {
  const supa = getServiceClient();
  const { data } = await supa
    .from("haccp_corrective_actions")
    .select("id, source_table, ccp_ref, deviation_description, action_taken")
    .eq("source_id", sourceId);
  return data ?? [];
}

describe("/api/haccp mince thresholds — DB-driven CCP-M limits", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  it("GET /mince-prep carries the 9 seeded threshold rows (appended last)", async () => {
    const res = await api("/api/haccp/mince-prep", {
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      thresholds: {
        key: string;
        kind: string;
        pass_max: number | null;
        amber_max: number | null;
      }[];
    };
    expect(body.thresholds).toHaveLength(9);
    const input = body.thresholds.find((t) => t.key === "mince_input");
    expect(Number(input?.pass_max)).toBe(7);
    expect(Number(input?.amber_max)).toBe(8);
    const vac = body.thresholds.find((t) => t.key === "kill_days_imported_vac");
    expect(vac?.pass_max).toBeNull();
    expect(vac?.kind).toBe("kill_days");
    // Appended LAST — the existing response keys keep their order.
    expect(Object.keys(res.body as Record<string, unknown>)).toEqual([
      "date",
      "mince",
      "meatprep",
      "timesep",
      "deliveries",
      "mince_batches",
      "thresholds",
    ]);
  });

  it("admin thresholds GET → 200 for admin, 403 for butcher", async () => {
    const admin = await api("/api/haccp/admin/mince-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    expect(admin.status).toBe(200);
    const body = admin.body as { thresholds: { key: string }[] };
    expect(body.thresholds).toHaveLength(9);

    const denied = await api("/api/haccp/admin/mince-thresholds", {
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe("Admin only");
  });

  it("non-admin PATCH → 403", async () => {
    const denied = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
      body: { id: "00000000-0000-0000-0000-000000000000", pass_max: 1, amber_max: 2 },
    });
    expect(denied.status).toBe(403);
  });

  it("admin PATCH updates mince_output_chilled amber, writes an audit row, restores", async () => {
    const supa = getServiceClient();

    const list = await api("/api/haccp/admin/mince-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const target = (
      list.body as {
        thresholds: { id: string; key: string; pass_max: number; amber_max: number }[];
      }
    ).thresholds.find((t) => t.key === "mince_output_chilled")!;
    expect(target).toBeDefined();
    const originalAmber = Number(target.amber_max);

    // PATCH amber 3 → 3.5.
    const patch = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: target.id, pass_max: Number(target.pass_max), amber_max: 3.5 },
    });
    expect(patch.status).toBe(200);
    expect(Number((patch.body as { amber_max: number }).amber_max)).toBe(3.5);

    // An immutable audit row exists with old 3 / new 3.5 / changed_by.
    const { data: audits } = await supa
      .from("haccp_mince_threshold_audit")
      .select("threshold_id, changed_by, old_amber_max, new_amber_max")
      .eq("threshold_id", target.id)
      .eq("new_amber_max", 3.5);
    expect(audits && audits.length).toBeGreaterThanOrEqual(1);
    expect(audits![0].changed_by).toBe(users.admin.id);
    expect(Number(audits![0].old_amber_max)).toBe(originalAmber);

    // Restore original value so later tests / the shared band stay unchanged.
    const restore = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: target.id, pass_max: Number(target.pass_max), amber_max: originalAmber },
    });
    expect(restore.status).toBe(200);
  });

  it("admin PATCH with an inverted band (amber < pass) → 400", async () => {
    const list = await api("/api/haccp/admin/mince-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const input = (
      list.body as { thresholds: { id: string; key: string }[] }
    ).thresholds.find((t) => t.key === "mince_input")!;

    const bad = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: input.id, pass_max: 7, amber_max: 6 },
    });
    expect(bad.status).toBe(400);
  });

  it("kill-day row rejects a non-integer limit AND any amber value", async () => {
    const list = await api("/api/haccp/admin/mince-thresholds", {
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
    });
    const lamb = (
      list.body as { thresholds: { id: string; key: string }[] }
    ).thresholds.find((t) => t.key === "kill_days_lamb")!;

    const nonInteger = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: lamb.id, pass_max: 6.5, amber_max: null },
    });
    expect(nonInteger.status).toBe(400);

    const withAmber = await api("/api/haccp/admin/mince-thresholds", {
      method: "PATCH",
      role: "admin",
      userId: users.admin.id,
      name: users.admin.name,
      body: { id: lamb.id, pass_max: 6, amber_max: 7 },
    });
    expect(withAmber.status).toBe(400);
  });

  it("POST mince at 7.5°C (amber) WITHOUT a CA → 400 (paperwork still demanded)", async () => {
    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
      body: {
        form: "mince",
        product_species: "lamb",
        kill_date: TODAY,
        input_temp_c: 7.5, // amber band — display-only, CA still required
        output_temp_c: 1,
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Corrective action is required for temperature deviation",
    );
  });

  it("POST mince at 7.5°C (amber) WITH a CA → 200, pass:false persisted, CA row filed", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_mince_log")
      .select("id")
      .eq("submitted_by", users.butcher.id);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
      body: {
        form: "mince",
        product_species: "lamb",
        kill_date: TODAY,
        input_temp_c: 7.5, // amber band
        output_temp_c: 1,
        corrective_action: {
          cause: "Supplier delivered product above temperature",
          disposition: "Assess",
          recurrence: "Request temperature records on next delivery",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.has_deviation).toBe(true);
    expect(body.ca_write_failed).toBe(false);

    const after = await supa
      .from("haccp_mince_log")
      .select("id, input_temp_pass, output_temp_pass")
      .eq("submitted_by", users.butcher.id);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow, "mince row written").toBeDefined();
    // The persisted boolean keeps today's meaning: over pass limit = false.
    expect(newRow!.input_temp_pass).toBe(false);
    expect(newRow!.output_temp_pass).toBe(true);

    // The register never went quiet: a CCP-M1 row links back to the mince row.
    const cas = await caRowsFor(newRow!.id);
    expect(cas).toHaveLength(1);
    expect(cas[0].source_table).toBe("haccp_mince_log");
    expect(cas[0].ccp_ref).toBe("CCP-M1");
    expect(cas[0].deviation_description).toContain("7.5°C");
    expect(cas[0].deviation_description).toContain("limit ≤7°C");
  });

  it("POST timesep WITH corrective-action text → column persisted + MMP-TS register row", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_time_separation_log")
      .select("id")
      .eq("submitted_by", users.butcher.id);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const marker = `Re-cleaned slicer guard ${Date.now()}`;
    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
      body: {
        form: "timesep",
        clean_completed_time: "11:30",
        clean_verified_by: "Sam",
        allergens_in_production: "Mustard, Gluten",
        corrective_action: marker,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_time_separation_log")
      .select("id, corrective_action")
      .eq("submitted_by", users.butcher.id);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow, "timesep row written").toBeDefined();
    // Bug fix 1: the free text reaches the column (was hardcoded undefined)…
    expect(newRow!.corrective_action).toBe(marker);

    // …AND the CA register (was never written at all).
    const cas = await caRowsFor(newRow!.id);
    expect(cas).toHaveLength(1);
    expect(cas[0].source_table).toBe("haccp_time_separation_log");
    expect(cas[0].ccp_ref).toBe("MMP-TS");
    expect(cas[0].action_taken).toBe(marker);
    expect(cas[0].deviation_description).toContain("Mustard, Gluten");
  });

  it("POST timesep WITHOUT text → zero CA rows", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_time_separation_log")
      .select("id")
      .eq("submitted_by", users.butcher.id);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      role: "butcher",
      userId: users.butcher.id,
      name: users.butcher.name,
      body: {
        form: "timesep",
        clean_completed_time: "12:15",
        clean_verified_by: "Sam",
        allergens_in_production: "none",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_time_separation_log")
      .select("id")
      .eq("submitted_by", users.butcher.id);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow, "timesep row written").toBeDefined();
    expect(await caRowsFor(newRow!.id)).toHaveLength(0);
  });
});
