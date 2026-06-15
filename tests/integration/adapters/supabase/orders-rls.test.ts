/**
 * tests/integration/adapters/supabase/orders-rls.test.ts
 *
 * F-RLS-04a — the DB-layer proof for the Orders RLS cutover. Like the
 * F-RLS-03 rls-bridge test it talks STRAIGHT to PostgREST as the
 * authenticated / anon role (NOT through the Next.js routes), so it isolates
 * "do the orders/order_lines policies fire under the keycard" from any app
 * code. Two gates:
 *
 *   READ gate (step 2, before flipping any read):
 *     - in-role (admin) authenticated client → orders / order_lines SELECT
 *       returns the planted rows;
 *     - the embedded customers / creator / printer joins the ORDER_SELECT
 *       uses still resolve under the keycard;
 *     - customers / products / users reads the service+usecase rely on
 *       succeed for an in-role caller;
 *     - a current_user_id that maps to NO users row → 0 rows (deny);
 *     - T2 NEGATIVE: raw anon PostgREST (no token) → 0 rows on orders /
 *       order_lines.
 *
 *   WRITE gate (step 4, before flipping any write):
 *     - orders UPDATE succeeds in-role (admin), denied out-of-role (driver);
 *     - order_lines INSERT + DELETE (line replacement) succeed in-role,
 *       denied out-of-role;
 *     - the order_audit_log row the UPDATE trigger writes now carries the
 *       REAL caller user_id (not NULL) — read back as service-role.
 *
 * REQUIREMENTS to run (else SKIP, never fake-pass): SUPABASE_JWT_SECRET +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, and the 20260615173901 DELETE-policies
 * migration applied (local: `npm run db:reset`). The DELETE half of the
 * write gate is the load-bearing proof of that migration.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { authenticatedClientForCaller } from "@/lib/adapters/supabase/authenticatedClient";
import { createWebCryptoDbTokenMinter } from "@/lib/adapters/web-crypto";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  type TestUserSet,
} from "../../_setup";

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";

// Skip (don't fail) when the secret or anon key isn't provisioned locally.
const CAN_RUN = Boolean(JWT_SECRET) && Boolean(ANON_KEY);

// A user_id that maps to NO users row — used to prove the deny path.
const GHOST_USER_ID = "00000000-0000-0000-0000-0000000000ff";

const minter = createWebCryptoDbTokenMinter({
  getSecret: () => process.env.SUPABASE_JWT_SECRET,
});

/** A bare anon-key client carrying NO Bearer token — the deny baseline. */
function anonClientNoToken() {
  return createClient(SUPABASE_URL, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** An authenticated client minted for one caller's user_id. */
async function authedFor(userId: string) {
  const token = await minter.mint({ userId });
  return authenticatedClientForCaller({ token });
}

describe.skipIf(!CAN_RUN)("F-RLS-04a orders/order_lines RLS (DB-layer)", () => {
  let users: TestUserSet;
  let customerId: string;
  let productId: string;
  let orderId: string;

  beforeAll(async () => {
    users = await setupTestUsers();
    const cust = await setupTestCustomer();
    customerId = cust.id;
    const prod = await getTestProduct();
    productId = prod.id;

    // Plant a placed order + one line as service-role (bypasses RLS) so the
    // gates have a known fixture to read / edit.
    const svc = getServiceClient();
    const { data: order, error: orderErr } = await svc
      .from("orders")
      .insert({
        customer_id: customerId,
        state: "placed",
        delivery_date: "2026-12-31",
        created_by: users.admin.id,
      })
      .select("id")
      .single();
    if (orderErr) throw new Error(`fixture order insert: ${orderErr.message}`);
    orderId = order.id;

    const { error: lineErr } = await svc.from("order_lines").insert({
      order_id: orderId,
      line_number: 1,
      product_id: productId,
      quantity: 2,
      uom: "kg",
    });
    if (lineErr) throw new Error(`fixture line insert: ${lineErr.message}`);
  }, 30_000);

  afterAll(async () => {
    if (!orderId) return;
    const svc = getServiceClient();
    // order_lines cascade with the order; delete the order as service-role.
    await svc.from("orders").delete().eq("id", orderId);
  });

  // ─── READ gate ──────────────────────────────────────────────

  it("READ in-role — admin keycard reads the planted order", async () => {
    const authed = await authedFor(users.admin.id);
    const { data, error } = await authed
      .from("orders")
      .select("id, state, customer_id")
      .eq("id", orderId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect((data ?? [])[0]?.id).toBe(orderId);
  });

  it("READ in-role — admin keycard reads the order's lines", async () => {
    const authed = await authedFor(users.admin.id);
    const { data, error } = await authed
      .from("order_lines")
      .select("id, order_id, product_id, quantity")
      .eq("order_id", orderId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
    expect((data ?? [])[0]?.order_id).toBe(orderId);
  });

  it("READ in-role — the embedded customer / creator joins resolve under the keycard", async () => {
    const authed = await authedFor(users.admin.id);
    const { data, error } = await authed
      .from("orders")
      .select(
        "id, customer:customer_id ( id, name ), creator:created_by ( id, name )",
      )
      .eq("id", orderId)
      .single();
    expect(error).toBeNull();
    expect((data as { customer?: { id: string } } | null)?.customer?.id).toBe(
      customerId,
    );
    expect(
      (data as { creator?: { id: string } } | null)?.creator?.id,
    ).toBe(users.admin.id);
  });

  it("READ in-role — customers / products / users reads the service relies on succeed", async () => {
    const authed = await authedFor(users.admin.id);

    const cust = await authed.from("customers").select("id").eq("id", customerId);
    expect(cust.error).toBeNull();
    expect((cust.data ?? []).length).toBe(1);

    const prod = await authed.from("products").select("id").eq("id", productId);
    expect(prod.error).toBeNull();
    expect((prod.data ?? []).length).toBe(1);

    // Own-row users read (the policy subqueries depend on it).
    const self = await authed.from("users").select("id").eq("id", users.admin.id);
    expect(self.error).toBeNull();
    expect((self.data ?? []).length).toBe(1);
  });

  it("READ deny — a user_id mapping to no users row reads zero orders", async () => {
    const authed = await authedFor(GHOST_USER_ID);
    const { data, error } = await authed
      .from("orders")
      .select("id")
      .eq("id", orderId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it("READ T2 NEGATIVE — raw anon (no token) leaks zero orders / order_lines (denied)", async () => {
    const anon = anonClientNoToken();
    // Denial may surface two ways, both of which leak NOTHING:
    //   - 0 rows (RLS filtered everything out), OR
    //   - a DB error (the orders/order_lines policy casts the empty GUC to
    //     uuid and errors out for an unauthenticated caller).
    // Either is a hard denial; the invariant is "no rows are returned".
    const o = await anon.from("orders").select("id").limit(5);
    expect((o.data ?? []).length).toBe(0);
    const l = await anon.from("order_lines").select("id").limit(5);
    expect((l.data ?? []).length).toBe(0);
  });

  // ─── WRITE gate ─────────────────────────────────────────────

  it("WRITE in-role — admin keycard UPDATEs the order; audit row carries the real user_id", async () => {
    const authed = await authedFor(users.admin.id);
    const { error } = await authed
      .from("orders")
      .update({ order_notes: "F-RLS-04a write-gate" })
      .eq("id", orderId);
    expect(error).toBeNull();

    // The audit trigger writes the caller's app.current_user_id, not NULL.
    const svc = getServiceClient();
    const { data: audit, error: auditErr } = await svc
      .from("order_audit_log")
      .select("user_id, action")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditErr).toBeNull();
    expect((audit ?? []).length).toBeGreaterThan(0);
    expect((audit ?? [])[0]?.user_id).toBe(users.admin.id);
  });

  it("WRITE deny — out-of-role (driver) keycard cannot UPDATE the order", async () => {
    const authed = await authedFor(users.driver.id);
    const { error } = await authed
      .from("orders")
      .update({ order_notes: "driver-should-not-write" })
      .eq("id", orderId);
    // No matching UPDATE policy for driver → the row is invisible to the
    // write; surfaces as a permission error or a zero-row no-op. Either
    // way the value must NOT have changed — assert via service-role read.
    const svc = getServiceClient();
    const { data } = await svc
      .from("orders")
      .select("order_notes")
      .eq("id", orderId)
      .single();
    expect(data?.order_notes).toBe("F-RLS-04a write-gate");
    // (error may be null with 0 rows affected, or a 403 — both are denials.)
    void error;
  });

  it("WRITE in-role — admin keycard DELETEs + re-INSERTs order_lines (line replacement)", async () => {
    const authed = await authedFor(users.admin.id);

    const del = await authed
      .from("order_lines")
      .delete()
      .eq("order_id", orderId);
    expect(del.error).toBeNull();

    // Confirm the delete actually removed the row (the new DELETE policy).
    const svc = getServiceClient();
    const afterDel = await svc
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    expect((afterDel.data ?? []).length).toBe(0);

    const ins = await authed.from("order_lines").insert({
      order_id: orderId,
      line_number: 1,
      product_id: productId,
      quantity: 5,
      uom: "kg",
    });
    expect(ins.error).toBeNull();

    const afterIns = await svc
      .from("order_lines")
      .select("id, quantity")
      .eq("order_id", orderId);
    expect((afterIns.data ?? []).length).toBe(1);
    expect(Number((afterIns.data ?? [])[0]?.quantity)).toBe(5);
  });

  it("WRITE deny — out-of-role (driver) keycard cannot DELETE order_lines", async () => {
    const authed = await authedFor(users.driver.id);
    const del = await authed
      .from("order_lines")
      .delete()
      .eq("order_id", orderId);
    // Denial = no rows removed. Confirm the line still exists via service-role.
    const svc = getServiceClient();
    const after = await svc
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    expect((after.data ?? []).length).toBe(1);
    void del;
  });
});
