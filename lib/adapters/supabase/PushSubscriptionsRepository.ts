/**
 * lib/adapters/supabase/PushSubscriptionsRepository.ts
 *
 * Supabase implementation of `PushSubscriptionsRepository`
 * (lib/ports/PushSubscriptionsRepository.ts). One of the adapter files allowed
 * to import `@supabase/supabase-js`. The ONLY new place the SDK is touched for
 * the `push_subscriptions` table in F-25.
 *
 * Boundary discipline (ADR-0002 line 27): the vendor error shape is mapped to a
 * ServiceError and never leaks past this boundary. Selects/columns are copied
 * VERBATIM from the alarm cron route + the subscribe route so the re-point is
 * byte-identical:
 *   - listAll        → `.select('id, endpoint, p256dh, auth')` (cron)
 *   - deleteByEndpoints → `.delete().in('endpoint', endpoints)` (cron cleanup,
 *     guarded by the empty-array no-op the route's `if (length > 0)` provided)
 *   - upsert         → `.upsert({ user_id, endpoint, p256dh, auth, device_label,
 *     last_used }, { onConflict: 'user_id,endpoint' })` (subscribe route)
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabasePushSubscriptionsRepository(client)` factory.
 *   - `supabasePushSubscriptionsRepository` singleton — pre-wired against
 *     `supabaseService` (the master key; `push_subscriptions` is service-role-
 *     only by RLS, exactly the access the routes have today).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import type {
  PushSubscriptionsRepository,
  PushSubscriptionRow,
} from "@/lib/ports";

export function createSupabasePushSubscriptionsRepository(
  client: SupabaseClient,
): PushSubscriptionsRepository {
  return {
    async listAll(): Promise<readonly PushSubscriptionRow[]> {
      const { data, error } = await client
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth");
      if (error) {
        throw new ServiceError("Failed to list push subscriptions", {
          cause: error,
        });
      }
      return (data ?? []) as unknown as PushSubscriptionRow[];
    },

    async deleteByEndpoints(endpoints: readonly string[]): Promise<void> {
      if (endpoints.length === 0) return;
      const { error } = await client
        .from("push_subscriptions")
        .delete()
        .in("endpoint", endpoints as string[]);
      if (error) {
        throw new ServiceError("Failed to delete push subscriptions", {
          cause: error,
        });
      }
    },

    async upsert(input): Promise<void> {
      const { error } = await client.from("push_subscriptions").upsert(
        {
          user_id: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          device_label: input.deviceLabel,
          last_used: input.lastUsedIso,
        },
        { onConflict: "user_id,endpoint" },
      );
      if (error) {
        throw new ServiceError("Failed to save subscription", { cause: error });
      }
    },
  };
}

export const supabasePushSubscriptionsRepository: PushSubscriptionsRepository =
  createSupabasePushSubscriptionsRepository(supabaseService);
