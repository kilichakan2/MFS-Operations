/**
 * tests/integration/adapters/supabase/AlarmSessionsRepository.test.ts
 *
 * F-25 — runs the shared AlarmSessionsRepository contract against the Supabase
 * adapter on the local Supabase stack (F-INFRA-01).
 *
 * alarm_sessions.subscription_id FKs to push_subscriptions (ON DELETE CASCADE),
 * so the setup first plants a sentinel push_subscriptions row and uses its id;
 * cleanup deletes that subscription, cascade-removing this run's sessions. The
 * users FK is satisfied by setupTestUsers (admin id). Each run uses a fresh
 * overdueKey so the `.single()` active-row lookup never collides across runs.
 *
 * Prerequisites:
 *   npm run db:up
 *   npm run test:integration -- adapters/supabase
 */
import { alarmSessionsRepositoryContract } from "@/lib/ports/__contracts__/AlarmSessionsRepository.contract";
import { createSupabaseAlarmSessionsRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestUsers, TEST_PREFIX } from "../../_setup";

const SENTINEL = `https://push.${TEST_PREFIX}alarm/`;

alarmSessionsRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseAlarmSessionsRepository(client);
  const users = await setupTestUsers();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Plant a subscription row to satisfy the alarm_sessions FK.
  const { data: sub, error } = await client
    .from("push_subscriptions")
    .insert({
      user_id: users.admin.id,
      endpoint: `${SENTINEL}${stamp}`,
      p256dh: "p256dh-test",
      auth: "auth-test",
      device_label: `${TEST_PREFIX}alarm`,
    })
    .select("id")
    .single();
  if (error) throw error;
  const subscriptionId = (sub as { id: string }).id;

  return {
    repo,
    subscriptionId,
    overdueKey: `${TEST_PREFIX}${stamp}`,
    cleanup: async () => {
      // Cascade removes this run's alarm_sessions rows.
      await getServiceClient()
        .from("push_subscriptions")
        .delete()
        .like("endpoint", `${SENTINEL}%`);
    },
  };
});
