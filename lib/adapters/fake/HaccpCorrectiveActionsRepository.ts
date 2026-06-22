/**
 * lib/adapters/fake/HaccpCorrectiveActionsRepository.ts
 *
 * In-memory implementation of `HaccpCorrectiveActionsRepository`
 * (lib/ports/HaccpCorrectiveActionsRepository.ts). No Supabase SDK import — pure
 * JavaScript array storage of DOMAIN types. The faithful twin of the Supabase
 * adapter so the service / use-case unit tests can rely on parity.
 *
 * It records every inserted CA row AS-IS (so tests can assert the exact
 * payload — incl. the per-writer `resolved`/`null` nuances), and tracks
 * sign-offs. Construction:
 *   - `createFakeHaccpCorrectiveActionsRepository(seed?)` factory — tests may
 *     seed pre-existing queue rows.
 *   - `fakeHaccpCorrectiveActionsRepository` singleton — empty; barrel symmetry.
 *
 * `insertFailsWith` lets a test force the soft-fail path (a CA-insert error the
 * use-case must catch and turn into `ca_write_failed: true`).
 */

import type {
  CorrectiveActionInsert,
  CorrectiveActionQueue,
  CorrectiveActionQueueRow,
  CorrectiveActionResolvedRow,
} from "@/lib/domain";
import type { HaccpCorrectiveActionsRepository } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";

/** Optional seed for the admin verification-queue reads. */
export interface FakeHaccpCASeed {
  readonly unresolved?: readonly CorrectiveActionQueueRow[];
  readonly resolved?: readonly CorrectiveActionResolvedRow[];
  /** When set, `insertMany` throws this — drives the use-case soft-fail path. */
  readonly insertFailsWith?: Error;
}

/** A test-inspectable Fake CA repository: exposes the recorded inserts. */
export interface FakeHaccpCorrectiveActionsRepository
  extends HaccpCorrectiveActionsRepository {
  /** Every row passed to `insertMany`, in call order (flattened). */
  readonly inserted: readonly CorrectiveActionInsert[];
  /** Every `insertMany` call's row batch, preserving fan-out boundaries. */
  readonly insertBatches: readonly (readonly CorrectiveActionInsert[])[];
  /** Every `signOff` call's (id, verifiedBy). */
  readonly signOffs: readonly { id: string; verifiedBy: string }[];
}

export function createFakeHaccpCorrectiveActionsRepository(
  seed?: FakeHaccpCASeed,
): FakeHaccpCorrectiveActionsRepository {
  const inserted: CorrectiveActionInsert[] = [];
  const insertBatches: (readonly CorrectiveActionInsert[])[] = [];
  const signOffs: { id: string; verifiedBy: string }[] = [];

  return {
    get inserted() {
      return inserted;
    },
    get insertBatches() {
      return insertBatches;
    },
    get signOffs() {
      return signOffs;
    },

    async insertMany(rows: readonly CorrectiveActionInsert[]): Promise<void> {
      if (rows.length === 0) return;
      if (seed?.insertFailsWith) {
        throw new ServiceError("CA insert failed", {
          cause: seed.insertFailsWith,
        });
      }
      insertBatches.push(rows);
      for (const r of rows) inserted.push(r);
    },

    async listVerificationQueue(): Promise<CorrectiveActionQueue> {
      return {
        unresolved: seed?.unresolved ?? [],
        resolved: seed?.resolved ?? [],
      };
    },

    async signOff(id: string, verifiedBy: string): Promise<void> {
      signOffs.push({ id, verifiedBy });
    },
  };
}

export const fakeHaccpCorrectiveActionsRepository: HaccpCorrectiveActionsRepository =
  createFakeHaccpCorrectiveActionsRepository();
