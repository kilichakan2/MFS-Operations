/**
 * tests/integration/kds.test.ts
 *
 * Integration tests for the KDS endpoints:
 *   - GET  /api/kds/orders
 *   - POST /api/auth/kds-pin
 *   - POST /api/kds/lines/[lineId]/done
 *
 * Covers the full butcher flow: KDS queue includes printed orders,
 * PIN auth returns butcher info, line-done updates DB + auto-
 * completes the order when all lines done.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import {
  api,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  getServiceClient,
  type TestUserSet,
} from "./_setup";

const TEST_PIN = "8129";

describe("KDS integration", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  let product: { id: string; name: string; code: string | null };
  // Captured before we overwrite it so afterAll can restore the row exactly
  // as found — otherwise this suite leaves ANVIL-TEST-butcher's pin_hash set
  // to bcrypt(TEST_PIN), which breaks the next local @critical Playwright run
  // (it expects E2E_PIN_BUTCHER) until `npm run db:reset` (F-TD-08).
  let originalButcherPinHash: string | null = null;

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
    product = await getTestProduct();

    // Ensure the test butcher has a known PIN — capturing the original first.
    const supa = getServiceClient();
    const { data: before } = await supa
      .from("users")
      .select("pin_hash")
      .eq("id", users.butcher.id)
      .single();
    originalButcherPinHash = before?.pin_hash ?? null;

    const hash = await bcrypt.hash(TEST_PIN, 10);
    await supa
      .from("users")
      .update({ pin_hash: hash })
      .eq("id", users.butcher.id);

    await cleanupTestData();
  }, 30_000);

  afterAll(async () => {
    // Restore the butcher's pin_hash so the suite leaves no residue (F-TD-08).
    const supa = getServiceClient();
    await supa
      .from("users")
      .update({ pin_hash: originalButcherPinHash })
      .eq("id", users.butcher.id);

    await cleanupTestData();
  }, 30_000);

  async function createAndPrintOrder(lineCount = 2): Promise<string> {
    const lines = Array.from({ length: lineCount }, (_, i) =>
      i === 0
        ? { product_id: product.id, quantity: 5, uom: "kg" as const }
        : {
            ad_hoc_description: `line ${i + 1}`,
            quantity: 1,
            uom: "unit" as const,
          },
    );
    const create = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: { customer_id: customer.id, delivery_date: "2026-12-31", lines },
    });
    const { id } = create.body as { id: string };
    await api(`/api/orders/${id}/picking-list`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
    });
    return id;
  }

  // ── /api/kds/orders — no cookie required ────────────────────

  it("GET /api/kds/orders returns printed orders without auth", async () => {
    const orderId = await createAndPrintOrder();
    const res = await api("/api/kds/orders");
    expect(res.status).toBe(200);
    const body = res.body as {
      orders: Array<{
        id: string;
        state: string;
        lines: Array<{
          product_id: string | null;
          product: { id: string; name: string } | null;
        }>;
      }>;
      recent_flashes: unknown[];
      server_time: string;
    };
    expect(body.orders.some((o) => o.id === orderId)).toBe(true);
    const order = body.orders.find((o) => o.id === orderId)!;
    expect(order.state).toBe("printed");
    // Pins the D3 gap closed: a catalogued line carries the product
    // {id, name} embed; an ad-hoc line carries product: null.
    const catalogued = order.lines.find((l) => l.product_id === product.id)!;
    expect(catalogued.product).toEqual({ id: product.id, name: product.name });
    const adHoc = order.lines.find((l) => l.product_id === null);
    expect(adHoc?.product).toBeNull();
    expect(typeof body.server_time).toBe("string");
  });

  it("queue does not include placed orders (not yet printed)", async () => {
    const create = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    const { id: placedId } = create.body as { id: string };

    const res = await api("/api/kds/orders");
    const body = res.body as { orders: Array<{ id: string }> };
    expect(body.orders.some((o) => o.id === placedId)).toBe(false);
  });

  // ── /api/auth/kds-pin ───────────────────────────────────────

  it("POST /api/auth/kds-pin returns butcher info for valid PIN", async () => {
    const res = await api("/api/auth/kds-pin", {
      method: "POST",
      body: { pin: TEST_PIN },
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; name: string; role: string };
    expect(body.id).toBe(users.butcher.id);
    expect(body.role).toBe("butcher");
  });

  it("POST /api/auth/kds-pin rejects invalid PIN (401)", async () => {
    const res = await api("/api/auth/kds-pin", {
      method: "POST",
      body: { pin: "0000" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/kds-pin rejects malformed PIN (400)", async () => {
    const res = await api("/api/auth/kds-pin", {
      method: "POST",
      body: { pin: "abc" },
    });
    expect(res.status).toBe(400);
  });

  // ── /api/kds/lines/[lineId]/done ─────────────────────

  it("marks a line done and auto-completes the order when last line done", async () => {
    const orderId = await createAndPrintOrder(2);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .order("line_number");
    expect(lines).toHaveLength(2);

    // Mark first line done — order should stay printed
    const r1 = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(r1.status).toBe(200);

    const mid = await supa
      .from("orders")
      .select("state")
      .eq("id", orderId)
      .single();
    expect(mid.data?.state).toBe("printed");

    // Mark second line done — should auto-complete
    const r2 = await api(`/api/kds/lines/${lines![1].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(r2.status).toBe(200);
    expect((r2.body as { completed?: boolean }).completed).toBe(true);

    const fin = await supa
      .from("orders")
      .select("state, completed_at")
      .eq("id", orderId)
      .single();
    expect(fin.data?.state).toBe("completed");
    expect(fin.data?.completed_at).toBeTruthy();
  });

  it("rejects line-done with invalid butcher_id (400)", async () => {
    const orderId = await createAndPrintOrder();
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    const res = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: "not-a-uuid" },
    });
    expect(res.status).toBe(400);
    // F-08 error envelope: {code, message, fields}.
    const body = res.body as { code: string; fields: Record<string, string[]> };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.fields["butcher_id"]![0]).toMatch(/butcher_id required/);
  });

  it("rejects line-done from a sales user_id (403)", async () => {
    const orderId = await createAndPrintOrder();
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    const res = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.sales.id },
    });
    expect(res.status).toBe(403);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(body.message).toBe("User cannot mark lines done");
  });

  it("rejects line-done on a placed (not printed) order (409)", async () => {
    const create = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    const { id } = create.body as { id: string };
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", id);

    const res = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("CONFLICT");
  });

  it("is idempotent — second tap on already-done line returns ok", async () => {
    const orderId = await createAndPrintOrder();
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);

    const r1 = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    const r2 = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r2.body as { already_done?: boolean }).already_done).toBe(true);
  });

  // ── /api/kds/lines/[lineId]/undo (F-PROD-02) ─────────────────
  //
  // Route-level proof on the REAL local DB that the undo reverts the
  // line, cascades the order revert atomically, is idempotent, mirrors
  // the line-done identity guard, writes exactly one NULL-user
  // line_undone audit row, and never produces a false orange flash.

  it("undo on a printed order clears the line and returns {ok:true}", async () => {
    const orderId = await createAndPrintOrder(2);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .order("line_number");

    // Mark line 1 done (order stays printed since line 2 is still pending).
    await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });

    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const { data: line } = await supa
      .from("order_lines")
      .select("done_at, done_by")
      .eq("id", lines![0].id)
      .single();
    expect(line?.done_at).toBeNull();
    expect(line?.done_by).toBeNull();

    const { data: order } = await supa
      .from("orders")
      .select("state")
      .eq("id", orderId)
      .single();
    expect(order?.state).toBe("printed");
  });

  it("cascade undo on a completed order reopens it: {ok:true, reopened:true}, order→printed, completed_at null", async () => {
    const orderId = await createAndPrintOrder(1);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);

    // Mark the only line done → order auto-completes.
    const done = await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect((done.body as { completed?: boolean }).completed).toBe(true);

    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, reopened: true });

    const { data: order } = await supa
      .from("orders")
      .select("state, completed_at")
      .eq("id", orderId)
      .single();
    expect(order?.state).toBe("printed");
    expect(order?.completed_at).toBeNull();

    const { data: line } = await supa
      .from("order_lines")
      .select("done_at")
      .eq("id", lines![0].id)
      .single();
    expect(line?.done_at).toBeNull();
  });

  it("second undo on an already-pending line returns {ok:true, already_pending:true}", async () => {
    const orderId = await createAndPrintOrder(2);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .order("line_number");

    await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    // First undo reverts it.
    await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    // Second undo is the idempotent no-op.
    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, already_pending: true });
  });

  it("rejects undo with an invalid butcher_id (400)", async () => {
    const orderId = await createAndPrintOrder();
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: "not-a-uuid" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("rejects undo from a sales user_id — wrong role (403)", async () => {
    const orderId = await createAndPrintOrder(2);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .order("line_number");
    await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.sales.id },
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("FORBIDDEN");
  });

  it("rejects undo from an unknown butcher_id (404)", async () => {
    const orderId = await createAndPrintOrder();
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);
    const res = await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      // Well-formed uuid that matches no user row.
      body: { butcher_id: "00000000-0000-0000-0000-0000000000aa" },
    });
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe("NOT_FOUND");
  });

  it("writes exactly ONE line_undone audit row, user_id NULL, with before/after payload", async () => {
    const orderId = await createAndPrintOrder(2);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .order("line_number");

    await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });

    const { data: audit } = await supa
      .from("order_audit_log")
      .select("user_id, action, payload")
      .eq("order_id", orderId)
      .eq("action", "line_undone");

    expect(audit).toHaveLength(1);
    expect(audit![0].user_id).toBeNull();
    // Trigger writes jsonb_build_object('before', OLD, 'after', NEW).
    const payload = audit![0].payload as {
      before?: { done_at: string | null };
      after?: { done_at: string | null };
    };
    expect(payload.before).toBeTruthy();
    expect(payload.after).toBeTruthy();
    expect(payload.before!.done_at).not.toBeNull();
    expect(payload.after!.done_at).toBeNull();
  });

  it("after an undo, /api/kds/orders returns NO flash for that order (line_undone is not a flash action)", async () => {
    // B2 regression guard: a cascade undo reopens the order to printed
    // (so it is back in the queue), and the undo must NOT make the card
    // flash orange. line_undone ∉ flash actions.
    const orderId = await createAndPrintOrder(1);
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId);

    await api(`/api/kds/lines/${lines![0].id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    await api(`/api/kds/lines/${lines![0].id}/undo`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });

    const queue = await api("/api/kds/orders");
    expect(queue.status).toBe(200);
    const body = queue.body as {
      orders: Array<{ id: string }>;
      recent_flashes: Array<{ order_id: string; action: string }>;
    };
    // The reopened order is back in the queue …
    expect(body.orders.some((o) => o.id === orderId)).toBe(true);

    // … and the undo produced NO flash. The order legitimately carries a
    // `line_added` flash from being created moments ago (that IS a flash
    // action), so we don't assert zero flashes outright — we assert the
    // undo did not introduce a `line_undone` flash, and crucially did NOT
    // mislabel itself as `line_edited` (the exact B2 false-orange-flash bug
    // the trigger fix prevents). An undo logged as line_edited would put a
    // `line_edited` flash here and wrongly tell butchers "the office amended
    // this order".
    const orderFlashes = body.recent_flashes.filter(
      (f) => f.order_id === orderId,
    );
    expect(orderFlashes.some((f) => f.action === "line_undone")).toBe(false);
    expect(orderFlashes.some((f) => f.action === "line_edited")).toBe(false);
  });
});
