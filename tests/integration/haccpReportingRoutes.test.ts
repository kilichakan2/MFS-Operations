/**
 * tests/integration/haccpReportingRoutes.test.ts
 *
 * Integration tests for the F-19 PR8 Cluster E "reporting" route re-point. The 6
 * read-only reporting route files now call the `haccpReportingService` singleton
 * from `@/lib/wiring/haccp` (built + proved byte-identical in PR7) instead of
 * inline `supabaseService` / `import * as XLSX from 'xlsx'`. Each route is now a
 * thin doorman: role-check → require params → ask the service → return.
 *
 * The intent is BYTE-IDENTICAL behaviour. These tests drive the LIVE HTTP routes
 * on the booted dev server via `api()`, so they catch any wiring/ordering mistake
 * the re-point could introduce — the layer the PR7 unit parity suite
 * (tests/unit/services/HaccpReportingService.test.ts) cannot reach.
 *
 * The 6 routes:
 *   GET /api/haccp/today-status            (warehouse|butcher|admin)
 *   GET /api/haccp/overview                (admin; both from+to required → 400)
 *   GET /api/haccp/annual-review/data      (warehouse|butcher|admin; from/to optional)
 *   GET /api/haccp/audit/heatmap           (admin)
 *   GET /api/haccp/audit?section=…         (admin; unknown → 400, missing → 400; R6 500)
 *   GET /api/haccp/audit/export            (admin; 14-tab .xlsx download)
 *
 * R6 note: the audit route's DB-error → HTTP 500 `{ error: 'Server error' }`
 * catch (no raw Postgres text echoed) is exercised deterministically at the unit
 * level (HaccpReportingService throws → route catch). A clean DB-error injection
 * is not feasible at the integration level without corrupting the shared local
 * schema, so here we PROVE THE NEGATIVE that matters for R6: across the normal +
 * error-input branches the audit route NEVER leaks raw Postgres text, and the two
 * route-owned 400 branches (unknown-section, section-missing) behave exactly as
 * the route promises. See the cert for the explicit R6 coverage split.
 *
 * The export route is parsed with the real `xlsx` reader off the returned bytes —
 * exactly 14 sheets, in the documented order, with the right download headers.
 *
 * Prereqs: npm run db:up (once) + npm run db:reset (fresh seed). Run via
 * npm run test:integration (auto-boots the local-wired dev server).
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import { api, setupTestUsers, type TestUserSet } from "./_setup";

// London "today" exactly as the routes compute it.
function todayUK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function nDaysAgoUK(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

const TODAY = todayUK();
const FROM = nDaysAgoUK(30);

// The 14 audit-export tabs, in the exact documented order. Mirrors the PR7 unit
// parity suite — duplicated here deliberately so the HTTP layer is pinned
// independently of the service-level test.
const EXPECTED_TABS = [
  "01 Deliveries",
  "02 Cold Storage",
  "03a Process Room Temps",
  "03b Process Room Diary",
  "04 Cleaning",
  "05 Calibration",
  "06 Mince & Prep",
  "07 Product Returns",
  "08 Corrective Actions",
  "09a Weekly Reviews",
  "09b Monthly Reviews",
  "10 Health & People",
  "11a Staff Training",
  "11b Allergen Training",
];

// Every valid audit section the service accepts (HaccpReportingService.ts).
const VALID_SECTIONS = [
  "deliveries",
  "cold_storage",
  "process_room",
  "cleaning",
  "calibration",
  "mince",
  "returns",
  "ccas",
  "reviews",
  "health",
  "training",
];

/** True if a string looks like leaked raw Postgres / PostgREST error text. */
function looksLikeRawDbError(s: string): boolean {
  return /relation\s+"|column\s+"|PGRST\d|duplicate key value|syntax error at|violates|pg_|postgres/i.test(
    s,
  );
}

