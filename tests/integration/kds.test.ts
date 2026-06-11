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

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
    product = await getTestProduct();

    // Ensure the test butcher has a known PIN
    const supa = getServiceClient();
    const hash = await bcrypt.hash(TEST_PIN, 10);
    await supa
      .from("users")
      .update({ pin_hash: hash })
      .eq("id", users.butcher.id);

    await cleanupTestData();
  }, 30_000);

  afterAll(async () => {
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
});
