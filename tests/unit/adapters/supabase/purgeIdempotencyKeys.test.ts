/**
 * tests/unit/adapters/supabase/purgeIdempotencyKeys.test.ts
 *
 * F-TD-09 — focused unit coverage for the Supabase adapter's
 * `purgeExpiredIdempotencyKeys` (the daily-broom DELETE) WITHOUT a DB.
 *
 * A tiny hand-rolled PostgREST query-builder stub records the chained
 * calls (`.from().delete().lte().select()`) and returns a canned
 * `{ data, error }`. The REAL adapter factory runs against it, so this
 * proves the adapter:
 *   - targets `order_idempotency_keys`
 *   - filters `expires_at <= now` (the `<=`/`.lte` predicate the plan
 *     locked to match the read-time `isExpired` semantics)
 *   - returns the count of deleted rows
 *   - maps a DB error to `ServiceError("Idempotency-key purge failed")`
 *
 * The W1 guarded-delete behaviour and the N1 log shape live inside the
 * multi-step `createOrder` race and are proven against the live DB in
 * the integration suite (F-TD-09 §7 I2/I3/I4) — not re-modelled here.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrdersRepository } from "@/lib/adapters/supabase";
import { ServiceError } from "@/lib/errors";

// Silence the adapter's structured error log on the error-path cases.
vi.mock("@/lib/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type CannedResult = { data: unknown; error: { message: string } | null };

/**
 * Minimal awaitable PostgREST builder. Each chained method records its
 * name + args and returns `this`; awaiting the builder resolves to the
 * canned result. Captures one chain per `.from()` call.
 */
function makeClient(result: CannedResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let table: string | null = null;

  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  builder.delete = record("delete");
  builder.eq = record("eq");
  builder.lte = record("lte");
  builder.select = record("select");
  // Make the builder awaitable — resolves to the canned result.
  builder.then = (resolve: (v: CannedResult) => unknown) =>
    Promise.resolve(result).then(resolve);

  const client = {
    from(t: string) {
      table = t;
      return builder;
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    table: () => table,
  };
}

describe("Supabase OrdersRepository.purgeExpiredIdempotencyKeys", () => {
  const NOW = new Date("2026-06-14T03:00:00.000Z");

  it("targets order_idempotency_keys and filters expires_at <= now", async () => {
    const { client, calls, table } = makeClient({
      data: [{ key: "k1" }, { key: "k2" }],
      error: null,
    });
    const repo = createSupabaseOrdersRepository(client);

    await repo.purgeExpiredIdempotencyKeys(NOW);

    expect(table()).toBe("order_idempotency_keys");
    expect(calls.map((c) => c.method)).toEqual(["delete", "lte", "select"]);
    const lte = calls.find((c) => c.method === "lte");
    expect(lte?.args).toEqual(["expires_at", NOW.toISOString()]);
    const select = calls.find((c) => c.method === "select");
    expect(select?.args).toEqual(["key"]);
  });

  it("returns the count of deleted rows", async () => {
    const { client } = makeClient({
      data: [{ key: "k1" }, { key: "k2" }, { key: "k3" }],
      error: null,
    });
    const repo = createSupabaseOrdersRepository(client);

    const deleted = await repo.purgeExpiredIdempotencyKeys(NOW);

    expect(deleted).toBe(3);
  });

  it("returns 0 when nothing was expired (null data)", async () => {
    const { client } = makeClient({ data: null, error: null });
    const repo = createSupabaseOrdersRepository(client);

    const deleted = await repo.purgeExpiredIdempotencyKeys(NOW);

    expect(deleted).toBe(0);
  });

  it("maps a DB error to ServiceError", async () => {
    const { client } = makeClient({
      data: null,
      error: { message: "boom" },
    });
    const repo = createSupabaseOrdersRepository(client);

    await expect(repo.purgeExpiredIdempotencyKeys(NOW)).rejects.toBeInstanceOf(
      ServiceError,
    );
    await expect(
      repo.purgeExpiredIdempotencyKeys(NOW),
    ).rejects.toThrowError("Idempotency-key purge failed");
  });
});
