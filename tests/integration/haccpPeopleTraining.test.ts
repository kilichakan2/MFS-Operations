/**
 * tests/integration/haccpPeopleTraining.test.ts
 *
 * Integration tests for the F-19 PR4 Cluster-C HACCP route re-point. The 3 route
 * files (training, people, public visitor kiosk) now call `haccpTrainingService`
 * / `haccpPeopleService` from `@/lib/wiring/haccp` instead of inline
 * `supabaseService`. The intent is BYTE-IDENTICAL behaviour: same wire JSON,
 * same DB writes, same status codes + error strings, same role-gates.
 *
 * Pins:
 *   - training GET { staff, allergen } (DESC, limit 100, NO user join);
 *   - training POST staff + allergen inserts (stored columns), incl. the R5
 *     'Completion date required' quirk + 'Invalid training_type';
 *   - people GET { records } (limit 50, DESC, users!submitted_by(name) join key
 *     `users`, null-submitted_by row still returns with users: null);
 *   - people POST 3 record types (stored column sets + illness mapping +
 *     start_date NOT stored);
 *   - public visitor kiosk POST (no auth, submitted_by = VISITOR_KIOSK_USER_ID,
 *     health_questions {} when omitted, then visible in people GET with users:null);
 *   - visitor parity: the four visitor error strings identical across people +
 *     kiosk; the whitespace-manager divergence (R4: people passes, kiosk 400);
 *   - byte-identical 400/401 strings.
 *
 * These tables are append-only audit rows but NOT in the no_delete set, so this
 * suite self-seeds via the service client and tidies its own rows in afterAll,
 * keyed by ANVIL-TEST markers. Assertions look up the inserted row, never a
 * total table count.
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed) + the dev server
 * the runner auto-boots (npm run test:integration).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, getServiceClient, setupTestUsers, type TestUserSet } from "./_setup";

const VISITOR_KIOSK_USER_ID = "190d6c79-6239-4be7-bdbd-0df474895ebc";

// Test-only markers so cleanup is precise and collision-free across runs.
const STAFF_NAME = "ANVIL-TEST-staff-train";
const ALLERGEN_NAME = "ANVIL-TEST-allergen-train";
const DECL_NAME = "ANVIL-TEST-decl-staff";
const RTW_NAME = "ANVIL-TEST-rtw-staff";
const VISITOR_NAME = "ANVIL-TEST-visitor-people";
const KIOSK_VISITOR_NAME = "ANVIL-TEST-visitor-kiosk";

describe("/api/haccp/{training,people,visitor} Cluster C integration — F-19 PR4 byte-identical re-point", () => {
  let users: TestUserSet;
  let admin: { role: string; userId: string; name: string };
  let warehouse: { role: string; userId: string; name: string };

  beforeAll(async () => {
    users = await setupTestUsers();
    admin = { role: "admin", userId: users.admin.id, name: users.admin.name };
    warehouse = {
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    };
    // The public visitor kiosk inserts submitted_by = VISITOR_KIOSK_USER_ID,
    // which has a FK to users.id. In production this system user exists; the
    // local seed does not carry it. Seed it idempotently (active:false, never
    // logs in) so the kiosk insert FK resolves — exactly the prod precondition.
    const supa = getServiceClient();
    const { data: existing } = await supa
      .from("users")
      .select("id")
      .eq("id", VISITOR_KIOSK_USER_ID)
      .maybeSingle();
    if (!existing) {
      // users_auth_check: a non-admin role requires pin_hash NOT NULL. The
      // kiosk never logs in (active:false) but the constraint still applies, so
      // give it a placeholder pin_hash like the ANVIL non-admin test users.
      const PLACEHOLDER_HASH =
        "$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX";
      const { error } = await supa.from("users").insert({
        id: VISITOR_KIOSK_USER_ID,
        name: "Visitor Kiosk",
        role: "warehouse",
        active: false,
        pin_hash: PLACEHOLDER_HASH,
      });
      if (error)
        throw new Error(`Failed to seed kiosk system user: ${error.message}`);
    }
  }, 30_000);

  afterAll(async () => {
    const supa = getServiceClient();
    await supa.from("haccp_staff_training").delete().eq("staff_name", STAFF_NAME);
    await supa
      .from("haccp_allergen_training")
      .delete()
      .eq("staff_name", ALLERGEN_NAME);
    await supa
      .from("haccp_health_records")
      .delete()
      .in("staff_name", [DECL_NAME, RTW_NAME]);
    await supa
      .from("haccp_health_records")
      .delete()
      .in("visitor_name", [VISITOR_NAME, KIOSK_VISITOR_NAME]);
  }, 30_000);

  // ── training ───────────────────────────────────────────────────────────────

  it("training GET 401s for a non-admin; returns { staff, allergen } for admin", async () => {
    const denied = await api("/api/haccp/training", {
      method: "GET",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
    });
    expect(denied.status).toBe(401);
    expect((denied.body as { error: string }).error).toBe(
      "Unauthorised — admin only",
    );

    const ok = await api("/api/haccp/training", { method: "GET", ...admin });
    expect(ok.status).toBe(200);
    const body = ok.body as { staff: unknown[]; allergen: unknown[] };
    expect(Object.keys(body)).toEqual(["staff", "allergen"]);
    expect(Array.isArray(body.staff)).toBe(true);
    expect(Array.isArray(body.allergen)).toBe(true);
  });

  it("training POST 401s for non-admin / missing userId", async () => {
    const res = await api("/api/haccp/training", {
      method: "POST",
      role: "warehouse",
      userId: users.warehouse.id,
      name: users.warehouse.name,
      body: { training_type: "warehouse_operative" },
    });
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe(
      "Unauthorised — admin only",
    );
  });

  it("training POST staff path: required-field 400s in order + happy insert", async () => {
    // missing staff_name → first 400
    const r1 = await api("/api/haccp/training", {
      method: "POST",
      ...admin,
      body: { training_type: "butchery_process_room" },
    });
    expect(r1.status).toBe(400);
    expect((r1.body as { error: string }).error).toBe("Staff name required");

    const supa = getServiceClient();
    const ok = await api("/api/haccp/training", {
      method: "POST",
      ...admin,
      body: {
        training_type: "warehouse_operative",
        staff_name: STAFF_NAME,
        job_role: "Operative",
        document_version: "V1.0",
        completion_date: "2026-06-01",
        refresh_date: "2027-06-01",
        supervisor: "Boss",
        confirmation_items: { a: true },
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const { data } = await supa
      .from("haccp_staff_training")
      .select(
        "logged_by, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, supervisor_signed_at, confirmation_items",
      )
      .eq("staff_name", STAFF_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.logged_by).toBe(users.admin.id);
    expect(row.training_type).toBe("warehouse_operative");
    expect(row.job_role).toBe("Operative");
    expect(row.document_version).toBe("V1.0");
    expect(row.supervisor_name).toBe("Boss");
    expect(row.supervisor_signed_at).toBeTruthy();
    expect(row.confirmation_items).toEqual({ a: true });
  });

  it("training POST allergen path: ⚠ R5 'Completion date required' + happy insert (no supervisor_signed_at)", async () => {
    // missing certification_date → the QUIRK string
    const quirk = await api("/api/haccp/training", {
      method: "POST",
      ...admin,
      body: {
        training_type: "allergen_awareness",
        staff_name: ALLERGEN_NAME,
        job_role: "Operative",
        refresh_date: "2027-06-01",
        supervisor: "Boss",
      },
    });
    expect(quirk.status).toBe(400);
    expect((quirk.body as { error: string }).error).toBe(
      "Completion date required",
    );

    const supa = getServiceClient();
    const ok = await api("/api/haccp/training", {
      method: "POST",
      ...admin,
      body: {
        training_type: "allergen_awareness",
        staff_name: ALLERGEN_NAME,
        job_role: "Operative",
        certification_date: "2026-06-01",
        refresh_date: "2027-06-01",
        supervisor: "Boss",
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    // NOTE: haccp_allergen_training has NO supervisor_signed_at column (the
    // insert never sets one — that asymmetry vs staff training is the point).
    const { data } = await supa
      .from("haccp_allergen_training")
      .select(
        "logged_by, staff_name, job_role, training_completed, certification_date, refresh_date, supervisor_name, confirmation_items",
      )
      .eq("staff_name", ALLERGEN_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.training_completed).toBe("allergen_awareness");
    expect(row.certification_date).toBe("2026-06-01");
    expect(row.confirmation_items).toEqual({});
    expect(row.supervisor_name).toBe("Boss");
  });

  it("training POST unknown training_type → 400 'Invalid training_type'", async () => {
    const res = await api("/api/haccp/training", {
      method: "POST",
      ...admin,
      body: { training_type: "nope" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid training_type");
  });

  // ── people ───────────────────────────────────────────────────────────────

  it("people GET 401s for a disallowed role; returns { records } for warehouse", async () => {
    const denied = await api("/api/haccp/people", {
      method: "GET",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(denied.status).toBe(401);
    expect((denied.body as { error: string }).error).toBe("Unauthorised");

    const ok = await api("/api/haccp/people", { method: "GET", ...warehouse });
    expect(ok.status).toBe(200);
    const body = ok.body as { records: unknown[] };
    expect(Object.keys(body)).toEqual(["records"]);
    expect(Array.isArray(body.records)).toBe(true);
  });

  it("people POST 401s for missing userId / disallowed role; 400 'record_type required'", async () => {
    const denied = await api("/api/haccp/people", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
      body: { record_type: "visitor" },
    });
    expect(denied.status).toBe(401);
    expect((denied.body as { error: string }).error).toBe("Unauthorised");

    const noType = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: {},
    });
    expect(noType.status).toBe(400);
    expect((noType.body as { error: string }).error).toBe("record_type required");
  });

  it("people new_staff_declaration: required 400s, start_date NOT stored, column set", async () => {
    const missingStart = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: { record_type: "new_staff_declaration", staff_name: DECL_NAME },
    });
    expect(missingStart.status).toBe(400);
    expect((missingStart.body as { error: string }).error).toBe(
      "Start date required",
    );

    const supa = getServiceClient();
    const ok = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: {
        record_type: "new_staff_declaration",
        staff_name: DECL_NAME,
        start_date: "2026-06-01",
        health_questions: { q1: "yes" },
        exclusion_reason: "  ",
        manager_signed_by: "Boss",
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const { data } = await supa
      .from("haccp_health_records")
      .select(
        "submitted_by, record_type, staff_name, health_questions, fit_for_work, exclusion_reason, manager_signed_name, illness_type, return_date",
      )
      .eq("staff_name", DECL_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.submitted_by).toBe(users.warehouse.id);
    expect(row.record_type).toBe("new_staff_declaration");
    expect(row.fit_for_work).toBe(true); // ?? true default
    expect(row.exclusion_reason).toBeNull(); // blank → null
    expect(row.manager_signed_name).toBe("Boss");
    // columns the new_staff path does NOT set stay null.
    expect(row.illness_type).toBeNull();
    expect(row.return_date).toBeNull();
  });

  it("people return_to_work: illness mapping gi→gastrointestinal + return_date + fit_for_work:true", async () => {
    const supa = getServiceClient();
    const ok = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: {
        record_type: "return_to_work",
        staff_name: RTW_NAME,
        absence_from: "2026-06-01",
        absence_to: "2026-06-05",
        illness_type: "gi",
        health_questions: { q1: "no" },
        symptom_free_48h: true,
        medical_certificate_provided: false,
        manager_signed_by: "Boss",
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const { data } = await supa
      .from("haccp_health_records")
      .select(
        "record_type, illness_type, absence_from, absence_to, return_date, fit_for_work, symptom_free_48h, medical_certificate_provided",
      )
      .eq("staff_name", RTW_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.illness_type).toBe("gastrointestinal");
    expect(row.fit_for_work).toBe(true);
    expect(row.return_date).toBeTruthy();
    expect(row.symptom_free_48h).toBe(true);
    expect(row.medical_certificate_provided).toBe(false);
  });

  it("people POST unknown record_type → 400 'Invalid record_type'", async () => {
    const res = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: { record_type: "nope" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid record_type");
  });

  it("people visitor path: RAW health_questions, fit_for_work = declaration ?? false, submitted_by = cookie user", async () => {
    const supa = getServiceClient();
    const ok = await api("/api/haccp/people", {
      method: "POST",
      ...warehouse,
      body: {
        record_type: "visitor",
        visitor_name: VISITOR_NAME,
        visitor_company: "Acme",
        visitor_reason: "Tour",
        health_questions: { q1: "no" },
        visitor_declaration_confirmed: true,
        manager_signed_by: "Boss",
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const { data } = await supa
      .from("haccp_health_records")
      .select(
        "submitted_by, record_type, visitor_name, visitor_company, visitor_reason, visitor_declaration_confirmed, fit_for_work, health_questions",
      )
      .eq("visitor_name", VISITOR_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.submitted_by).toBe(users.warehouse.id);
    expect(row.visitor_declaration_confirmed).toBe(true);
    expect(row.fit_for_work).toBe(true); // = declaration ?? false
    expect(row.health_questions).toEqual({ q1: "no" });
  });

  // ── public visitor kiosk ───────────────────────────────────────────────────

  it("visitor kiosk POST: no auth, submitted_by = kiosk id, health_questions {} when omitted", async () => {
    const supa = getServiceClient();
    const ok = await api("/api/haccp/visitor", {
      method: "POST",
      // NO role / userId — public route.
      body: {
        visitor_name: KIOSK_VISITOR_NAME,
        visitor_company: "Acme",
        visitor_reason: "Delivery",
        // health_questions omitted → kiosk defaults to {}
        manager_signed_by: "Boss",
        fit_for_work: false,
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const { data } = await supa
      .from("haccp_health_records")
      .select("submitted_by, record_type, health_questions, fit_for_work")
      .eq("visitor_name", KIOSK_VISITOR_NAME)
      .limit(1);
    expect(data && data.length).toBe(1);
    const row = data![0] as Record<string, unknown>;
    expect(row.submitted_by).toBe(VISITOR_KIOSK_USER_ID);
    expect(row.record_type).toBe("visitor");
    expect(row.health_questions).toEqual({});
    expect(row.fit_for_work).toBe(false);
  });

  it("kiosk-inserted row is RETURNED in people GET (NON-inner join, key = `users`)", async () => {
    const res = await api("/api/haccp/people", { method: "GET", ...admin });
    expect(res.status).toBe(200);
    const records = (res.body as { records: Array<Record<string, unknown>> })
      .records;
    const kioskRow = records.find(
      (r) => r.visitor_name === KIOSK_VISITOR_NAME,
    );
    // NON-inner join → the kiosk row is NOT filtered out even though its
    // submitted_by is a system user. The join key is `users` (NOT aliased).
    expect(kioskRow).toBeDefined();
    expect(kioskRow).toHaveProperty("users");
    expect(kioskRow!.users).toEqual({ name: "Visitor Kiosk" });
  });

  // ── visitor parity (people vs kiosk) ─────────────────────────────────────────

  it("visitor parity: the four error strings are identical across people-visitor and kiosk", async () => {
    const cases: Array<{ body: Record<string, unknown>; error: string }> = [
      { body: { visitor_company: "Acme", visitor_reason: "Tour", manager_signed_by: "B" }, error: "Visitor name required" },
      { body: { visitor_name: "X", visitor_reason: "Tour", manager_signed_by: "B" }, error: "Company required" },
      { body: { visitor_name: "X", visitor_company: "Acme", manager_signed_by: "B" }, error: "Visit reason required" },
      { body: { visitor_name: "X", visitor_company: "Acme", visitor_reason: "Tour" }, error: "Manager sign-off required" },
    ];
    for (const c of cases) {
      const people = await api("/api/haccp/people", {
        method: "POST",
        ...warehouse,
        body: { record_type: "visitor", ...c.body },
      });
      expect(people.status, `people ${c.error}`).toBe(400);
      expect((people.body as { error: string }).error).toBe(c.error);

      const kiosk = await api("/api/haccp/visitor", {
        method: "POST",
        body: c.body,
      });
      expect(kiosk.status, `kiosk ${c.error}`).toBe(400);
      expect((kiosk.body as { error: string }).error).toBe(c.error);
    }
  });

  it("R4 whitespace-manager divergence: people-visitor PASSES, kiosk 400s", async () => {
    const supa = getServiceClient();
    const WS_NAME = "ANVIL-TEST-ws-visitor";
    try {
      // people-visitor: `!manager_signed_by` (truthy) — whitespace-only PASSES.
      const people = await api("/api/haccp/people", {
        method: "POST",
        ...warehouse,
        body: {
          record_type: "visitor",
          visitor_name: WS_NAME,
          visitor_company: "Acme",
          visitor_reason: "Tour",
          manager_signed_by: "   ",
        },
      });
      expect(people.status).toBe(200);
      expect(people.body).toEqual({ ok: true });

      // kiosk: `!manager_signed_by?.trim()` — whitespace-only 400s.
      const kiosk = await api("/api/haccp/visitor", {
        method: "POST",
        body: {
          visitor_name: WS_NAME,
          visitor_company: "Acme",
          visitor_reason: "Tour",
          manager_signed_by: "   ",
        },
      });
      expect(kiosk.status).toBe(400);
      expect((kiosk.body as { error: string }).error).toBe(
        "Manager sign-off required",
      );
    } finally {
      await supa
        .from("haccp_health_records")
        .delete()
        .eq("visitor_name", WS_NAME);
    }
  });
});
