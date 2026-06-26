/**
 * lib/wiring/pushSubscriptions.ts — composition root for the
 * PushSubscriptionsRepository port (F-25, R7)
 *
 * The ONE business-layer file where the subscribe route's `push_subscriptions`
 * write is bolted to its concrete Supabase adapter (same F-TD-11 rule: only
 * composition roots import from `@/lib/adapters/*`), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`. The subscribe route imports
 * THIS singleton, never the adapter — so the route ends adapter-free.
 *
 * SERVICE-ROLE SINGLETON. `push_subscriptions` is service-role-only by RLS —
 * exactly the access the subscribe route had with the raw `supabaseService`
 * client today, so the R7 re-point is byte-identical.
 *
 * (The alarm cron use-case wires its OWN copy of this same service-role repo in
 * lib/wiring/haccpAlarm.ts; both point at the same singleton object.)
 *
 * Rip-out contract: swapping the DB for `push_subscriptions` = one new adapter +
 * one edit here. The subscribe route, the port and the owned types never change.
 */
import { supabasePushSubscriptionsRepository } from "@/lib/adapters/supabase";
import type { PushSubscriptionsRepository } from "@/lib/ports";

export const pushSubscriptions: PushSubscriptionsRepository =
  supabasePushSubscriptionsRepository;
