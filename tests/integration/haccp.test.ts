/**
 * tests/integration/haccp.test.ts
 *
 * Integration tests for the F-19 PR2 Cluster-A HACCP route re-point. The 9 route
 * files (7 daily-check forms + the admin corrective-actions GET + [id] PATCH) now
 * call the PR1 service-role singletons from `@/lib/wiring/haccp` instead of inline
 * `supabaseService`. The intent is BYTE-IDENTICAL behaviour: same wire JSON (keys +
 * values + order), same DB writes, same status codes + error strings, same
 * `ca_write_failed` semantics.
 *
 * These are the FIRST live HACCP coverage (PR1's modules were dead code). They run
 * the full HTTP round-trip against a real local Supabase DB — the layer the PR1
 * unit tests cannot reach. Each route is exercised against the real schema; the
 * three heterogeneity traps + the cold-storage status-code precedence chain + the
 * mince kill-date hard-fail extra keys are pinned explicitly.
 *
 * Self-seeding: cold-storage units are created via the service client (RLS-bypass)
 * in beforeAll — there is no HACCP seed in supabase/seed.sql. CA rows in
 * `haccp_corrective_actions` are APPEND-ONLY (a DELETE rule no-ops), so CA counts
 * are asserted by `source_id` (the daily-check row id), never by total table count,
 * and CA rows are never deleted in cleanup.
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed) + the dev server the
 * runner auto-boots (npm run test:integration).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

// London "today" exactly as every route computes it.
function todayUK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function nDaysAgoUK(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

const TODAY = todayUK();
const CHILLER_NAME = "ANVIL-TEST-chiller";

// Count CA rows filed against a given daily-check row id (append-only ledger).
async function caCountFor(sourceId: string): Promise<number> {
  const supa = getServiceClient();
  const { count, error } = await supa
    .from("haccp_corrective_actions")
    .select("*", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(`caCountFor failed: ${error.message}`);
  return count ?? 0;
}

describe("/api/haccp/* integration — F-19 PR2 byte-identical route re-point", () => {
  let users: TestUserSet;
  let chillerId: string;
  // role+id used on every authed daily-check call
  let actor: { role: string; userId: string; name: string };

  beforeAll(async () => {
    users = await setupTestUsers();
    actor = { role: "warehouse", userId: users.warehouse.id, name: users.warehouse.name };

    const supa = getServiceClient();
    // Seed one chiller unit (target 4 / max 8): temp 3 pass, 6 amber, 12 critical.
    const { data: existing } = await supa
      .from("haccp_cold_storage_units")
      .select("id")
      .eq("name", CHILLER_NAME)
      .maybeSingle();
    if (existing) {
      chillerId = existing.id;
    } else {
      const { data, error } = await supa
        .from("haccp_cold_storage_units")
        .insert({
          name: CHILLER_NAME,
          unit_type: "chiller",
          target_temp_c: 4,
          max_temp_c: 8,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`seed chiller failed: ${error.message}`);
      chillerId = data.id;
    }
  }, 30_000);

  // RUN CONTRACT: every HACCP daily-check table is APPEND-ONLY — the baseline
  // schema installs `CREATE RULE no_delete_haccp_* ON DELETE DO INSTEAD NOTHING`
  // on deliveries / cold_storage_temps / calibration_log / cleaning_log /
  // processing_temps / daily_diary / mince_log / meatprep_log /
  // time_separation_log / returns / corrective_actions (food-safety audit trail,
  // legally immutable). Rows therefore CANNOT be deleted in cleanup, and the
  // daily-check unique indexes are date-scoped ((date, session, unit_id),
  // (date, phase), (date, delivery_number), (date, batch_code)). So this suite
  // requires a FRESH SEED per run — exactly the project's documented contract
  // (`npm run db:reset` before `npm run test:integration`) and ANVIL's
  // local-stack rung (Up → reset/seed → Run). A second run on the same calendar
  // day without a reset will 409 on the already-occupied date slots; that is the
  // append-only schema working as designed, NOT a behaviour regression.
  afterAll(async () => {
    // Best-effort tidy of the seeded UNIT (not append-only). The append-only
    // daily-check + CA rows are intentionally left in place (immutable).
    const supa = getServiceClient();
    await supa.from("haccp_cold_storage_units").delete().eq("name", CHILLER_NAME);
  }, 30_000);

  // ── 401 gate on every route ──────────────────────────────────────────────

  it("every daily-check route 401s without an allowed role", async () => {
    const paths: Array<[string, "GET" | "POST"]> = [
      ["/api/haccp/delivery", "GET"],
      ["/api/haccp/cold-storage", "GET"],
      ["/api/haccp/calibration", "GET"],
      ["/api/haccp/cleaning", "GET"],
      ["/api/haccp/process-room", "GET"],
      ["/api/haccp/mince-prep", "GET"],
      ["/api/haccp/product-return", "GET"],
    ];
    for (const [path, method] of paths) {
      // a non-allowed role (sales) reaches the handler (not /api/admin) → 401
      const res = await api(path, {
        method,
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect((res.body as { error: string }).error).toBe("Unauthorised");
    }
  });

  it("corrective-actions GET + PATCH 401 for a non-admin (admin-only gate)", async () => {
    const get = await api("/api/haccp/corrective-actions", {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(get.status).toBe(401);
    expect((get.body as { error: string }).error).toBe("Unauthorised — admin only");

    const patch = await api("/api/haccp/corrective-actions/some-id", {
      method: "PATCH",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(patch.status).toBe(401);
    expect((patch.body as { error: string }).error).toBe("Unauthorised — admin only");
  });

  // ── 1. delivery ───────────────────────────────────────────────────────────

  it("delivery happy non-deviation → temp_status pass, no CA, key SET + ORDER", async () => {
    const res = await api("/api/haccp/delivery", {
      method: "POST",
      ...actor,
      body: {
        supplier_name: "ANVIL Supplier",
        product: "Chicken breast",
        product_category: "poultry",
        temperature_c: 4,
        covered_contaminated: "no",
        allergens_identified: false,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "ok",
      "temp_status",
      "corrective_action_required",
      "delivery_number",
      "batch_number",
      "ca_write_failed",
    ]);
    expect(body.temp_status).toBe("pass");
    expect(body.corrective_action_required).toBe(false);
    expect(body.ca_write_failed).toBe(false);
  });

  // W2 — THE TRAP. Allergen-only deviation (temp pass, contamination 'no',
  // allergen flagged): the delivery row records corrective_action_required:true
  // but ZERO CA rows are filed. A real bug would file a CA row here.
  it("W2: allergen-only delivery → corrective_action_required:true but ZERO CA rows", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_deliveries")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/delivery", {
      method: "POST",
      ...actor,
      body: {
        supplier_name: "ANVIL Supplier",
        product: "Chicken",
        product_category: "poultry",
        temperature_c: 4,
        covered_contaminated: "no",
        allergens_identified: true,
        allergen_notes: "traces",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.corrective_action_required).toBe(true);
    expect(body.ca_write_failed).toBe(false);

    // locate the row just written, assert ZERO CA rows hang off it
    const after = await supa
      .from("haccp_deliveries")
      .select("id, corrective_action_required")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow, "the allergen-only delivery row was written").toBeDefined();
    expect(newRow!.corrective_action_required).toBe(true);
    expect(await caCountFor(newRow!.id)).toBe(0);
  });

  it("delivery temp deviation → exactly 1 CA row filed", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_deliveries")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/delivery", {
      method: "POST",
      ...actor,
      body: {
        supplier_name: "ANVIL Supplier",
        product: "Chicken",
        product_category: "poultry",
        temperature_c: 12, // > 8 for poultry → fail
        covered_contaminated: "no",
        allergens_identified: false,
        corrective_action_temp: {
          cause: "Cold chain break in transport",
          disposition: "Reject",
          recurrence: "Supplier escalation",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { temp_status: string }).temp_status).toBe("fail");
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const after = await supa
      .from("haccp_deliveries")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);
  });

  it("delivery 409 on a duplicate (date, delivery_number) → exact conflict string", async () => {
    // delivery_number is COUNT(today)+1, so two route posts auto-increment and
    // never collide naturally. Force the serial collision: pre-insert ONE occupier
    // row. Inserting it raises the count by 1, so the route will compute
    // (count_after + 1). Occupy THAT exact number → the route's insert collides on
    // the (date, delivery_number) unique index → ConflictError → 409.
    const supa = getServiceClient();
    const { count } = await supa
      .from("haccp_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("date", TODAY);
    // current count = C; after this insert count = C+1; route computes (C+1)+1 = C+2.
    const nextNumber = (count ?? 0) + 2;
    // occupy nextNumber for today
    const { error: seedErr } = await supa.from("haccp_deliveries").insert({
      submitted_by: actor.userId,
      date: TODAY,
      time_of_delivery: "09:00:00",
      supplier: "ANVIL Supplier",
      supplier_id: null,
      product: "Pre-occupier",
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
      delivery_number: nextNumber,
      batch_number: `OCC-${nextNumber}`,
      allergens_identified: false,
      allergen_notes: null,
    });
    expect(seedErr, "pre-occupier insert").toBeNull();

    const res = await api("/api/haccp/delivery", {
      method: "POST",
      ...actor,
      body: {
        supplier_name: "ANVIL Supplier",
        product: "Sugar",
        product_category: "dry_goods",
        temperature_c: null,
        covered_contaminated: "no",
        allergens_identified: false,
      },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe(
      "Another delivery was logged at the same moment. Please retry.",
    );
  });

  it("delivery GET (today) → 200 with deliveries + suppliers + next_number + thresholds", async () => {
    const res = await api("/api/haccp/delivery", { ...actor });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // `thresholds` appended by the Goods In unit (DB-driven CCP-1 bands);
    // pre-existing keys unchanged.
    expect(Object.keys(body).sort()).toEqual(
      ["date", "deliveries", "next_number", "suppliers", "thresholds"].sort(),
    );
    expect(Array.isArray(body.deliveries)).toBe(true);
    expect(typeof body.next_number).toBe("number");
    expect(Array.isArray(body.thresholds)).toBe(true);
  });

  // ── 2. cold-storage — STATUS-CODE PRECEDENCE CHAIN ─────────────────────────

  it("cold-storage precedence: missing-fields 400 fires first", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Missing required fields");
  });

  it("cold-storage precedence: today-only 400 (valid session+readings, wrong date)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: "2020-01-01",
        readings: [{ unit_id: chillerId, temperature_c: 3 }],
        comments: "",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Readings may only be submitted for today's date.",
    );
  });

  it("cold-storage precedence: unit-unknown 400 (valid date, bogus unit)", async () => {
    const bogus = "00000000-0000-0000-0000-0000000000ff";
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: bogus, temperature_c: 3 }],
        comments: "",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      `Unknown or inactive unit: ${bogus}`,
    );
  });

  it("cold-storage no-deviation (temp 3, chiller) → has_deviation:false, 0 CA", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: chillerId, temperature_c: 3 }],
        comments: "all good",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["ok", "has_deviation", "ca_write_failed"]);
    expect(body.has_deviation).toBe(false);
    expect(body.ca_write_failed).toBe(false);
  });

  it("cold-storage 1 deviating reading (temp 12 critical) → 1 CA row", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_cold_storage_temps")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "PM",
        date: TODAY,
        readings: [{ unit_id: chillerId, temperature_c: 12 }],
        comments: "deviation",
        corrective_action: {
          cause: "Door left open",
          disposition: "Assess",
          recurrence: "Fit door alarm",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { has_deviation: boolean }).has_deviation).toBe(true);
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const after = await supa
      .from("haccp_cold_storage_temps")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);
  });

  it("cold-storage 409 on resubmitting the same (date, session, unit)", async () => {
    // the no-deviation AM submit above already occupies (TODAY, AM, chiller)
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: chillerId, temperature_c: 3 }],
        comments: "retry",
      },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe(
      "This session has already been submitted for one or more units.",
    );
  });

  // ── 3. calibration ──────────────────────────────────────────────────────

  it("calibration certified mode → {ok:true}", async () => {
    const res = await api("/api/haccp/calibration", {
      method: "POST",
      ...actor,
      body: {
        calibration_mode: "certified_probe",
        thermometer_id: "P-CERT",
        cert_reference: "CERT-1",
        purchase_date: "2025-01-01",
        verified_by: "Sam",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("calibration manual PASS (ice 0 / boil 100) → any_fail:false, 0 CA", async () => {
    const res = await api("/api/haccp/calibration", {
      method: "POST",
      ...actor,
      body: {
        thermometer_id: "P-MAN-PASS",
        ice_water_result_c: 0,
        boiling_water_result_c: 100,
        verified_by: "Sam",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "ok",
      "ice_pass",
      "boil_pass",
      "any_fail",
      "ca_write_failed",
    ]);
    expect(body.ice_pass).toBe(true);
    expect(body.boil_pass).toBe(true);
    expect(body.any_fail).toBe(false);
    expect(body.ca_write_failed).toBe(false);
  });

  it("calibration manual FAIL (ice 5) → any_fail:true + 1 CA", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_calibration_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/calibration", {
      method: "POST",
      ...actor,
      body: {
        thermometer_id: "P-MAN-FAIL",
        ice_water_result_c: 5, // outside [-1,1] → fail
        boiling_water_result_c: 100,
        verified_by: "Sam",
        corrective_action: {
          cause: "Probe drift",
          disposition: "Assess",
          recurrence: "Recalibrate",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { any_fail: boolean }).any_fail).toBe(true);
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const after = await supa
      .from("haccp_calibration_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);
  });

  // ── 4. cleaning ───────────────────────────────────────────────────────────

  it("cleaning no-issues → 0 CA", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_cleaning_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/cleaning", {
      method: "POST",
      ...actor,
      body: { what_was_cleaned: "Floor", issues: false, verified_by: "Sam" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_cleaning_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(0);
  });

  it("cleaning issues:true without corrective_action → 400", async () => {
    const res = await api("/api/haccp/cleaning", {
      method: "POST",
      ...actor,
      body: {
        what_was_cleaned: "Floor",
        issues: true,
        what_did_you_do: "recleaned",
        verified_by: "Sam",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Corrective action is required when issues are reported",
    );
  });

  it("cleaning issues:true with corrective_action → 1 CA", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_cleaning_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/cleaning", {
      method: "POST",
      ...actor,
      body: {
        what_was_cleaned: "Mincer",
        issues: true,
        what_did_you_do: "recleaned",
        verified_by: "Sam",
        corrective_action: {
          cause: "Residue found",
          disposition: "Re-cleaned and verified",
          recurrence: "Add to checklist",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const after = await supa
      .from("haccp_cleaning_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);
  });

  // ── 5. process-room (temps + diary) ───────────────────────────────────────

  it("process-room temps no-deviation → has_deviation:false, 0 CA", async () => {
    const res = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: {
        type: "temps",
        session: "AM",
        date: TODAY,
        product_temp_c: 3,
        room_temp_c: 10,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["ok", "has_deviation", "ca_write_failed"]);
    expect(body.has_deviation).toBe(false);
  });

  it("process-room temps both-breach → 2 CA rows + 409 on resubmit (session string)", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_processing_temps")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: {
        type: "temps",
        session: "PM",
        date: TODAY,
        product_temp_c: 6, // > 4 → breach
        room_temp_c: 16, // > 12 → breach (and > 15 → mgmt verification)
        corrective_action: {
          cause: "A/C or cooling failure",
          disposition: "Assess",
          recurrence: "Service A/C",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { has_deviation: boolean }).has_deviation).toBe(true);

    const after = await supa
      .from("haccp_processing_temps")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(2);

    // Band-aware mgmt sign-off (DB-driven thresholds Product 4/7, Room 12/15):
    // product 6 is AMBER → no mgmt sign-off; room 16 is CRITICAL → mgmt sign-off.
    const { data: caRows } = await supa
      .from("haccp_corrective_actions")
      .select("deviation_description, management_verification_required")
      .eq("source_id", newRow!.id);
    const productCa = (caRows ?? []).find((c) => c.deviation_description.startsWith("Product"));
    const roomCa = (caRows ?? []).find((c) => c.deviation_description.startsWith("Room"));
    expect(productCa?.management_verification_required).toBe(false);
    expect(roomCa?.management_verification_required).toBe(true);

    // resubmit same (date, session) → 409 with the session-interpolated string
    const dup = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: {
        type: "temps",
        session: "PM",
        date: TODAY,
        product_temp_c: 3,
        room_temp_c: 10,
      },
    });
    expect(dup.status).toBe(409);
    expect((dup.body as { error: string }).error).toBe(
      "This PM check has already been submitted for today.",
    );
  });

  it("process-room diary issues → CA rows carry NULL disposition + NULL recurrence", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_daily_diary")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: {
        type: "diary",
        phase: "opening",
        date: TODAY,
        check_results: { handwash: false, temps_recorded: true },
        issues: true,
        what_did_you_do: "Re-briefed staff on handwashing",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_daily_diary")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);

    // the diary CA row carries null disposition + null recurrence
    const { data: caRows } = await supa
      .from("haccp_corrective_actions")
      .select("product_disposition, recurrence_prevention")
      .eq("source_id", newRow!.id);
    expect(caRows && caRows.length).toBe(1);
    expect(caRows![0].product_disposition).toBeNull();
    expect(caRows![0].recurrence_prevention).toBeNull();
  });

  it("process-room diary 409 on resubmit → phase-interpolated string", async () => {
    const res = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: {
        type: "diary",
        phase: "opening",
        date: TODAY,
        check_results: { handwash: true },
        issues: false,
      },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe(
      "Opening checks have already been submitted for today.",
    );
  });

  it("process-room invalid type → 400 'Invalid type'", async () => {
    const res = await api("/api/haccp/process-room", {
      method: "POST",
      ...actor,
      body: { type: "nonsense", date: TODAY },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid type");
  });

  // ── 6. mince-prep (mince + meatprep + timesep) ─────────────────────────────

  it("mince kill-date hard-fail 400 carries kill_date_hard_fail + days_from_kill", async () => {
    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      ...actor,
      body: {
        form: "mince",
        product_species: "beef",
        kill_date: nDaysAgoUK(10), // > 6 days, non-imported → hard-fail
        input_temp_c: 5,
        output_temp_c: 1,
      },
    });
    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.kill_date_hard_fail).toBe(true);
    expect(body.days_from_kill).toBe(10);
    expect(typeof body.error).toBe("string");
  });

  it("mince happy (kill today, temps pass) → kill_pass:true, has_deviation:false, 0 CA", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_mince_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      ...actor,
      body: {
        form: "mince",
        product_species: "beef",
        kill_date: TODAY,
        input_temp_c: 5,
        output_temp_c: 1,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "ok",
      "batch_code",
      "days_from_kill",
      "kill_pass",
      "has_deviation",
      "ca_write_failed",
    ]);
    expect(body.kill_pass).toBe(true);
    expect(body.has_deviation).toBe(false);
    expect(typeof body.batch_code).toBe("string");

    const after = await supa
      .from("haccp_mince_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(0);
  });

  it("meatprep allergen-label issue → has_deviation:true in response but ZERO CA rows", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_meatprep_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      ...actor,
      body: {
        form: "meatprep",
        product_name: "Sausages",
        input_temp_c: 3, // pass
        output_temp_c: 3, // pass (meatprep chilled ≤ 4)
        allergens_present: ["milk"],
        label_check_completed: false, // → allergenLabelIssue, response has_deviation:true
        corrective_action: {
          cause: "Label step missed",
          disposition: "Assess",
          recurrence: "Add label gate",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "ok",
      "batch_code",
      "has_deviation",
      "ca_write_failed",
    ]);
    expect(body.has_deviation).toBe(true); // response flag includes allergen issue
    expect(body.ca_write_failed).toBe(false);

    // but the CA write gates on TEMPERATURE only — both temps passed → ZERO CA rows
    const after = await supa
      .from("haccp_meatprep_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(0);
  });

  it("timesep without free text → ok + ZERO CA rows written", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_time_separation_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      ...actor,
      body: {
        form: "timesep",
        clean_completed_time: "10:00",
        clean_verified_by: "Sam",
        allergens_in_production: "none",
      },
    });
    expect(res.status).toBe(200);
    // Mince unit (bug fix 1): timesep now reports ca_write_failed like the
    // other forms; with no free text there is nothing to file → false.
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_time_separation_log")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow, "timesep row written").toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(0);
  });

  it("mince-prep invalid form → 400 'Invalid form type'", async () => {
    const res = await api("/api/haccp/mince-prep", {
      method: "POST",
      ...actor,
      body: { form: "bogus" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid form type");
  });

  // ── 7. product-return — ALWAYS 1 CA ────────────────────────────────────────

  it("product-return non-food-safety code → exactly 1 CA row (audit trail)", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_returns")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/product-return", {
      method: "POST",
      ...actor,
      body: {
        customer: "Acme",
        product: "Sausage",
        return_code: "RC03",
        // disposition is written RAW into BOTH haccp_returns.disposition
        // (CHECK: restock|reprocess|quarantine|dispose) AND the CA ledger's
        // product_disposition (CHECK: accept|conditional_accept|reject|dispose|
        // assess). 'dispose' is the value valid in both — the realistic path.
        disposition: "dispose",
        verified_by: "Sam",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ca_write_failed: false });

    const after = await supa
      .from("haccp_returns")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);

    // non-food-safety code → management_verification_required false
    const { data: ca } = await supa
      .from("haccp_corrective_actions")
      .select("management_verification_required")
      .eq("source_id", newRow!.id)
      .single();
    expect(ca!.management_verification_required).toBe(false);
  });

  it("product-return food-safety code (RC01) → 1 CA row, management_verification_required:true", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("haccp_returns")
      .select("id")
      .eq("submitted_by", actor.userId);
    const beforeIds = new Set((before.data ?? []).map((r) => r.id));

    const res = await api("/api/haccp/product-return", {
      method: "POST",
      ...actor,
      body: {
        customer: "Acme",
        product: "Chicken",
        return_code: "RC01",
        return_code_notes: "off smell",
        temperature_c: 9,
        disposition: "dispose",
        verified_by: "Sam",
      },
    });
    expect(res.status).toBe(200);

    const after = await supa
      .from("haccp_returns")
      .select("id")
      .eq("submitted_by", actor.userId);
    const newRow = (after.data ?? []).find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(await caCountFor(newRow!.id)).toBe(1);

    const { data: ca } = await supa
      .from("haccp_corrective_actions")
      .select("management_verification_required")
      .eq("source_id", newRow!.id)
      .single();
    expect(ca!.management_verification_required).toBe(true);
  });

  // ── 8 + 9. corrective-actions GET (admin queue) + PATCH (sign-off) ──────────

  it("corrective-actions admin queue → {unresolved, resolved} shape; sign-off stamps the row", async () => {
    const supa = getServiceClient();
    const adminActor = { role: "admin", userId: users.admin.id, name: users.admin.name };

    // file a return that REQUIRES management verification (food-safety RC01)
    const ret = await api("/api/haccp/product-return", {
      method: "POST",
      ...actor,
      body: {
        customer: "QueueCo",
        product: "Mince",
        return_code: "RC02",
        disposition: "dispose",
        verified_by: "Sam",
      },
    });
    expect(ret.status).toBe(200);

    // grab the CA row id for that return (mgmt verification required → in queue)
    const { data: returnRow } = await supa
      .from("haccp_returns")
      .select("id")
      .eq("submitted_by", actor.userId)
      .eq("product", "Mince")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .single();
    const { data: caRow } = await supa
      .from("haccp_corrective_actions")
      .select("id, management_verification_required")
      .eq("source_id", returnRow!.id)
      .single();
    expect(caRow!.management_verification_required).toBe(true);

    // admin queue GET
    const get = await api("/api/haccp/corrective-actions", { ...adminActor });
    expect(get.status).toBe(200);
    const queue = get.body as {
      unresolved: Record<string, unknown>[];
      resolved: Record<string, unknown>[];
    };
    expect(Array.isArray(queue.unresolved)).toBe(true);
    expect(Array.isArray(queue.resolved)).toBe(true);
    const queued = queue.unresolved.find((r) => r.id === caRow!.id);
    expect(queued, "the new CA row is in the unresolved admin queue").toBeDefined();
    expect(Object.keys(queued as Record<string, unknown>)).toEqual([
      "id",
      "submitted_at",
      "ccp_ref",
      "deviation_description",
      "action_taken",
      "product_disposition",
      "recurrence_prevention",
      "source_table",
      "management_verification_required",
      "users",
    ]);

    // sign it off
    const patch = await api(`/api/haccp/corrective-actions/${caRow!.id}`, {
      method: "PATCH",
      ...adminActor,
    });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ ok: true });

    // verify the stamp landed
    const { data: signed } = await supa
      .from("haccp_corrective_actions")
      .select("verified_by, verified_at, resolved")
      .eq("id", caRow!.id)
      .single();
    expect(signed!.resolved).toBe(true);
    expect(signed!.verified_by).toBe(users.admin.id);
    expect(signed!.verified_at).not.toBeNull();

    // it now appears in the resolved list, with the verifier join
    const get2 = await api("/api/haccp/corrective-actions", { ...adminActor });
    const queue2 = get2.body as { resolved: Record<string, unknown>[] };
    const resolvedRow = queue2.resolved.find((r) => r.id === caRow!.id);
    expect(resolvedRow, "signed-off CA appears in resolved").toBeDefined();
    expect(Object.keys(resolvedRow as Record<string, unknown>)).toEqual([
      "id",
      "submitted_at",
      "verified_at",
      "ccp_ref",
      "deviation_description",
      "action_taken",
      "source_table",
      "users",
      "verifier",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HACCP cold-storage UI Phase 1 — THE BUG-FIX PROOF (server cause allow-list)
//
// Before this change the server's VALID_COLD_STORAGE_CAUSES held only 6 causes,
// so a reading whose deviation cited "Defrost cycle — scheduled temperature rise"
// or "High ambient room temperature" — both already offered by the client — was
// rejected with 400 "Invalid cause: …" and the corrective-action row never filed.
// The fix derives VALID_COLD_STORAGE_CAUSES from the SHARED COLD_STORAGE_CAUSES
// domain constant the client also consumes, so the lists can never drift again.
//
// This block drives the real route → HaccpDailyChecksService → repository →
// Supabase adapter and proves: (a) both formerly-rejected causes now return 200
// AND file a corrective-action row with non-empty action_taken + a mapped
// product_disposition; (b) the −40…+30 °C server bound echo 400s an impossible
// reading; (c) once-per-session 409; (d) non-today 400; (e) a clean all-pass AM
// submit returns 200 and files NO CA. The request bodies use the NEW shape — no
// dead `unit_type` field (dropped from ColdStorageReadingInput + the POST body).
//
// Self-seeds its OWN dedicated chiller units (target 4 / max 8) so its
// (date, session, unit_id) slots never collide with the F-19 suite above. The
// append-only schema means a re-run on the same calendar day without `db:reset`
// 409s on the occupied slots — that is the immutable audit trail working as
// designed, exactly per the run contract documented above.
// ───────────────────────────────────────────────────────────────────────────

describe("/api/haccp/cold-storage — UI Phase 1 bug-fix (8-cause allow-list + bound echo)", () => {
  let users: TestUserSet;
  let actor: { role: string; userId: string; name: string };
  // one dedicated unit per successful (AM) submit so slots never collide
  let defrostUnitId: string; // Defrost-cycle deviation
  let ambientUnitId: string; // High-ambient deviation
  let cleanUnitId: string; // clean all-pass + 409 duplicate

  const UNIT_NAMES = {
    defrost: "ANVIL-TEST-cs-defrost",
    ambient: "ANVIL-TEST-cs-ambient",
    clean: "ANVIL-TEST-cs-clean",
  } as const;

  async function seedChiller(name: string): Promise<string> {
    const supa = getServiceClient();
    const { data: existing } = await supa
      .from("haccp_cold_storage_units")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) return existing.id;
    const { data, error } = await supa
      .from("haccp_cold_storage_units")
      .insert({
        name,
        unit_type: "chiller",
        target_temp_c: 4,
        max_temp_c: 8,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seed ${name} failed: ${error.message}`);
    return data.id;
  }

  // Locate the cold-storage temp row just written for (unit, session) today.
  async function coldStorageRowId(
    unitId: string,
    session: "AM" | "PM",
  ): Promise<string> {
    const supa = getServiceClient();
    const { data, error } = await supa
      .from("haccp_cold_storage_temps")
      .select("id")
      .eq("unit_id", unitId)
      .eq("date", TODAY)
      .eq("session", session)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`coldStorageRowId failed: ${error.message}`);
    if (!data) throw new Error(`no cold-storage row for ${unitId}/${session}`);
    return data.id;
  }

  beforeAll(async () => {
    users = await setupTestUsers();
    actor = {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    };
    defrostUnitId = await seedChiller(UNIT_NAMES.defrost);
    ambientUnitId = await seedChiller(UNIT_NAMES.ambient);
    cleanUnitId = await seedChiller(UNIT_NAMES.clean);
  }, 30_000);

  afterAll(async () => {
    // Tidy the seeded UNITS only (not append-only). The daily-check + CA rows
    // they produced are immutable and intentionally left in place.
    const supa = getServiceClient();
    await supa
      .from("haccp_cold_storage_units")
      .delete()
      .in("name", [UNIT_NAMES.defrost, UNIT_NAMES.ambient, UNIT_NAMES.clean]);
  }, 30_000);

  // ── THE HEADLINE BUG-FIX: the two formerly-rejected causes now SAVE ────────

  it("Defrost-cycle deviation now returns 200 and FILES a corrective-action row (was 400)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: defrostUnitId, temperature_c: 12 }], // >8 → critical
        comments: "defrost blip",
        corrective_action: {
          cause: "Defrost cycle — scheduled temperature rise", // em-dash U+2014
          disposition: "Assess",
          recurrence: "Review defrost cycle schedule",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["ok", "has_deviation", "ca_write_failed"]);
    expect(body.has_deviation).toBe(true);
    expect(body.ca_write_failed).toBe(false);

    // exactly one CA row filed, with non-empty action_taken + a mapped disposition
    const rowId = await coldStorageRowId(defrostUnitId, "AM");
    expect(await caCountFor(rowId)).toBe(1);
    const supa = getServiceClient();
    const { data: ca } = await supa
      .from("haccp_corrective_actions")
      .select("action_taken, product_disposition, deviation_description, ccp_ref")
      .eq("source_id", rowId)
      .single();
    expect(typeof ca!.action_taken).toBe("string");
    expect((ca!.action_taken as string).length).toBeGreaterThan(0);
    expect(ca!.product_disposition).toBe("assess"); // DISPOSITION_MAP["Assess"]
    expect(ca!.ccp_ref).toBe("CCP2");
    expect(ca!.deviation_description as string).toContain(
      "Defrost cycle — scheduled temperature rise",
    );
  });

  it("High-ambient-temperature deviation now returns 200 and FILES a corrective-action row (was 400)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: ambientUnitId, temperature_c: 12 }], // >8 → critical
        comments: "hot room",
        corrective_action: {
          cause: "High ambient room temperature",
          disposition: "Assess",
          recurrence: "Improve room ventilation",
        },
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { has_deviation: boolean }).has_deviation).toBe(true);
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const rowId = await coldStorageRowId(ambientUnitId, "AM");
    expect(await caCountFor(rowId)).toBe(1);
    const supa = getServiceClient();
    const { data: ca } = await supa
      .from("haccp_corrective_actions")
      .select("action_taken, product_disposition")
      .eq("source_id", rowId)
      .single();
    expect((ca!.action_taken as string).length).toBeGreaterThan(0);
    expect(ca!.product_disposition).toBe("assess");
  });

  it("junk cause is still rejected 400 (allow-list not loosened beyond the two strings)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "PM",
        date: TODAY,
        readings: [{ unit_id: defrostUnitId, temperature_c: 12 }],
        comments: "",
        corrective_action: {
          cause: "banana",
          disposition: "Assess",
          recurrence: "Review defrost cycle schedule",
        },
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid cause: banana");
  });

  // ── server bound echo (Change 2) ─────────────────────────────────────────

  it("an impossible temperature (300 °C) is rejected 400 by the server bound echo", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: cleanUnitId, temperature_c: 300 }],
        comments: "",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Temperature out of range");
  });

  // ── precedence preserved: non-today still 400 before the bound check ──────

  it("a non-today date is rejected 400 (today-only guard, precedence preserved)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: "2020-01-01",
        readings: [{ unit_id: cleanUnitId, temperature_c: 3 }],
        comments: "",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Readings may only be submitted for today's date.",
    );
  });

  // ── clean all-pass AM → 200, no CA; then duplicate → 409 ──────────────────

  it("a clean all-pass AM submit returns 200 and files NO corrective action", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: cleanUnitId, temperature_c: 3 }], // ≤4 → pass
        comments: "all good",
      },
    });
    expect(res.status).toBe(200);
    expect((res.body as { has_deviation: boolean }).has_deviation).toBe(false);
    expect((res.body as { ca_write_failed: boolean }).ca_write_failed).toBe(false);

    const rowId = await coldStorageRowId(cleanUnitId, "AM");
    expect(await caCountFor(rowId)).toBe(0);
  });

  it("re-submitting the same (date, session, unit) returns 409 (once-per-session guard)", async () => {
    const res = await api("/api/haccp/cold-storage", {
      method: "POST",
      ...actor,
      body: {
        session: "AM",
        date: TODAY,
        readings: [{ unit_id: cleanUnitId, temperature_c: 3 }],
        comments: "retry",
      },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe(
      "This session has already been submitted for one or more units.",
    );
  });
});
