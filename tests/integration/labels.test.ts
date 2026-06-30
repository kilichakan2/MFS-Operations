/**
 * tests/integration/labels.test.ts
 *
 * ANVIL integration proof for the F-PROD-04 beef mince + meat-prep BLS
 * dispatch labels (PR #102). Exercises the REAL path:
 *
 *   local Supabase  →  GET /api/labels  →  server BLS aggregation  →  renderer
 *
 * It plants its OWN sentinel meatprep run, mince run and source deliveries
 * (carrying born_in / reared_in / slaughter_site / cut_site traceability),
 * then asserts the regulated BLS granularity rules the unit oracle pins,
 * but now proven end-to-end through the database and the route handler —
 * not a hand-built LabelData object.
 *
 * Regulated rules under test (RPA digest, mirrored from
 * tests/unit/labelPrinting.test.ts):
 *   - PREP  → slaughtered_in + cut_in keep COUNTRY+PLANT (e.g. GB1234, GB5678);
 *             "Further cut in" is MFS GB2946; multi-source lists DISTINCT values.
 *   - MINCE → slaughtered_in is COUNTRY-ONLY (GB, never GBxxxx); "Minced in: GB".
 *   - GB2946 present, UK2946 never appears.
 *
 * Self-cleaning: every planted row is deleted in afterAll. No production data
 * is touched (the harness refuses the prod project ref; see _setup.ts).
 *
 * SUSPEND note: this file requires the local Supabase stack (npm run db:up).
 * If the stack is down the suite fails-fast in _assertStack.ts with an
 * actionable message — that is a SUSPEND for the conductor/CI, not a code
 * failure.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, api, setupTestUsers } from "./_setup";

const SLUG = "ANVIL-LABELS-FPROD04";

// Sentinel ids so cleanup is exact and reruns are idempotent.
let warehouseUserId: string;

// Planted row ids (filled in beforeAll)
const ids = {
  delA: "",
  delB: "",
  mince: "",
  prep: "",
};

/**
 * Two source deliveries with DISTINCT traceability so the distinct-join
 * branch is actually exercised:
 *   delA: born/reared GB, slaughter GB1234, cut GB5678
 *   delB: born/reared IE, slaughter IE9999, cut GB5678  (cut shared → must dedupe)
 */
async function plantDeliveries() {
  const supa = getServiceClient();

  const baseRow = {
    submitted_by: warehouseUserId,
    date: "2026-06-30",
    supplier: `${SLUG}-supplier`,
    product: `${SLUG}-beef`,
    product_category: "beef",
    temperature_c: 2.0,
    temp_status: "pass",
    covered_contaminated: "no",
    species: "beef",
  };

  const { data: dA, error: eA } = await supa
    .from("haccp_deliveries")
    .insert({
      ...baseRow,
      batch_number: `${SLUG}-BATCH-A`,
      born_in: "GB",
      reared_in: "GB",
      slaughter_site: "GB1234",
      cut_site: "GB5678",
    })
    .select("id")
    .single();
  if (eA) throw new Error(`plant delA failed: ${eA.message}`);
  ids.delA = dA.id;

  const { data: dB, error: eB } = await supa
    .from("haccp_deliveries")
    .insert({
      ...baseRow,
      batch_number: `${SLUG}-BATCH-B`,
      born_in: "IE",
      reared_in: "IE",
      slaughter_site: "IE9999",
      cut_site: "GB5678", // shared with delA → distinct-join must collapse to one
    })
    .select("id")
    .single();
  if (eB) throw new Error(`plant delB failed: ${eB.message}`);
  ids.delB = dB.id;
}

