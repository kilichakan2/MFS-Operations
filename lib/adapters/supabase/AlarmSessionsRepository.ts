/**
 * lib/adapters/supabase/AlarmSessionsRepository.ts
 *
 * Supabase implementation of `AlarmSessionsRepository`
 * (lib/ports/AlarmSessionsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js`. The ONLY new place the SDK is touched for the
 * `alarm_sessions` table in F-25.
 *
 * Boundary discipline (ADR-0002 line 27): the vendor error shape is mapped to a
 * ServiceError and never leaks. Every query is copied VERBATIM from the alarm
 * cron route so the re-point is byte-identical:
 *   - resolveAllActive → `.update({ resolved_at: nowIso }).is('resolved_at', null)`
 *   - findActiveBySubscriptionAndKey → `.select('id, notification_count')
 *       .eq('subscription_id', …).eq('overdue_key', …).is('resolved_at', null)
 *       .single()`  ← R9: `.single()`, NOT `.maybeSingle()`. The PostgREST no-row
 *       code (PGRST116) maps → null (the route's `if (existing)` treats no-row as
 *       "create one"); ANY other error (incl. `.single()`'s multiple-row error)
 *       throws ServiceError, which the route's outer catch turns into a 500.
 *   - insert → `.insert({ subscription_id, overdue_key, notification_count: 0 })
 *       .select('id').single()` returning `{ id }` or null (mirrors the route's
 *       `newSession?.id ?? ''` — null lets the usecase skip the later update).
 *   - updateCount → `.update({ notification_count, last_sent_at: lastSentIso })
 *       .eq('id', …)`
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseAlarmSessionsRepository(client)` factory.
 *   - `supabaseAlarmSessionsRepository` singleton — pre-wired against
 *     `supabaseService` (`alarm_sessions` is service-role-only by RLS, exactly
 *     the access the cron has today).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import type {
  AlarmSessionsRepository,
  ActiveAlarmSession,
} from "@/lib/ports";

/** PostgREST "no rows returned" code from `.single()` on an empty result. */
const NO_ROW_CODE = "PGRST116";

export function createSupabaseAlarmSessionsRepository(
  client: SupabaseClient,
): AlarmSessionsRepository {
  return {
    async resolveAllActive(nowIso: string): Promise<void> {
      const { error } = await client
        .from("alarm_sessions")
        .update({ resolved_at: nowIso })
        .is("resolved_at", null);
      if (error) {
        throw new ServiceError("Failed to resolve alarm sessions", {
          cause: error,
        });
      }
    },

    async findActiveBySubscriptionAndKey(
      subscriptionId: string,
      overdueKey: string,
    ): Promise<ActiveAlarmSession | null> {
      const { data, error } = await client
        .from("alarm_sessions")
        .select("id, notification_count")
        .eq("subscription_id", subscriptionId)
        .eq("overdue_key", overdueKey)
        .is("resolved_at", null)
        .single();
      if (error) {
        // No active row → null (the route's `if (existing)` creates one).
        if ((error as { code?: string }).code === NO_ROW_CODE) return null;
        // Any other error (incl. `.single()`'s multiple-row error) → throw.
        throw new ServiceError("Failed to find alarm session", { cause: error });
      }
      const row = data as { id: string; notification_count: number | null };
      return { id: row.id, notificationCount: row.notification_count ?? 0 };
    },

    async insert(
      subscriptionId: string,
      overdueKey: string,
    ): Promise<{ id: string } | null> {
      const { data, error } = await client
        .from("alarm_sessions")
        .insert({
          subscription_id: subscriptionId,
          overdue_key: overdueKey,
          notification_count: 0,
        })
        .select("id")
        .single();
      if (error) {
        throw new ServiceError("Failed to create alarm session", {
          cause: error,
        });
      }
      const row = data as { id: string } | null;
      return row?.id ? { id: row.id } : null;
    },

    async updateCount(
      sessionId: string,
      count: number,
      lastSentIso: string,
    ): Promise<void> {
      const { error } = await client
        .from("alarm_sessions")
        .update({ notification_count: count, last_sent_at: lastSentIso })
        .eq("id", sessionId);
      if (error) {
        throw new ServiceError("Failed to update alarm session", {
          cause: error,
        });
      }
    },
  };
}

export const supabaseAlarmSessionsRepository: AlarmSessionsRepository =
  createSupabaseAlarmSessionsRepository(supabaseService);
