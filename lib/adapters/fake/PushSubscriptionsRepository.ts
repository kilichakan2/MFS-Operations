/**
 * lib/adapters/fake/PushSubscriptionsRepository.ts
 *
 * In-memory implementation of `PushSubscriptionsRepository`
 * (lib/ports/PushSubscriptionsRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN-ish rows. Used by the usecase + route unit tests
 * (listAll + deleteByEndpoints exercise the cron's read/cleanup; upsert exercises
 * the subscribe route) and by the shared contract.
 *
 * Boundary discipline (ADR-0002): the store is a plain row array — no vendor
 * row shape, no SDK import.
 *
 * upsert keys on (userId, endpoint) — mirrors the real onConflict
 * 'user_id,endpoint': an existing (userId, endpoint) is updated in place, never
 * duplicated. Inserted rows get a deterministic generated id.
 *
 * Construction:
 *   - `createFakePushSubscriptionsRepository(seed?)` factory — each call its own
 *     store. `seed.rows` pre-populates listAll fixtures.
 *   - `fakePushSubscriptionsRepository` singleton — barrel symmetry.
 */

import type {
  PushSubscriptionsRepository,
  PushSubscriptionRow,
} from "@/lib/ports";

interface StoredRow extends PushSubscriptionRow {
  readonly userId: string;
}

export interface FakePushSubscriptionSeedRow {
  readonly id: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface FakePushSubscriptionsSeed {
  readonly rows?: readonly FakePushSubscriptionSeedRow[];
}

export interface FakePushSubscriptionsRepository
  extends PushSubscriptionsRepository {
  /** Test inspection: the current store (id/endpoint/p256dh/auth/userId). */
  readonly rows: readonly StoredRow[];
}

export function createFakePushSubscriptionsRepository(
  seed?: FakePushSubscriptionsSeed,
): FakePushSubscriptionsRepository {
  const rows: StoredRow[] = (seed?.rows ?? []).map((r) => ({
    id: r.id,
    userId: r.userId,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
  }));
  let nextId = rows.length + 1;

  return {
    rows,
    async listAll(): Promise<readonly PushSubscriptionRow[]> {
      return rows.map((r) => ({
        id: r.id,
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
      }));
    },
    async deleteByEndpoints(endpoints: readonly string[]): Promise<void> {
      if (endpoints.length === 0) return;
      const drop = new Set(endpoints);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (drop.has(rows[i].endpoint)) rows.splice(i, 1);
      }
    },
    async upsert(input): Promise<void> {
      const existing = rows.find(
        (r) => r.userId === input.userId && r.endpoint === input.endpoint,
      );
      if (existing) {
        const idx = rows.indexOf(existing);
        rows[idx] = {
          ...existing,
          p256dh: input.p256dh,
          auth: input.auth,
        };
        return;
      }
      rows.push({
        id: `fake-sub-${nextId++}`,
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
    },
  };
}

export const fakePushSubscriptionsRepository: FakePushSubscriptionsRepository =
  createFakePushSubscriptionsRepository();
