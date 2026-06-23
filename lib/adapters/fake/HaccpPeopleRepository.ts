/**
 * lib/adapters/fake/HaccpPeopleRepository.ts
 *
 * In-memory implementation of `HaccpPeopleRepository`
 * (lib/ports/HaccpPeopleRepository.ts). No Supabase SDK import — pure JavaScript
 * storage of DOMAIN types. The faithful twin of the Supabase adapter so the
 * service unit tests can rely on parity.
 *
 * It records every inserted payload AS-IS (so tests can assert the exact row,
 * including which columns each path set — R1). Reads are seedable. The insert
 * returns void (matching the route's discard).
 *
 * Construction:
 *   - `createFakeHaccpPeopleRepository(seed?)` factory — tests inject the read
 *     fixtures (healthRecords).
 *   - `fakeHaccpPeopleRepository` singleton — empty; barrel symmetry.
 */

import type { HealthRecordRow, HealthRecordPersist } from "@/lib/domain";
import type { HaccpPeopleRepository } from "@/lib/ports";

/** Optional read fixtures the service reads back. */
export interface FakeHaccpPeopleSeed {
  readonly healthRecords?: readonly HealthRecordRow[];
}

/** A test-inspectable Fake people repository: exposes recorded writes. */
export interface FakeHaccpPeopleRepository extends HaccpPeopleRepository {
  readonly insertedHealthRecords: readonly HealthRecordPersist[];
}

export function createFakeHaccpPeopleRepository(
  seed?: FakeHaccpPeopleSeed,
): FakeHaccpPeopleRepository {
  const insertedHealthRecords: HealthRecordPersist[] = [];

  return {
    get insertedHealthRecords() {
      return insertedHealthRecords;
    },

    async listHealthRecords(): Promise<readonly HealthRecordRow[]> {
      return seed?.healthRecords ?? [];
    },

    async insertHealthRecord(payload: HealthRecordPersist): Promise<void> {
      insertedHealthRecords.push(payload);
    },
  };
}

export const fakeHaccpPeopleRepository: HaccpPeopleRepository =
  createFakeHaccpPeopleRepository();
