/**
 * lib/adapters/fake/HaccpReviewsRepository.ts
 *
 * In-memory implementation of `HaccpReviewsRepository`
 * (lib/ports/HaccpReviewsRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can rely on parity.
 *
 * It records every inserted payload AS-IS (so tests can assert the exact row),
 * hands back a seedable id from the review inserts (so CA source_id linking can
 * be tested), and NEVER throws from `insertCorrectiveActions` (parity with the
 * route's swallow-and-continue contract).
 *
 * Construction:
 *   - `createFakeHaccpReviewsRepository(seed?)` factory — tests inject the read
 *     fixtures + the insert ids the fake returns.
 *   - `fakeHaccpReviewsRepository` singleton — empty; barrel symmetry.
 */

import type {
  ReviewWeeklyRow,
  ReviewWeeklyPersist,
  ReviewMonthlyRow,
  ReviewMonthlyPersist,
  ReviewCorrectiveActionInsert,
} from "@/lib/domain";
import type { HaccpReviewsRepository } from "@/lib/ports";

/** Optional read fixtures + the ids the fake hands back from inserts. */
export interface FakeHaccpReviewsSeed {
  readonly weekly?: readonly ReviewWeeklyRow[];
  readonly monthly?: readonly ReviewMonthlyRow[];
  readonly weeklyInsertId?: string;
  readonly monthlyInsertId?: string;
  /**
   * Simulate the CA write hitting a DB error (R-D2). When true the fake's
   * `insertCorrectiveActions` records NOTHING and — exactly like the real
   * Supabase adapter on a CA-insert error — logs-and-RETURNS without throwing.
   * Lets a unit test prove a failed CA write never aborts the parent review.
   */
  readonly failCorrectiveActions?: boolean;
}

/** A test-inspectable Fake reviews repository: exposes recorded writes. */
export interface FakeHaccpReviewsRepository extends HaccpReviewsRepository {
  readonly insertedWeekly: readonly ReviewWeeklyPersist[];
  readonly insertedMonthly: readonly ReviewMonthlyPersist[];
  readonly insertedCorrectiveActions: readonly ReviewCorrectiveActionInsert[];
}

export function createFakeHaccpReviewsRepository(
  seed?: FakeHaccpReviewsSeed,
): FakeHaccpReviewsRepository {
  const insertedWeekly: ReviewWeeklyPersist[] = [];
  const insertedMonthly: ReviewMonthlyPersist[] = [];
  const insertedCorrectiveActions: ReviewCorrectiveActionInsert[] = [];

  return {
    get insertedWeekly() {
      return insertedWeekly;
    },
    get insertedMonthly() {
      return insertedMonthly;
    },
    get insertedCorrectiveActions() {
      return insertedCorrectiveActions;
    },

    async listWeeklyReviews(): Promise<readonly ReviewWeeklyRow[]> {
      return seed?.weekly ?? [];
    },

    async listMonthlyReviews(): Promise<readonly ReviewMonthlyRow[]> {
      return seed?.monthly ?? [];
    },

    async insertWeeklyReview(
      payload: ReviewWeeklyPersist,
    ): Promise<{ id: string }> {
      insertedWeekly.push(payload);
      return { id: seed?.weeklyInsertId ?? "fake-weekly-id" };
    },

    async insertMonthlyReview(
      payload: ReviewMonthlyPersist,
    ): Promise<{ id: string }> {
      insertedMonthly.push(payload);
      return { id: seed?.monthlyInsertId ?? "fake-monthly-id" };
    },

    async insertCorrectiveActions(
      rows: readonly ReviewCorrectiveActionInsert[],
    ): Promise<void> {
      // R-D2: when seeded to fail, mirror the adapter's swallow on a DB error —
      // record nothing, log-and-return, NEVER throw. Otherwise record the rows.
      if (seed?.failCorrectiveActions) return;
      // Best-effort parity: record, NEVER throw.
      insertedCorrectiveActions.push(...rows);
    },
  };
}

export const fakeHaccpReviewsRepository: HaccpReviewsRepository =
  createFakeHaccpReviewsRepository();
