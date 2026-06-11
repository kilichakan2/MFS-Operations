/**
 * tests/integration/orders-crud.test.ts
 *
 * Integration test for the order create / read / edit endpoints.
 * Hits the running Next.js dev server with cookie-based auth.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  TEST_PREFIX,
  type TestUserSet,
} from "./_setup";

describe("/api/orders integration", () => {
  let users: TestUserSet;
  let customer: { id: string; name: string };
  let product: { id: string; name: string; code: string | null };

  beforeAll(async () => {
    users = await setupTestUsers();
    customer = await setupTestCustomer();
    product = await getTestProduct();
    await cleanupTestData();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  // ── Auth gates ──────────────────────────────────────────────

  it("redirects to /login when called without cookies (middleware 307)", async () => {
    // Middleware is the first auth gate — no session cookie => 307 to /login.
    // (Route handler 401 only fires when cookies are present but the role is
    // unauthorised, see 'rejects POST from driver role' below.)
    const res = await api("/api/orders", { method: "POST", body: {} });
    expect(res.status).toBe(307);
  });

  it("rejects POST from driver role (403 — identity present, role not allowed)", async () => {
    // F-08: requireRole answers 403 FORBIDDEN for a known caller with
    // the wrong role (legacy inline check said 401). Plan §10.1.
    const res = await api("/api/orders", {
      method: "POST",
      role: "driver",
      userId: users.driver.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    expect(res.status).toBe(403);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(typeof body.message).toBe("string");
  });

  it("rejects POST from butcher role (403)", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "butcher",
      userId: users.butcher.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("FORBIDDEN");
  });

  // ── Validation ──────────────────────────────────────────────

  it("rejects empty body (400)", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {},
    });
    expect(res.status).toBe(400);
    // F-08 error envelope: {code, message, fields} (plan §5 D5).
    const body = res.body as {
      code: string;
      message: string;
      fields: Record<string, string[]>;
    };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(typeof body.message).toBe("string");
    expect(typeof body.fields).toBe("object");
  });

  it("rejects missing delivery_date (400)", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    expect(res.status).toBe(400);
  });

  it("rejects zero quantity line (400)", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 0, uom: "kg" }],
      },
    });
    expect(res.status).toBe(400);
    const body = res.body as { code: string; fields: Record<string, string[]> };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.fields["lines.0"]![0]).toMatch(/quantity must be a positive/);
  });

  it("rejects unknown product_id (400)", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [
          {
            product_id: "00000000-0000-0000-0000-000000000000",
            quantity: 1,
            uom: "kg",
          },
        ],
      },
    });
    expect(res.status).toBe(400);
    // F-TD-06: one entry per missing id, each naming the id.
    const body = res.body as { code: string; fields: Record<string, string[]> };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.fields["lines.products"]).toEqual([
      "Unknown product id: 00000000-0000-0000-0000-000000000000",
    ]);
  });

  it("rejects an inactive customer with 409 (was 400 pre-F-08 — plan §10.3)", async () => {
    // The customer exists but is switched off — a state conflict, not
    // a malformed request.
    const supa = getServiceClient();
    const name = `${TEST_PREFIX}inactive-customer`;
    const { data: existing } = await supa
      .from("customers")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    const inactiveId =
      existing?.id ??
      (
        await supa
          .from("customers")
          .insert({ name, active: false, postcode: "XX2 2XX" })
          .select("id")
          .single()
      ).data!.id;

    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: inactiveId,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 1, uom: "kg" }],
      },
    });
    expect(res.status).toBe(409);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe("Customer is inactive");
  });

  // ── Happy path ──────────────────────────────────────────────

  it("creates an order with mixed catalogued + ad-hoc lines", async () => {
    const res = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        delivery_notes: "before 11am",
        order_notes: "test order",
        lines: [
          {
            product_id: product.id,
            quantity: 10.5,
            uom: "kg",
            notes: "extra fine",
          },
          { ad_hoc_description: "mutton trim", quantity: 4, uom: "kg" },
        ],
      },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; reference: string };
    expect(body.id).toBeDefined();
    expect(body.reference).toMatch(/^MFS-\d{4}-\d{4}$/);
  });

  it("reads back the created order with joined customer + creator + lines", async () => {
    const create = await api("/api/orders", {
      method: "POST",
      role: "sales",
      userId: users.sales.id,
      body: {
        customer_id: customer.id,
        delivery_date: "2026-12-31",
        lines: [{ product_id: product.id, quantity: 5, uom: "kg" }],
      },
    });
    expect(create.status).toBe(201);
    const { id } = create.body as { id: string };

    const get = await api(`/api/orders/${id}`, {
      method: "GET",
      role: "office",
      userId: users.office.id,
    });
    expect(get.status).toBe(200);
    const order = (
      get.body as {
        order: { state: string; lines: unknown[]; customer: { name: string } };
      }
    ).order;
    expect(order.state).toBe("placed");
    expect(order.lines).toHaveLength(1);
    expect(order.customer.name).toBe(customer.name);
  });

  it("GET of a missing order returns 404 with the structured envelope", async () => {
    const res = await api("/api/orders/00000000-0000-0000-0000-0000000000aa", {
      method: "GET",
      role: "office",
      userId: users.office.id,
    });
    expect(res.status).toBe(404);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Order not found");
  });

  // ── State-aware edit permissions ────────────────────────────

  it("allows sales to edit a placed order", async () => {
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

    const update = await api(`/api/orders/${id}`, {
      method: "PUT",
      role: "sales",
      userId: users.sales.id,
      body: { order_notes: "edited by sales" },
    });
    expect(update.status).toBe(200);
  });

  it("blocks sales from editing a printed order (403)", async () => {
    // Create + manually transition to printed via the picking-list endpoint
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

    const print = await api(`/api/orders/${id}/picking-list`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
    });
    expect(print.status).toBe(200);

    const update = await api(`/api/orders/${id}`, {
      method: "PUT",
      role: "sales",
      userId: users.sales.id,
      body: { order_notes: "late edit attempt" },
    });
    expect(update.status).toBe(403);
  });

  it("allows office to edit a printed order (triggers reprint)", async () => {
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

    await api(`/api/orders/${id}/picking-list`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
    });

    const update = await api(`/api/orders/${id}`, {
      method: "PUT",
      role: "office",
      userId: users.office.id,
      body: { order_notes: "office amendment" },
    });
    expect(update.status).toBe(200);
  });

  it("refuses editing a completed order with 409 (was 403 pre-F-08 — plan §10.4)", async () => {
    // Refused because of the ORDER's state, not the user's permissions.
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

    await api(`/api/orders/${id}/picking-list`, {
      method: "POST",
      role: "office",
      userId: users.office.id,
    });

    // Complete via the KDS done flow (the single line auto-completes).
    const supa = getServiceClient();
    const { data: lines } = await supa
      .from("order_lines")
      .select("id")
      .eq("order_id", id);
    const done = await api(`/api/kds/lines/${lines![0]!.id}/done`, {
      method: "POST",
      body: { butcher_id: users.butcher.id },
    });
    expect(done.status).toBe(200);

    const update = await api(`/api/orders/${id}`, {
      method: "PUT",
      role: "admin",
      userId: users.admin.id,
      body: { order_notes: "too late" },
    });
    expect(update.status).toBe(409);
    const body = update.body as { code: string; message: string };
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe("Order is completed and cannot be edited");
  });
});