async function plantPrepRun() {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from("haccp_meatprep_log")
    .insert({
      submitted_by: warehouseUserId,
      date: "2026-06-30",
      batch_code: `${SLUG}-PREP-001`,
      product_name: `${SLUG} Diced Beef`,
      product_species: "beef",
      input_temp_c: 2.0,
      output_temp_c: 2.0,
      input_temp_pass: true,
      output_temp_pass: true,
      output_mode: "chilled",
      kill_date: "2026-06-25",
      days_from_kill: 5,
      source_batch_numbers: [`${SLUG}-BATCH-A`, `${SLUG}-BATCH-B`],
      source_delivery_ids: [ids.delA, ids.delB],
      allergens_present: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`plant prep run failed: ${error.message}`);
  ids.prep = data.id;
}

async function plantMinceRun() {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from("haccp_mince_log")
    .insert({
      submitted_by: warehouseUserId,
      date: "2026-06-30",
      batch_code: `${SLUG}-MINCE-001`,
      product_species: "beef",
      kill_date: "2026-06-25",
      days_from_kill: 5,
      kill_date_within_limit: true,
      input_temp_c: 2.0,
      output_temp_c: 2.0,
      input_temp_pass: true,
      output_temp_pass: true,
      output_mode: "chilled",
      source_batch_numbers: [`${SLUG}-BATCH-A`, `${SLUG}-BATCH-B`],
      source_delivery_ids: [ids.delA, ids.delB],
    })
    .select("id")
    .single();
  if (error) throw new Error(`plant mince run failed: ${error.message}`);
  ids.mince = data.id;
}

beforeAll(async () => {
  const users = await setupTestUsers();
  warehouseUserId = users.warehouse.id;
  await plantDeliveries();
  await plantPrepRun();
  await plantMinceRun();
});

afterAll(async () => {
  const supa = getServiceClient();
  if (ids.prep) await supa.from("haccp_meatprep_log").delete().eq("id", ids.prep);
  if (ids.mince) await supa.from("haccp_mince_log").delete().eq("id", ids.mince);
  if (ids.delA) await supa.from("haccp_deliveries").delete().eq("id", ids.delA);
  if (ids.delB) await supa.from("haccp_deliveries").delete().eq("id", ids.delB);
});

describe("GET /api/labels auth", () => {
  it("returns 401 when no role cookie is set", async () => {
    const res = await api(`/api/labels?type=prep&id=${ids.prep}&usebydays=7`);
    expect(res.status).toBe(401);
  });
});

describe("PREP label — country+plant BLS granularity (format=json)", () => {
  it("returns the aggregated prep LabelData with distinct country+plant slaughter/cut sites", async () => {
    const res = await api(
      `/api/labels?type=prep&id=${ids.prep}&format=json&usebydays=7`,
      { role: "warehouse", userId: warehouseUserId },
    );
    expect(res.status).toBe(200);
    const body = res.body as { type: string; data: Record<string, unknown> };
    expect(body.type).toBe("prep");

    const d = body.data as {
      slaughtered_in: string[];
      cut_in: string[];
      further_cut_in: string;
      origins: string[];
      reared_in: string[];
    };

    // PREP keeps full COUNTRY+PLANT codes (digits kept), distinct across sources.
    expect([...d.slaughtered_in].sort()).toEqual(["GB1234", "IE9999"]);
    // cut_site shared across both deliveries → distinct-join collapses to one.
    expect(d.cut_in).toEqual(["GB5678"]);
    // "Further cut in" is always the MFS plant code.
    expect(d.further_cut_in).toBe("GB2946");
    // Multi-source origins distinct, as country CODES (GB born + IE born → "GB","IE").
    expect([...d.origins].sort()).toEqual(["GB", "IE"]);
  });

  it("renders the prep HTML label with the compulsory BLS wording and GB2946 (never UK2946)", async () => {
    const res = await api(
      `/api/labels?type=prep&id=${ids.prep}&format=html&width=100mm&usebydays=7`,
      { role: "warehouse", userId: warehouseUserId },
    );
    expect(res.status).toBe(200);
    const html = res.raw;

    expect(html).toContain("Slaughtered in");
    expect(html).toContain("Cut in");
    expect(html).toContain("Further cut in");
    // country+plant values survive end-to-end
    expect(html).toContain("GB1234");
    expect(html).toContain("GB5678");
    // MFS plant code present, the wrong UK form never appears
    expect(html).toContain("GB2946");
    expect(html).not.toContain("UK2946");
  });

  it("renders the 58mm prep label without error", async () => {
    const res = await api(
      `/api/labels?type=prep&id=${ids.prep}&format=html&width=58mm&usebydays=7`,
      { role: "warehouse", userId: warehouseUserId },
    );
    expect(res.status).toBe(200);
    expect(res.raw).toContain("Further cut in");
    expect(res.raw).toContain("GB2946");
  });
});

describe("MINCE label — country-only BLS granularity (format=json)", () => {
  it("strips slaughter site to COUNTRY-ONLY and sets Minced in: GB", async () => {
    const res = await api(
      `/api/labels?type=mince&id=${ids.mince}&format=json&usebydays=7`,
      { role: "warehouse", userId: warehouseUserId },
    );
    expect(res.status).toBe(200);
    const body = res.body as { type: string; data: Record<string, unknown> };
    expect(body.type).toBe("mince");

    const d = body.data as { slaughtered_in: string[]; minced_in: string };

    // COUNTRY-ONLY: GB1234 → GB, IE9999 → IE (digits stripped), distinct.
    expect([...d.slaughtered_in].sort()).toEqual(["GB", "IE"]);
    // No plant digits leak into the mince slaughter list.
    for (const s of d.slaughtered_in) {
      expect(s).not.toMatch(/[0-9]/);
    }
    expect(d.minced_in).toBe("GB");
  });

  it("renders the mince HTML with country-only Slaughtered in and Minced in: GB", async () => {
    const res = await api(
      `/api/labels?type=mince&id=${ids.mince}&format=html&width=100mm&usebydays=7`,
      { role: "warehouse", userId: warehouseUserId },
    );
    expect(res.status).toBe(200);
    const html = res.raw;
    expect(html).toContain("Slaughtered in");
    expect(html).toContain("Minced in");
    // Mince slaughter value must NOT carry a plant code like GB1234.
    expect(html).not.toMatch(/Slaughtered in[\s\S]{0,80}GB[0-9]/);
  });
});
