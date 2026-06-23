/**
 * lib/adapters/fake/HaccpAnnualReviewRepository.ts
 *
 * In-memory implementation of `HaccpAnnualReviewRepository`
 * (lib/ports/HaccpAnnualReviewRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can rely on parity, including the ability to simulate
 * the unique-draft `ConflictError`.
 *
 * Construction:
 *   - `createFakeHaccpAnnualReviewRepository(seed?)` factory.
 *   - `fakeHaccpAnnualReviewRepository` singleton — empty; barrel symmetry.
 */

import { ConflictError } from "@/lib/errors";
import type {
  AnnualReviewRow,
  AnnualReviewCreatePersist,
  AnnualReviewCurrent,
  AnnualReviewSignOffPersist,
  AnnualReviewUpdatePersist,
} from "@/lib/domain";
import type { HaccpAnnualReviewRepository } from "@/lib/ports";

/** Optional fixtures the service reads back. */
export interface FakeHaccpAnnualReviewSeed {
  readonly reviews?: readonly AnnualReviewRow[];
  readonly current?: AnnualReviewCurrent | null;
  readonly createdRow?: AnnualReviewRow;
  readonly signedRow?: AnnualReviewRow;
  readonly updatedRow?: AnnualReviewRow;
  /** When true, createDraft throws ConflictError (simulates the 23505). */
  readonly conflictOnCreate?: boolean;
}

/** A test-inspectable Fake annual-review repository: exposes recorded writes. */
export interface FakeHaccpAnnualReviewRepository
  extends HaccpAnnualReviewRepository {
  readonly createdPayloads: readonly AnnualReviewCreatePersist[];
  readonly signedPayloads: readonly {
    id: string;
    payload: AnnualReviewSignOffPersist;
  }[];
  readonly updatedPayloads: readonly {
    id: string;
    payload: AnnualReviewUpdatePersist;
  }[];
}

function echoRow(payload: AnnualReviewCreatePersist): AnnualReviewRow {
  return {
    id: "fake-annual-id",
    review_year: payload.review_year,
    review_period_from: payload.review_period_from,
    review_period_to: payload.review_period_to,
    checklist: payload.checklist,
    action_plan: payload.action_plan,
    locked: payload.locked,
    signed_off_at: null,
    approved_at: null,
    updated_at: payload.updated_at,
    created_at: payload.updated_at,
    signer: null,
    approver: null,
    creator: { name: payload.created_by },
  };
}

export function createFakeHaccpAnnualReviewRepository(
  seed?: FakeHaccpAnnualReviewSeed,
): FakeHaccpAnnualReviewRepository {
  const createdPayloads: AnnualReviewCreatePersist[] = [];
  const signedPayloads: {
    id: string;
    payload: AnnualReviewSignOffPersist;
  }[] = [];
  const updatedPayloads: {
    id: string;
    payload: AnnualReviewUpdatePersist;
  }[] = [];

  return {
    get createdPayloads() {
      return createdPayloads;
    },
    get signedPayloads() {
      return signedPayloads;
    },
    get updatedPayloads() {
      return updatedPayloads;
    },

    async listReviews(): Promise<readonly AnnualReviewRow[]> {
      return seed?.reviews ?? [];
    },

    async createDraft(
      payload: AnnualReviewCreatePersist,
    ): Promise<AnnualReviewRow> {
      if (seed?.conflictOnCreate) {
        throw new ConflictError(
          "A draft review already exists. Complete or delete it before starting a new one.",
        );
      }
      createdPayloads.push(payload);
      return seed?.createdRow ?? echoRow(payload);
    },

    async findCurrent(_id: string): Promise<AnnualReviewCurrent | null> {
      return seed?.current ?? null;
    },

    async signOff(
      id: string,
      payload: AnnualReviewSignOffPersist,
    ): Promise<AnnualReviewRow> {
      signedPayloads.push({ id, payload });
      return seed?.signedRow ?? (seed?.createdRow as AnnualReviewRow);
    },

    async update(
      id: string,
      payload: AnnualReviewUpdatePersist,
    ): Promise<AnnualReviewRow> {
      updatedPayloads.push({ id, payload });
      return seed?.updatedRow ?? (seed?.createdRow as AnnualReviewRow);
    },
  };
}

export const fakeHaccpAnnualReviewRepository: HaccpAnnualReviewRepository =
  createFakeHaccpAnnualReviewRepository();
