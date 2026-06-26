/**
 * lib/ports/PushSubscriptionsRepository.ts
 *
 * The PushSubscriptionsRepository port (F-25) — the app's own socket for the
 * `push_subscriptions` table (the registered-devices list). Pure TypeScript:
 * imports nothing; no vendor SDK, no framework.
 *
 * The alarm cron reads + deletes subscriptions; the subscribe route upserts
 * one. All three operations route through this port so no route touches the
 * raw Supabase client. The `push_subscriptions` table is service-role-only —
 * the production singleton is wired with the master DB key (lib/wiring/).
 */

/** One push subscription row (the columns the cron reads today). */
export interface PushSubscriptionRow {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface PushSubscriptionsRepository {
  /**
   * All push subscriptions (id, endpoint, p256dh, auth), no filter — exactly
   * today's `.select('id, endpoint, p256dh, auth')`. @throws ServiceError.
   */
  listAll(): Promise<readonly PushSubscriptionRow[]>;
  /**
   * Delete subscriptions whose endpoint is in `endpoints`. No-op on an empty
   * array (mirrors the route's `if (expiredEndpoints.length > 0)` guard).
   * @throws ServiceError.
   */
  deleteByEndpoints(endpoints: readonly string[]): Promise<void>;
  /**
   * Upsert one subscription (R7 — re-points the subscribe route). Byte-identical
   * to today's `.upsert({ user_id, endpoint, p256dh, auth, device_label,
   * last_used }, { onConflict: 'user_id,endpoint' })`. `lastUsedIso` is injected
   * (no `new Date()` in the adapter). @throws ServiceError (the route maps a
   * thrown error → 500 { error: 'Failed to save subscription' }).
   */
  upsert(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceLabel: string | null;
    lastUsedIso: string;
  }): Promise<void>;
}
