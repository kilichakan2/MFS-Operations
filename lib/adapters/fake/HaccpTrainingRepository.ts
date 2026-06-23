/**
 * lib/adapters/fake/HaccpTrainingRepository.ts
 *
 * In-memory implementation of `HaccpTrainingRepository`
 * (lib/ports/HaccpTrainingRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can rely on parity.
 *
 * It records every inserted payload AS-IS (so tests can assert the exact row).
 * Reads are seedable. Both inserts return void (matching the route's discard).
 *
 * Construction:
 *   - `createFakeHaccpTrainingRepository(seed?)` factory — tests inject the read
 *     fixtures (staffTraining, allergenTraining).
 *   - `fakeHaccpTrainingRepository` singleton — empty; barrel symmetry.
 */

import type {
  StaffTrainingRow,
  StaffTrainingPersist,
  AllergenTrainingRow,
  AllergenTrainingPersist,
} from "@/lib/domain";
import type { HaccpTrainingRepository } from "@/lib/ports";

/** Optional read fixtures the service reads back. */
export interface FakeHaccpTrainingSeed {
  readonly staffTraining?: readonly StaffTrainingRow[];
  readonly allergenTraining?: readonly AllergenTrainingRow[];
}

/** A test-inspectable Fake training repository: exposes recorded writes. */
export interface FakeHaccpTrainingRepository extends HaccpTrainingRepository {
  readonly insertedStaffTraining: readonly StaffTrainingPersist[];
  readonly insertedAllergenTraining: readonly AllergenTrainingPersist[];
}

export function createFakeHaccpTrainingRepository(
  seed?: FakeHaccpTrainingSeed,
): FakeHaccpTrainingRepository {
  const insertedStaffTraining: StaffTrainingPersist[] = [];
  const insertedAllergenTraining: AllergenTrainingPersist[] = [];

  return {
    get insertedStaffTraining() {
      return insertedStaffTraining;
    },
    get insertedAllergenTraining() {
      return insertedAllergenTraining;
    },

    async listStaffTraining(): Promise<readonly StaffTrainingRow[]> {
      return seed?.staffTraining ?? [];
    },

    async listAllergenTraining(): Promise<readonly AllergenTrainingRow[]> {
      return seed?.allergenTraining ?? [];
    },

    async insertStaffTraining(payload: StaffTrainingPersist): Promise<void> {
      insertedStaffTraining.push(payload);
    },

    async insertAllergenTraining(
      payload: AllergenTrainingPersist,
    ): Promise<void> {
      insertedAllergenTraining.push(payload);
    },
  };
}

export const fakeHaccpTrainingRepository: HaccpTrainingRepository =
  createFakeHaccpTrainingRepository();
