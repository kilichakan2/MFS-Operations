/**
 * tests/unit/orders/idempotencyKey.test.ts
 *
 * Unit tests for lib/orders/idempotencyKey.ts — the order form's
 * idempotency-key lifecycle ("fingerprint keeper"): one stable key per
 * order attempt, forgotten only on reset (success or content edit).
 *
 * Plan: docs/plans/2026-06-11-f-td-10-order-form-idempotency-key.md
 */

import { describe, it, expect, vi } from "vitest";
import { createIdempotencyKeySource } from "../../../lib/orders/idempotencyKey";

describe("createIdempotencyKeySource", () => {
  it("current() returns the same value across repeated calls", () => {
    const source = createIdempotencyKeySource();
    const first = source.current();
    expect(source.current()).toBe(first);
    expect(source.current()).toBe(first);
  });

  it("after reset(), current() returns a different value", () => {
    let n = 0;
    const source = createIdempotencyKeySource(() => `key-${n++}`);
    expect(source.current()).toBe("key-0");
    expect(source.current()).toBe("key-0");
    source.reset();
    expect(source.current()).toBe("key-1");
    expect(source.current()).toBe("key-1");
  });

  it("generates lazily — the generator is not called until first current()", () => {
    const generate = vi.fn(() => "lazy-key");
    const source = createIdempotencyKeySource(generate);
    expect(generate).not.toHaveBeenCalled();
    source.reset(); // resetting before first use must not generate either
    expect(generate).not.toHaveBeenCalled();
    expect(source.current()).toBe("lazy-key");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("default generator yields a UUID-shaped string", () => {
    const source = createIdempotencyKeySource();
    expect(source.current()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
