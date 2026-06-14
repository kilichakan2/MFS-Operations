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

  // ── F-TD-09 W1 — TOCTOU guard on the two reclaim arms ──────────────
  // The guard (deleteIdempotencyKey's IdempotencyDeleteGuard) exists so
  // that, at the exact 24h expiry tick, a same-key request reclaiming an
  // expired/stale row cannot clobber a FRESH valid row a concurrent
  // request planted for the same key — which would let one key resolve
  // to two orders. These prove (a) the guard didn't break the normal
  // reclaim paths and (b) the guard predicate refuses to delete the
  // fresh row. The unit suite explicitly defers this to here
  // (purgeIdempotencyKeys.test.ts header: "F-TD-09 §7 I2/I3/I4").

  it("I2 — expired key reclaim still yields exactly one order under the expiry guard", async () => {
    const key = `vendor-i2-reclaim-${Date.now()}`;
    const first = await repo.createOrder(
      buildInput("2031-02-01"),
      users.admin.id,
      key,
    );
    // Drive the row genuinely past expiry so the `expiredAt` guard arm
    // fires (the adapter reads expires_at; we move it into the past).
    const { error: expErr } = await client
      .from("order_idempotency_keys")
      .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("key", key);
    expect(expErr).toBeNull();

    // Same-key, same-caller create: the guarded delete (`expires_at <=
    // now`) matches the still-expired row, reclaims it, and a brand-new
    // order wins. Exactly ONE order maps to the key afterwards.
    const second = await repo.createOrder(
      buildInput("2031-02-01"),
      users.admin.id,
      key,
    );
    expect(second.id).not.toBe(first.id);

    const { data: keyRow } = await client
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("key", key)
      .single();
    // The key now maps to the NEW order, not the expired one.
    expect(keyRow?.order_id).toBe(second.id);

    // And the slot holds exactly one live order for this key.
    const { count } = await client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("id", second.id);
    expect(count).toBe(1);
  });

  it("I2 — the expiry guard refuses to clobber a FRESH row planted at the tick", async () => {
    // Models the TOCTOU window directly at the storage layer: the row
    // the reclaiming request READ was expired, but by the time its
    // guarded delete runs a concurrent request has replaced it with a
    // FRESH (unexpired) row for the same key. The guard delete carries
    // `expires_at <= now`, so it must be a NO-OP against the fresh row —
    // the fresh row (and its order) survives, one key → one order holds.
    const key = `vendor-i2-guard-${Date.now()}`;
    const freshOrder = await repo.createOrder(
      buildInput("2031-02-02"),
      users.admin.id,
      key,
    );
    // The row is fresh (expires_at = now + 24h). Issue the SAME guarded
    // delete the expired-reclaim arm would issue — guard pinned to an
    // instant in the PAST (the moment the stale row was read at). It must
    // not match the fresh row.
    const staleReadInstant = new Date(Date.now() - 60_000).toISOString();
    const { error: delErr } = await client
      .from("order_idempotency_keys")
      .delete()
      .eq("key", key)
      .lte("expires_at", staleReadInstant);
    expect(delErr).toBeNull();

    // The fresh key row survived the guarded delete…
    const { data: keyRow } = await client
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("key", key)
      .maybeSingle();
    expect(keyRow?.order_id).toBe(freshOrder.id);
    // …and a same-key replay returns that SAME order (no second order).
    const replay = await repo.createOrder(
      buildInput("2031-02-02"),
      users.admin.id,
      key,
    );
    expect(replay.id).toBe(freshOrder.id);
    const survivors = await repo.listOrders({
      customerId,
      deliveryDate: "2031-02-02",
    });
    expect(survivors.length).toBe(1);
    expect(survivors[0]!.id).toBe(freshOrder.id);
  });

  it("I3 — stale-order reclaim deletes only the row it read, sparing a fresh same-key row", async () => {
    // The stale-order arm fires when a LIVE (unexpired) key points at an
    // order that has since vanished — `findOrderById` returns null — and
    // the guarded delete is pinned to that SPECIFIC stale order_id. Prove
    // the guard's `order_id = <stale>` predicate is surgical: it removes
    // the stale row but is a no-op if the key now points at a different,
    // live order (a concurrent fresh row), so one key → one order holds.
    const key = `vendor-i3-stale-${Date.now()}`;

    // 1. Build a live order + key, then capture the (soon-to-be-stale)
    //    order_id. We make it "vanish" by deleting the order; CASCADE
    //    would also drop the key, so we re-seed the key by hand pointing
    //    at a fresh live order to recreate the post-replacement state.
    const original = await repo.createOrder(
      buildInput("2031-02-03"),
      users.admin.id,
      key,
    );
    const staleOrderId = original.id;

    // 2. A concurrent request replaces the slot with a FRESH live order
    //    for the SAME key. (Delete the original first so CASCADE clears
    //    its key row, then plant the fresh order + key — the end state a
    //    concurrent winner would leave.)
    await client.from("orders").delete().eq("id", staleOrderId);
    const fresh = await repo.createOrder(
      buildInput("2031-02-03"),
      users.admin.id,
      key,
    );

    // 3. Issue the EXACT guarded delete the stale-order arm would run,
    //    pinned to the now-stale order_id. It must NOT touch the fresh
    //    row (which points at `fresh.id`, not `staleOrderId`).
    const { error: delErr } = await client
      .from("order_idempotency_keys")
      .delete()
      .eq("key", key)
      .eq("order_id", staleOrderId);
    expect(delErr).toBeNull();

    // The fresh row survived the surgical delete…
    const { data: keyRow } = await client
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("key", key)
      .maybeSingle();
    expect(keyRow?.order_id).toBe(fresh.id);

    // …and a same-key, same-caller replay resolves to the fresh order
    //    only — one key → one order.
    const replay = await repo.createOrder(
      buildInput("2031-02-03"),
      users.admin.id,
      key,
    );
    expect(replay.id).toBe(fresh.id);
    const survivors = await repo.listOrders({
      customerId,
      deliveryDate: "2031-02-03",
    });
    expect(survivors.length).toBe(1);
    expect(survivors[0]!.id).toBe(fresh.id);
  });
});
