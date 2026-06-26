/**
 * lib/adapters/fake/AuditLogRepository.ts
 *
 * In-memory implementation of `AuditLogRepository` (lib/ports/AuditLogRepository.ts).
 * No Supabase SDK import — pure JavaScript array storage of DOMAIN types.
 *
 * Boundary discipline (ADR-0002 line 27): the store is `AuditLogEntry[]` — no
 * row shape, no vendor import.
 *
 * Test inspection: every entry `record()` received is pushed to `entries` in
 * order, so the contract + route tests can assert WHAT was written verbatim.
 *
 * Construction:
 *   - `createFakeAuditLogRepository()` factory — tests get a fresh, isolated
 *     store (each call its own array).
 *   - `fakeAuditLogRepository` singleton — exists only for barrel symmetry.
 */

import type { AuditLogEntry } from "@/lib/domain";
import type { AuditLogRepository } from "@/lib/ports";

export interface FakeAuditLogRepository extends AuditLogRepository {
  /** Test inspection: every entry record() received, in order. */
  readonly entries: readonly AuditLogEntry[];
}

export function createFakeAuditLogRepository(): FakeAuditLogRepository {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async record(entry: AuditLogEntry): Promise<void> {
      entries.push(entry);
    },
  };
}

export const fakeAuditLogRepository: FakeAuditLogRepository =
  createFakeAuditLogRepository();
