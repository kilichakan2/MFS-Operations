/**
 * tests/unit/adapters/fake/AlarmSessionsRepository.test.ts
 *
 * F-25 — runs the shared AlarmSessionsRepository contract against the Fake.
 * The Supabase adapter runs the SAME contract on the live stack
 * (tests/integration/adapters/supabase/AlarmSessionsRepository.test.ts).
 */
import { alarmSessionsRepositoryContract } from "@/lib/ports/__contracts__/AlarmSessionsRepository.contract";
import { createFakeAlarmSessionsRepository } from "@/lib/adapters/fake";

alarmSessionsRepositoryContract(async () => ({
  repo: createFakeAlarmSessionsRepository(),
  subscriptionId: "sub-1",
  overdueKey: "cold_am|cold_pm",
  cleanup: async () => {},
}));
