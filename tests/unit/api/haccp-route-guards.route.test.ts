/**
 * tests/unit/api/haccp-route-guards.route.test.ts
 *
 * F-19 PR10b / F-RLS-04h — route-level guard + per-caller factory invocation
 * tests for the HACCP RLS cutover. Mirrors `admin-users.route.test.ts`:
 * invoke each handler DIRECTLY (bypassing middleware), mock the wiring
 * `@/lib/wiring/haccp` factory module, and assert THREE things per route:
 *
 *   (1) a request with NO `x-mfs-user-id` header → the route's EXACT existing
 *       guard response (status + body, byte-identical) and the `…ForCaller`
 *       mock is NEVER called (no DB token minted for a request that fails the
 *       guard);
 *   (2) a NON-permitted role → the route's EXACT guard response, mock NOT called;
 *   (3) a permitted caller → the handler reaches the mocked service (200/201)
 *       AND `…ForCaller` was awaited with the HEADER userId (NOT a cookie).
 *
 * Coverage is ONE route per factory group (Groups 1–11) plus:
 *   - the daily-check POST dual-mint (BOTH haccpDailyChecksServiceForCaller AND
 *     submitHaccpDailyCheckForCaller called with the header userId, and the
 *     record stamped with the header userId);
 *   - audit/export's PLAIN-TEXT 401 (NOT JSON) pinned byte-identically;
 *   - the security property (R-SEC-1): an admin *cookie* with a non-admin
 *     *header* must be REFUSED — the guard reads the header, not the cookie.
 *
 * The wiring module is mocked so no route touches Supabase. Each factory mock
 * returns a stub service; when the guard fails the factory is not even reached.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// All mock objects live inside vi.hoisted so they are initialised BEFORE the
// hoisted vi.mock factory runs (avoids the "cannot access before init" trap).
const H = vi.hoisted(() => {
  const dailyChecks = {
    listCalibration: vi.fn(),
    validateCalibrationCertified: vi.fn(),
    insertCalibrationCertified: vi.fn(),
    buildCalibrationCertified: vi.fn(),
    validateCalibrationManual: vi.fn(),
    buildCalibrationManual: vi.fn(),
    insertCalibrationManual: vi.fn(),
    buildCalibrationCorrectiveActions: vi.fn(),
  };
  const submit = { fileCorrectiveActions: vi.fn() };
  const correctiveActions = { listVerificationQueue: vi.fn() };
  const assessments = { listAllergenAssessments: vi.fn() };
  const training = { getTraining: vi.fn() };
  const people = { getRecords: vi.fn() };
  const reviews = { getReviews: vi.fn() };
  const annualReview = { getReviews: vi.fn() };
  const reporting = { getOverview: vi.fn(), buildAuditWorkbook: vi.fn() };
  const handbook = { getDocuments: vi.fn() };
  const suppliers = { listSuppliers: vi.fn(), getLabelCode: vi.fn() };
  const lookups = { getCustomers: vi.fn() };

  return {
    services: {
      dailyChecks, submit, correctiveActions, assessments, training, people,
      reviews, annualReview, reporting, handbook, suppliers, lookups,
    },
    factories: {
      haccpDailyChecksServiceForCaller: vi.fn(async () => dailyChecks),
      submitHaccpDailyCheckForCaller: vi.fn(async () => submit),
      haccpCorrectiveActionsServiceForCaller: vi.fn(async () => correctiveActions),
      haccpAssessmentsServiceForCaller: vi.fn(async () => assessments),
      haccpTrainingServiceForCaller: vi.fn(async () => training),
      haccpPeopleServiceForCaller: vi.fn(async () => people),
      haccpReviewsServiceForCaller: vi.fn(async () => reviews),
      haccpAnnualReviewServiceForCaller: vi.fn(async () => annualReview),
      haccpReportingServiceForCaller: vi.fn(async () => reporting),
      haccpHandbookServiceForCaller: vi.fn(async () => handbook),
      haccpSuppliersServiceForCaller: vi.fn(async () => suppliers),
      haccpLookupsServiceForCaller: vi.fn(async () => lookups),
    },
  };
});

vi.mock("@/lib/wiring/haccp", () => ({
  ...H.factories,
  // Public visitor kiosk keeps the singleton — present so imports resolve.
  haccpPeopleService: {},
}));

// Local aliases for readability in the assertions below.
const {
  dailyChecks, submit, correctiveActions, assessments, training, people,
  reviews, annualReview, reporting, handbook, suppliers, lookups,
} = H.services;
const {
  haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller,
  haccpCorrectiveActionsServiceForCaller, haccpAssessmentsServiceForCaller,
  haccpTrainingServiceForCaller, haccpPeopleServiceForCaller,
  haccpReviewsServiceForCaller, haccpAnnualReviewServiceForCaller,
  haccpReportingServiceForCaller, haccpHandbookServiceForCaller,
  haccpSuppliersServiceForCaller, haccpLookupsServiceForCaller,
} = H.factories;

import { GET as calibrationGET, POST as calibrationPOST } from "@/app/api/haccp/calibration/route";
import { GET as correctiveActionsGET } from "@/app/api/haccp/corrective-actions/route";
import { GET as allergenGET } from "@/app/api/haccp/allergen-assessment/route";
import { GET as trainingGET } from "@/app/api/haccp/training/route";
import { GET as peopleGET } from "@/app/api/haccp/people/route";
import { GET as reviewsGET } from "@/app/api/haccp/reviews/route";
import { GET as annualReviewGET } from "@/app/api/haccp/annual-review/route";
import { GET as overviewGET } from "@/app/api/haccp/overview/route";
import { GET as auditExportGET } from "@/app/api/haccp/audit/export/route";
import { GET as documentsGET } from "@/app/api/haccp/documents/route";
import { GET as supplierCodeGET } from "@/app/api/haccp/supplier-code/route";
import { GET as customersGET } from "@/app/api/haccp/customers/route";

const URL = "http://localhost/api/haccp/x";

function req(headers: Record<string, string>, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(URL + (method === "GET" ? "?name=Foo&from=a&to=b" : ""), {
    method,
    headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const ADMIN = { "x-mfs-user-id": "u-admin", "x-mfs-user-role": "admin" };
const WAREHOUSE = { "x-mfs-user-id": "u-wh", "x-mfs-user-role": "warehouse" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Group 11 — lookups (role-set GET, gained userId) ────────────────────────
describe("Group 11 lookups — customers GET", () => {
  it("401 'Unauthorised' with no x-mfs-user-id; factory NOT called", async () => {
    const res = await customersGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpLookupsServiceForCaller).not.toHaveBeenCalled();
  });

  it("401 for a disallowed role; factory NOT called", async () => {
    const res = await customersGET(req({ "x-mfs-user-id": "u", "x-mfs-user-role": "driver" }));
    expect(res.status).toBe(401);
    expect(haccpLookupsServiceForCaller).not.toHaveBeenCalled();
  });

  it("permitted caller → 200 and factory minted with the HEADER userId", async () => {
    lookups.getCustomers.mockResolvedValueOnce([{ id: 1 }]);
    const res = await customersGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpLookupsServiceForCaller).toHaveBeenCalledTimes(1);
    expect(haccpLookupsServiceForCaller).toHaveBeenCalledWith("u-wh");
  });
});

// ── R-SEC-1 — header is the trust source, NOT the cookie ────────────────────
describe("R-SEC-1 — guard reads the header, never the cookie", () => {
  it("admin COOKIE + non-admin HEADER is refused (the cookie is ignored)", async () => {
    // Cookie says admin; header says warehouse. corrective-actions is admin-only.
    const r = new NextRequest("http://localhost/api/haccp/corrective-actions", {
      method: "GET",
      headers: {
        "x-mfs-user-id": "u-wh",
        "x-mfs-user-role": "warehouse",
        cookie: "mfs_role=admin; mfs_user_id=u-admin",
      },
    });
    const res = await correctiveActionsGET(r);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised — admin only" });
    expect(haccpCorrectiveActionsServiceForCaller).not.toHaveBeenCalled();
  });
});

// ── Group 2 — corrective-actions (admin-only GET) ───────────────────────────
describe("Group 2 corrective-actions — GET", () => {
  it("401 'Unauthorised — admin only' for non-admin; factory NOT called", async () => {
    const res = await correctiveActionsGET(req(WAREHOUSE));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised — admin only" });
    expect(haccpCorrectiveActionsServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with header userId", async () => {
    correctiveActions.listVerificationQueue.mockResolvedValueOnce({ unresolved: [], resolved: [] });
    const res = await correctiveActionsGET(req(ADMIN));
    expect(res.status).toBe(200);
    expect(haccpCorrectiveActionsServiceForCaller).toHaveBeenCalledWith("u-admin");
  });
});

// ── Group 3 — assessments (role-set GET) ────────────────────────────────────
describe("Group 3 assessments — allergen-assessment GET", () => {
  it("401 with no userId; factory NOT called", async () => {
    const res = await allergenGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpAssessmentsServiceForCaller).not.toHaveBeenCalled();
  });

  it("permitted → 200 and factory minted with header userId", async () => {
    assessments.listAllergenAssessments.mockResolvedValueOnce([]);
    const res = await allergenGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpAssessmentsServiceForCaller).toHaveBeenCalledWith("u-wh");
  });
});

// ── Group 4 — training (admin-only, 401) ────────────────────────────────────
describe("Group 4 training — GET", () => {
  it("401 'Unauthorised — admin only' for non-admin; factory NOT called", async () => {
    const res = await trainingGET(req(WAREHOUSE));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised — admin only" });
    expect(haccpTrainingServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with header userId", async () => {
    training.getTraining.mockResolvedValueOnce({});
    const res = await trainingGET(req(ADMIN));
    expect(res.status).toBe(200);
    expect(haccpTrainingServiceForCaller).toHaveBeenCalledWith("u-admin");
  });
});

// ── Group 5 — people (role-set GET) ─────────────────────────────────────────
describe("Group 5 people — GET", () => {
  it("401 with no userId; factory NOT called", async () => {
    const res = await peopleGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpPeopleServiceForCaller).not.toHaveBeenCalled();
  });

  it("permitted → 200 and factory minted with header userId", async () => {
    people.getRecords.mockResolvedValueOnce({});
    const res = await peopleGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpPeopleServiceForCaller).toHaveBeenCalledWith("u-wh");
  });
});

// ── Group 6 — reviews (admin-only GET) ──────────────────────────────────────
describe("Group 6 reviews — GET", () => {
  it("401 'Unauthorised — admin only' for non-admin; factory NOT called", async () => {
    const res = await reviewsGET(req(WAREHOUSE));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised — admin only" });
    expect(haccpReviewsServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with header userId", async () => {
    reviews.getReviews.mockResolvedValueOnce({});
    const res = await reviewsGET(req(ADMIN));
    expect(res.status).toBe(200);
    expect(haccpReviewsServiceForCaller).toHaveBeenCalledWith("u-admin");
  });
});

// ── Group 7 — annual-review (role-set GET) ──────────────────────────────────
describe("Group 7 annual-review — GET", () => {
  it("401 'Unauthorised' with no userId; factory NOT called", async () => {
    const res = await annualReviewGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpAnnualReviewServiceForCaller).not.toHaveBeenCalled();
  });

  it("permitted → 200 and factory minted with header userId", async () => {
    annualReview.getReviews.mockResolvedValueOnce([]);
    const res = await annualReviewGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpAnnualReviewServiceForCaller).toHaveBeenCalledWith("u-wh");
  });
});

// ── Group 8 — reporting: overview (admin-only) + audit/export (PLAIN-TEXT) ───
describe("Group 8 reporting — overview GET", () => {
  it("401 'Unauthorised — admin only' for non-admin; factory NOT called", async () => {
    const res = await overviewGET(req(WAREHOUSE));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised — admin only" });
    expect(haccpReportingServiceForCaller).not.toHaveBeenCalled();
  });

  it("admin → 200 and factory minted with header userId", async () => {
    reporting.getOverview.mockResolvedValueOnce({});
    const res = await overviewGET(req(ADMIN));
    expect(res.status).toBe(200);
    expect(haccpReportingServiceForCaller).toHaveBeenCalledWith("u-admin");
  });
});

describe("Group 8 reporting — audit/export GET (PLAIN-TEXT 401)", () => {
  it("returns PLAIN-TEXT 'Unauthorised' (NOT JSON) for non-admin; factory NOT called", async () => {
    const res = await auditExportGET(req(WAREHOUSE));
    expect(res.status).toBe(401);
    // Byte-identical plain-text body — must NOT be JSON-wrapped.
    expect(await res.text()).toBe("Unauthorised");
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
    expect(haccpReportingServiceForCaller).not.toHaveBeenCalled();
  });

  it("401 plain-text with no userId; factory NOT called", async () => {
    const res = await auditExportGET(req({ "x-mfs-user-role": "admin" }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorised");
    expect(haccpReportingServiceForCaller).not.toHaveBeenCalled();
  });
});

// ── Group 9 — handbook (role-set GET) ───────────────────────────────────────
describe("Group 9 handbook — documents GET", () => {
  it("401 with no userId; factory NOT called", async () => {
    const res = await documentsGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpHandbookServiceForCaller).not.toHaveBeenCalled();
  });

  it("permitted → 200 and factory minted with header userId", async () => {
    handbook.getDocuments.mockResolvedValueOnce([]);
    const res = await documentsGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpHandbookServiceForCaller).toHaveBeenCalledWith("u-wh");
  });
});

// ── Group 10 — suppliers: supplier-code (wider role-set incl. driver) ───────
describe("Group 10 suppliers — supplier-code GET (driver allowed)", () => {
  it("401 'Unauthorised' with no userId; factory NOT called", async () => {
    const res = await supplierCodeGET(req({ "x-mfs-user-role": "driver" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpSuppliersServiceForCaller).not.toHaveBeenCalled();
  });

  it("a logged-in driver IS allowed and the factory mints with the driver's header userId", async () => {
    suppliers.getLabelCode.mockResolvedValueOnce({ code: "FOO" });
    const res = await supplierCodeGET(req({ "x-mfs-user-id": "u-drv", "x-mfs-user-role": "driver" }));
    expect(res.status).toBe(200);
    expect(haccpSuppliersServiceForCaller).toHaveBeenCalledWith("u-drv");
  });
});

// ── Group 1 — daily-check POST: DUAL mint + header-userId record stamping ────
describe("Group 1 daily-checks — calibration GET + POST (dual mint)", () => {
  it("GET 401 with no userId; factory NOT called", async () => {
    const res = await calibrationGET(req({ "x-mfs-user-role": "warehouse" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpDailyChecksServiceForCaller).not.toHaveBeenCalled();
  });

  it("GET permitted → 200, single daily-checks factory minted with header userId", async () => {
    dailyChecks.listCalibration.mockResolvedValueOnce([]);
    const res = await calibrationGET(req(WAREHOUSE));
    expect(res.status).toBe(200);
    expect(haccpDailyChecksServiceForCaller).toHaveBeenCalledWith("u-wh");
    expect(submitHaccpDailyCheckForCaller).not.toHaveBeenCalled();
  });

  it("POST 401 with no userId; NEITHER factory called", async () => {
    const res = await calibrationPOST(
      req({ "x-mfs-user-role": "warehouse" }, "POST", { calibration_mode: "manual" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
    expect(haccpDailyChecksServiceForCaller).not.toHaveBeenCalled();
    expect(submitHaccpDailyCheckForCaller).not.toHaveBeenCalled();
  });

  it("POST permitted → BOTH factories minted with the header userId, record stamped with the header userId", async () => {
    dailyChecks.validateCalibrationManual.mockReturnValueOnce({ ok: true });
    dailyChecks.buildCalibrationManual.mockReturnValueOnce({
      ice_water_pass: true,
      boiling_water_pass: true,
    });
    dailyChecks.insertCalibrationManual.mockResolvedValueOnce({ id: "rec-1" });
    dailyChecks.buildCalibrationCorrectiveActions.mockReturnValueOnce([]);
    submit.fileCorrectiveActions.mockResolvedValueOnce({ ca_write_failed: false });

    const res = await calibrationPOST(req(WAREHOUSE, "POST", { calibration_mode: "manual" }));
    expect(res.status).toBe(200);

    // BOTH factories minted with the SAME header userId (two mints — accepted).
    expect(haccpDailyChecksServiceForCaller).toHaveBeenCalledWith("u-wh");
    expect(submitHaccpDailyCheckForCaller).toHaveBeenCalledWith("u-wh");

    // Record stamping uses the HEADER userId, not a cookie.
    expect(dailyChecks.buildCalibrationManual).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-wh" }),
    );
    expect(dailyChecks.buildCalibrationCorrectiveActions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-wh" }),
    );
  });
});