describe("/api/haccp/* reporting — F-19 PR8 byte-identical doorman re-point", () => {
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
  }, 30_000);

  // ── Role gates ────────────────────────────────────────────────────────────

  it("admin-only routes 401 for a non-admin role (sales)", async () => {
    const adminOnly = [
      "/api/haccp/overview?from=" + FROM + "&to=" + TODAY,
      "/api/haccp/audit?section=deliveries&from=" + FROM + "&to=" + TODAY,
      "/api/haccp/audit/heatmap?from=" + FROM + "&to=" + TODAY,
    ];
    for (const path of adminOnly) {
      const res = await api(path, {
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(res.status, path).toBe(401);
    }
  });

  it("audit/export 401 (plain-text body) for a non-admin role (sales)", async () => {
    const res = await api("/api/haccp/audit/export?from=" + FROM + "&to=" + TODAY, {
      role: "sales",
      userId: users.sales.id,
      name: users.sales.name,
    });
    expect(res.status).toBe(401);
    expect(res.raw).toBe("Unauthorised");
  });

  it("today-status + annual-review/data 401 for a disallowed role (sales)", async () => {
    for (const path of ["/api/haccp/today-status", "/api/haccp/annual-review/data"]) {
      const res = await api(path, {
        role: "sales",
        userId: users.sales.id,
        name: users.sales.name,
      });
      expect(res.status, path).toBe(401);
      expect((res.body as { error: string }).error).toBe("Unauthorised");
    }
  });

  // ── 1. today-status ───────────────────────────────────────────────────────

  it("today-status → 200 with the full tile object (warehouse)", async () => {
    const res = await api("/api/haccp/today-status", { ...warehouse });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // Shape spot-check: the tile keys the home screen reads.
    for (const key of [
      "cold_storage",
      "processing_room",
      "daily_diary",
      "cleaning",
      "deliveries",
      "mince_runs",
      "product_returns",
      "corrective_actions",
      "total_checks",
      "completed_checks",
    ]) {
      expect(body, `today-status missing key ${key}`).toHaveProperty(key);
    }
    expect(typeof body.total_checks).toBe("number");
    expect(typeof body.completed_checks).toBe("number");
  });

  // ── 2. overview ───────────────────────────────────────────────────────────

  it("overview missing from → 400 'from and to date parameters required'", async () => {
    const res = await api("/api/haccp/overview?to=" + TODAY, { ...admin });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "from and to date parameters required",
    );
  });

  it("overview missing to → 400 'from and to date parameters required'", async () => {
    const res = await api("/api/haccp/overview?from=" + FROM, { ...admin });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "from and to date parameters required",
    );
  });

  it("overview with both dates → 200 with from/to echoed + expected_days", async () => {
    const res = await api(
      "/api/haccp/overview?from=" + FROM + "&to=" + TODAY,
      { ...admin },
    );
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.from).toBe(FROM);
    expect(body.to).toBe(TODAY);
    expect(Array.isArray(body.expected_days)).toBe(true);
    // Aggregated sections the overview overlay reads.
    for (const key of ["goods_in", "cold_storage", "process_room", "corrective_actions"]) {
      expect(body, `overview missing key ${key}`).toHaveProperty(key);
    }
  });

  // ── 3. annual-review/data ─────────────────────────────────────────────────

  it("annual-review/data with from&to → 200 with the SALSA 3.x blocks", async () => {
    const res = await api(
      "/api/haccp/annual-review/data?from=" +
        nDaysAgoUK(365) +
        "&to=" +
        TODAY,
      { ...admin },
    );
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // The route returns the SALSA section map keyed "3.2".."3.9".
    for (const key of ["3.2", "3.3", "3.4", "3.6", "3.7", "3.8", "3.9"]) {
      expect(body, `annual-review missing block ${key}`).toHaveProperty(key);
    }
  });

  it("annual-review/data WITHOUT from&to → 200 (optional params, empties)", async () => {
    const res = await api("/api/haccp/annual-review/data", { ...admin });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    // Period-filtered section stays present but empty (route allows missing dates).
    expect(body).toHaveProperty("3.3");
    expect((body["3.3"] as Record<string, unknown[]>).new_staff).toEqual([]);
  });

  // ── 4. audit/heatmap ──────────────────────────────────────────────────────

  it("audit/heatmap → 200 with all 11 day-map keys", async () => {
    const res = await api(
      "/api/haccp/audit/heatmap?from=" + FROM + "&to=" + TODAY,
      { ...admin },
    );
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      "deliveries",
      "cold_am",
      "cold_pm",
      "room_am",
      "room_pm",
      "diary_open",
      "diary_operational",
      "diary_close",
      "cleaning",
      "mince",
      "calibration",
    ]);
  });

  // ── 5. audit (per-section) ────────────────────────────────────────────────

  it("audit section-missing → 400 'section param required'", async () => {
    const res = await api("/api/haccp/audit?from=" + FROM + "&to=" + TODAY, {
      ...admin,
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("section param required");
  });

  it("audit unknown section (bogus) → 400 'Unknown section: bogus'", async () => {
    const res = await api(
      "/api/haccp/audit?section=bogus&from=" + FROM + "&to=" + TODAY,
      { ...admin },
    );
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("Unknown section: bogus");
  });

  it("every valid audit section → 200, never leaks raw Postgres text (R6 negative)", async () => {
    for (const section of VALID_SECTIONS) {
      const res = await api(
        "/api/haccp/audit?section=" + section + "&from=" + FROM + "&to=" + TODAY,
        { ...admin },
      );
      expect(res.status, `section ${section} status`).toBe(200);
      // R6 contract: even though this is the happy path, prove the route never
      // echoes raw DB internals — the same body that the 500 catch protects.
      expect(
        looksLikeRawDbError(res.raw),
        `section ${section} leaked raw DB text: ${res.raw.slice(0, 200)}`,
      ).toBe(false);
      // 200 bodies are objects, never an { error } envelope on the happy path.
      expect(res.body, `section ${section} body`).not.toHaveProperty("error");
    }
  });

  // ── 6. audit/export — the 14-tab workbook ─────────────────────────────────

  it("audit/export → 200 xlsx download: headers + 14 sheets in order, parseable bytes", async () => {
    // Raw download so we can read binary bytes + headers (the `api()` helper
    // text-decodes; for the workbook we need the response object). Node's
    // global fetch handles binary via arrayBuffer().
    const url = "/api/haccp/audit/export?from=" + FROM + "&to=" + TODAY;
    const res = await rawDownload(url, admin);

    expect(res.status).toBe(200);
    expect(res.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.contentDisposition).toContain("attachment");
    expect(res.contentDisposition).toContain(
      `filename="MFS_HACCP_Audit_${FROM}_to_${TODAY}.xlsx"`,
    );
    expect(res.contentLength).toBeGreaterThan(0);
    expect(res.byteLength).toBe(res.contentLength);

    // Parse the actual downloaded bytes with the real xlsx reader.
    const wb = XLSX.read(Buffer.from(res.bytes), { type: "buffer" });
    expect(wb.SheetNames).toEqual(EXPECTED_TABS);
    expect(wb.SheetNames).toHaveLength(14);
  });
});

/**
 * Download a binary route response, returning status + key headers + raw bytes.
 * Mirrors the cookie-auth contract of the shared `api()` helper but keeps the
 * body as bytes so the xlsx workbook can be parsed.
 */
async function rawDownload(
  path: string,
  actor: { role: string; userId: string; name: string },
): Promise<{
  status: number;
  contentType: string | null;
  contentDisposition: string | null;
  contentLength: number;
  byteLength: number;
  bytes: Uint8Array;
}> {
  const { signSessionCookie } = await import("./_setup");
  const { INTEGRATION_BASE_URL } = await import("./_config");

  const token = await signSessionCookie({
    userId: actor.userId,
    name: actor.name,
    role: actor.role,
  });
  const cookie = [
    `mfs_role=${actor.role}`,
    `mfs_user_id=${actor.userId}`,
    `mfs_session=${token}`,
  ].join("; ");

  const res = await fetch(`${INTEGRATION_BASE_URL}${path}`, {
    method: "GET",
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    contentDisposition: res.headers.get("content-disposition"),
    contentLength: Number(res.headers.get("content-length") ?? "0"),
    byteLength: bytes.byteLength,
    bytes,
  };
}
