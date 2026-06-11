/**
 * lib/orders/idempotencyKey.ts
 *
 * Idempotency-key lifecycle for the order form ("fingerprint keeper").
 * Hands out one stable key per order attempt: `current()` lazily creates
 * the key on first call and keeps returning it until `reset()`, so a
 * retried submit reuses the same key (the F-08 server guard then returns
 * the original order instead of creating a duplicate). Reset on success
 * or whenever the order content changes.
 *
 * Pure TypeScript — no imports. The generator is injectable for tests;
 * the default is the built-in crypto.randomUUID() this form already uses.
 *
 * Plan: docs/plans/2026-06-11-f-td-10-order-form-idempotency-key.md
 */

export interface IdempotencyKeySource {
  /** The key for the current order attempt (created lazily on first call). */
  current(): string;
  /** Forget the key — the next current() mints a fresh one. */
  reset(): void;
}

export function createIdempotencyKeySource(
  generate: () => string = () => crypto.randomUUID(),
): IdempotencyKeySource {
  let key: string | null = null;
  return {
    current() {
      if (key === null) key = generate();
      return key;
    },
    reset() {
      key = null;
    },
  };
}
