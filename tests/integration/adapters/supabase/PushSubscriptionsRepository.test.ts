/**
 * tests/integration/adapters/supabase/PushSubscriptionsRepository.test.ts
 *
 * F-25 — runs the shared PushSubscriptionsRepository contract against the
 * Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this calls the adapter directly (F-06 direct-
 * adapter pattern). push_subscriptions.user_id FKs to users, so the wrapper
 * provisions the standard test users and uses the admin id. Endpoints are
 * sentinel-prefixed so cleanup deletes only this run's rows.
 */
import { pushSubscriptionsRepositoryContract } from "@/lib/ports/__contracts__/PushSubscriptionsRepository.contract";
import { createSupabasePushSubscriptionsRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestUsers, TEST_PREFIX } from "../../_setup";

const SENTINEL = `https://push.${TEST_PREFIX}example/`;

pushSubscriptionsRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabasePushSubscriptionsRepository(client);
  const users = await setupTestUsers();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    repo,
    userId: users.admin.id,
    endpointA: `${SENTINEL}A-${stamp}`,
    endpointB: `${SENTINEL}B-${stamp}`,
    cleanup: async () => {
      await getServiceClient()
        .from("push_subscriptions")
        .delete()
        .like("endpoint", `${SENTINEL}%`);
    },
  };
});
