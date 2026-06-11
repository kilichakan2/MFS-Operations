/**
 * tests/integration/orders-idempotency.test.ts
 *
 * F-08 — Idempotency-Key support on POST /api/orders, over real HTTP
 * against the local stack. The HTTP-level counterpart of the adapter
 * race tests in tests/integration/adapters/supabase/OrdersRepository.test.ts.
 *
 * Contract (plan §5 D1):
 *   - replay (same key, same caller)  → 201 both times, same {id, reference}
 *   - no header                       → today's behaviour, distinct orders
 *   - concurrent same key             → exactly one order survives
 *   - same key, different caller      → 409 (no order data leaked)
 *   - key longer than 200 chars       → 400
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  type TestUserSet,
} from "./_setup";
import { INTEGRATION_BASE_URL } from "./_config";

describe("/api/orders Idempotency-Key integration", () => {
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

  function orderBody() {
    return {
      customer_id: customer.id,
      delivery_date: "2026-12-31",
      lines: [{ product_id: product.id, quantity: 1, uom: "kg" as const }],
    };
  }

  /**
   * The shared `api()` helper does not support extra headers, and the
   * Idempotency-Key header is the entire point here — so this suite
   * carries its own minimal POST helper (same cookie wiring).
   */
  async function postOrder(opts: {
    role: string;
    userId: string;
    idempotencyKey?: string;
    /** Request body override — defaults to the suite's minimal orderBody(). */
    body?: Record<string, unknown>;
  }): Promise<{ status: number; body: unknown }> {
    const session = {
      userId: opts.userId,
      name: `ANVIL-TEST-${opts.role}`,
      role: opts.role,
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: [
        `mfs_role=${opts.role}`,
        `mfs_user_id=${opts.userId}`,
        `mfs_session=${encodeURIComponent(JSON.stringify(session))}`,
      ].join("; "),
    };
    if (opts.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }
    const res = await fetch(`${INTEGRATION_BASE_URL}/api/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? orderBody()),
      redirect: "manual",
    });
    const raw = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
    return { status: res.status, body };
  }

  it("replays the same key as 201 with the same {id, reference} body", async () => {
    const key = `http-replay-${Date.now()}`;
    const first = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: key,
    });
    const second = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: key,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  it("no header creates distinct orders (today's behaviour, bit-for-bit)", async () => {
    const a = await postOrder({ role: "sales", userId: users.sales.id });
    const b = await postOrder({ role: "sales", userId: users.sales.id });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((a.body as { id: string }).id).not.toBe(
      (b.body as { id: string }).id,
    );
  });

  it("concurrent same-key requests yield exactly one surviving order", async () => {
    const key = `http-race-${Date.now()}`;
    const [a, b] = await Promise.all([
      postOrder({ role: "sales", userId: users.sales.id, idempotencyKey: key }),
      postOrder({ role: "sales", userId: users.sales.id, idempotencyKey: key }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const idA = (a.body as { id: string }).id;
    const idB = (b.body as { id: string }).id;
    expect(idA).toBe(idB);
    // Exactly one order for this key's order id slot survives in the DB.
    const supa = getServiceClient();
    const { data: keyRow } = await supa
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("key", key)
      .single();
    expect(keyRow?.order_id).toBe(idA);
    const { count } = await supa
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("id", idA);
    expect(count).toBe(1);
  });

  it("cross-user replay of a live key is refused with 409", async () => {
    const key = `http-crossuser-${Date.now()}`;
    const first = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: key,
    });
    expect(first.status).toBe(201);
    const second = await postOrder({
      role: "office",
      userId: users.office.id,
      idempotencyKey: key,
    });
    expect(second.status).toBe(409);
    const body = second.body as { code: string; message: string };
    expect(body.code).toBe("CONFLICT");
    // No order details leaked — only the refusal.
    expect("id" in (second.body as object)).toBe(false);
  });

  it("a key longer than 200 chars is refused with 400 before any work", async () => {
    const res = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: "x".repeat(201),
    });
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("replays the exact form wire shape with a real UUID key as one order (F-TD-10)", async () => {
    // The byte-for-byte payload shape app/orders/new/page.tsx builds in
    // handleSubmit, with a key from the same generator the form uses.
    // The F-08 cases above use a minimal body and timestamp keys; this
    // pins the form's actual contract against the guard.
    const key = crypto.randomUUID();
    const formBody = {
      customer_id: customer.id,
      delivery_date: "2026-12-31",
      delivery_notes: "ring bell",
      order_notes: null,
      lines: [
        {
          product_id: product.id,
          ad_hoc_description: null,
          quantity: 1,
          uom: "kg" as const,
          notes: "tied",
        },
      ],
    };
    const first = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: key,
      body: formBody,
    });
    const second = await postOrder({
      role: "sales",
      userId: users.sales.id,
      idempotencyKey: key,
      body: formBody,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    const orderId = (first.body as { id: string }).id;
    const supa = getServiceClient();
    const { count } = await supa
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("id", orderId);
    expect(count).toBe(1);
  });
});
