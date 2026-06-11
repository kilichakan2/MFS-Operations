/**
 * tests/integration/adapters/supabase/OrdersRepository.test.ts
 *
 * F-06 — runs the shared OrdersRepository contract against the
 * Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (the F-06 direct-adapter
 * pattern; sister to road-times.test.ts). This is the load-bearing
 * pattern F-08's planner will inherit for the route rewrites.
 *
 * Capability flags:
 *   supportsAuditLog     = true  — DB triggers fire on every mutation
 *   supportsFkValidation = true  — DB FKs enforce on createOrder
 *   supportsConcurrency  = true  — DB-level optimistic locking
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ordersRepositoryContract } from "@/lib/ports/__contracts__/OrdersRepository.contract";
import { createSupabaseOrdersRepository } from "@/lib/adapters/supabase";
import { ConflictError } from "@/lib/errors";
import type { OrdersRepository } from "@/lib/ports";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  type TestUserSet,
} from "../../_setup";

ordersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseOrdersRepository(client);
  // Idempotent fixtures: setupTestUsers / setupTestCustomer /
  // getTestProduct look up existing rows first and only insert when
  // missing. Cheap to re-call in every beforeEach.
  const users = await setupTestUsers();
  const cust = await setupTestCustomer();
  const prod = await getTestProduct();
  return {
    repo,
    customerId: cust.id,
    userId: users.admin.id,
    butcherId: users.butcher.id,
    productId: prod.id,
    supportsAuditLog: true,
    supportsFkValidation: true,
    supportsConcurrency: true,
    cleanup: async () => {
      await cleanupTestData();
    },
  };
});

// ─── Vendor-level idempotency cases (F-08 plan §6 step 3) ─────
// These exercise storage-layer behaviour the adapter-agnostic
// contract cannot model: the 24h TTL column, cross-user key
// ownership, and the DB-PK-arbitrated concurrent race.

describe("Supabase OrdersRepository idempotency (vendor-level)", () => {
  const client = getServiceClient();
  let repo: OrdersRepository;
  let users: TestUserSet;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    repo = createSupabaseOrdersRepository(client);
    users = await setupTestUsers();
    customerId = (await setupTestCustomer()).id;
    productId = (await getTestProduct()).id;
    await cleanupTestData();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30_000);

  function buildInput(deliveryDate: string) {
    return {
      customerId,
      deliveryDate,
      deliveryNotes: null,
      orderNotes: null,
      lines: [
        {
          productId,
          adHocDescription: null,
          quantity: 1,
          uom: "kg" as const,
          notes: null,
        },
      ],
    };
  }

  it("an expired key row is reclaimed — a new order wins", async () => {
    const key = `vendor-ttl-${Date.now()}`;
    const first = await repo.createOrder(
      buildInput("2031-01-10"),
      users.admin.id,
      key,
    );
    // Expire the row directly (the adapter only reads expires_at).
    const { error } = await client
      .from("order_idempotency_keys")
      .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("key", key);
    expect(error).toBeNull();

    const second = await repo.createOrder(
      buildInput("2031-01-10"),
      users.admin.id,
      key,
    );
    expect(second.id).not.toBe(first.id);
    // The reclaimed key now points at the new order.
    const { data: row } = await client
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("key", key)
      .single();
    expect(row?.order_id).toBe(second.id);
  });

  it("cross-user replay of a live key throws ConflictError (no order data leaked)", async () => {
    const key = `vendor-crossuser-${Date.now()}`;
    await repo.createOrder(buildInput("2031-01-11"), users.admin.id, key);
    await expect(
      repo.createOrder(buildInput("2031-01-11"), users.sales.id, key),
    ).rejects.toThrow(ConflictError);
  });

  it("concurrent same-key creates resolve to exactly one surviving order", async () => {
    const key = `vendor-race-${Date.now()}`;
    const input = buildInput("2031-01-12");
    const [a, b] = await Promise.all([
      repo.createOrder(input, users.admin.id, key),
      repo.createOrder(input, users.admin.id, key),
    ]);
    // Both calls resolve to the same order id…
    expect(a.id).toBe(b.id);
    // …and exactly one order survives in the DB for this slot.
    const survivors = await repo.listOrders({
      customerId,
      deliveryDate: "2031-01-12",
    });
    expect(survivors.length).toBe(1);
    expect(survivors[0]!.id).toBe(a.id);
  });
});
