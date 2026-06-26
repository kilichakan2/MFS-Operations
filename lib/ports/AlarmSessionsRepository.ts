/**
 * lib/ports/AlarmSessionsRepository.ts
 *
 * The AlarmSessionsRepository port (F-25) — the app's own socket for the
 * `alarm_sessions` table (the escalation bookkeeping: "how many times have we
 * nagged this device about this overdue set"). Pure TypeScript: no vendor SDK,
 * no framework.
 *
 * The `alarm_sessions` table is service-role-only — the production singleton is
 * wired with the master DB key (lib/wiring/). Every method preserves the alarm
 * cron's exact behaviour BYTE-IDENTICALLY (the insert-count-0 quirk, the
 * `.single()` no-row→null mapping, the insert-miss→null semantics).
 */

/** The active session for one subscription + overdue key. */
export interface ActiveAlarmSession {
  readonly id: string;
  /** Maps the DB `notification_count` (with the route's `?? 0` applied here). */
  readonly notificationCount: number;
}

export interface AlarmSessionsRepository {
  /**
   * Resolve every active session: set `resolved_at = nowIso` where
   * `resolved_at is null` (the nothing-overdue branch). `nowIso` is injected
   * (no `new Date()` in the adapter). @throws ServiceError.
   */
  resolveAllActive(nowIso: string): Promise<void>;
  /**
   * The active (`resolved_at is null`) session for this subscription +
   * overdue_key, or null if none. Maps today's `.single()` no-row code
   * (`PGRST116`) → null (NOT an error — the route's `if (existing)` treats no-row
   * as "create one"). A real DB failure (incl. `.single()`'s multiple-row error)
   * throws ServiceError. @throws ServiceError.
   */
  findActiveBySubscriptionAndKey(
    subscriptionId: string,
    overdueKey: string,
  ): Promise<ActiveAlarmSession | null>;
  /**
   * Insert a new active session with `notification_count: 0` (PRESERVE — the
   * route inserts 0 then later updates to the real count; a subscription that
   * fails on its first item is never updated and stays at 0). Returns its id, or
   * null if the insert returned no row (mirrors the route's `newSession?.id ?? ''`
   * → the route uses '' to skip the later update). @throws ServiceError.
   */
  insert(
    subscriptionId: string,
    overdueKey: string,
  ): Promise<{ id: string } | null>;
  /**
   * Update a session's `notification_count` + `last_sent_at`. `lastSentIso` is
   * injected (no `new Date()` in the adapter). @throws ServiceError.
   */
  updateCount(
    sessionId: string,
    count: number,
    lastSentIso: string,
  ): Promise<void>;
}
