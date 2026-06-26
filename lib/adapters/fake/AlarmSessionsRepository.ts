/**
 * lib/adapters/fake/AlarmSessionsRepository.ts
 *
 * In-memory implementation of `AlarmSessionsRepository`
 * (lib/ports/AlarmSessionsRepository.ts). No Supabase SDK import — pure
 * JavaScript. The faithful twin of the Supabase adapter so the usecase unit
 * tests can exercise the escalation/cleanup loop (find→insert-0→updateCount,
 * resolveAllActive) deterministically.
 *
 * Byte-identity preserved:
 *   - find maps "no active row" → null (NOT an error).
 *   - insert creates an active session with notificationCount 0 (the insert-0
 *     quirk — the usecase only bumps it after a full successful send).
 *   - resolveAllActive sets resolvedAt on every active session.
 *
 * Construction:
 *   - `createFakeAlarmSessionsRepository(seed?)` factory — each call its own
 *     store. `seed.sessions` pre-populates active sessions (e.g. to drive the
 *     "found → escalate" path).
 *   - `fakeAlarmSessionsRepository` singleton — barrel symmetry.
 */

import type {
  AlarmSessionsRepository,
  ActiveAlarmSession,
} from "@/lib/ports";

interface StoredSession {
  id: string;
  subscriptionId: string;
  overdueKey: string;
  notificationCount: number;
  resolvedAt: string | null;
}

export interface FakeAlarmSessionSeed {
  readonly id: string;
  readonly subscriptionId: string;
  readonly overdueKey: string;
  readonly notificationCount: number;
}

export interface FakeAlarmSessionsSeed {
  readonly sessions?: readonly FakeAlarmSessionSeed[];
}

export interface FakeAlarmSessionsRepository extends AlarmSessionsRepository {
  /** Test inspection: every session in the store (incl. resolved). */
  readonly sessions: readonly Readonly<StoredSession>[];
}

export function createFakeAlarmSessionsRepository(
  seed?: FakeAlarmSessionsSeed,
): FakeAlarmSessionsRepository {
  const sessions: StoredSession[] = (seed?.sessions ?? []).map((s) => ({
    id: s.id,
    subscriptionId: s.subscriptionId,
    overdueKey: s.overdueKey,
    notificationCount: s.notificationCount,
    resolvedAt: null,
  }));
  let nextId = sessions.length + 1;

  return {
    sessions,
    async resolveAllActive(nowIso: string): Promise<void> {
      for (const s of sessions) {
        if (s.resolvedAt === null) s.resolvedAt = nowIso;
      }
    },
    async findActiveBySubscriptionAndKey(
      subscriptionId: string,
      overdueKey: string,
    ): Promise<ActiveAlarmSession | null> {
      const found = sessions.find(
        (s) =>
          s.subscriptionId === subscriptionId &&
          s.overdueKey === overdueKey &&
          s.resolvedAt === null,
      );
      if (!found) return null;
      return { id: found.id, notificationCount: found.notificationCount };
    },
    async insert(
      subscriptionId: string,
      overdueKey: string,
    ): Promise<{ id: string } | null> {
      const id = `fake-session-${nextId++}`;
      sessions.push({
        id,
        subscriptionId,
        overdueKey,
        notificationCount: 0,
        resolvedAt: null,
      });
      return { id };
    },
    async updateCount(
      sessionId: string,
      count: number,
      _lastSentIso: string,
    ): Promise<void> {
      void _lastSentIso;
      const s = sessions.find((x) => x.id === sessionId);
      if (s) s.notificationCount = count;
    },
  };
}

export const fakeAlarmSessionsRepository: FakeAlarmSessionsRepository =
  createFakeAlarmSessionsRepository();
