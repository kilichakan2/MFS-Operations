/**
 * tests/unit/adapters/fake/PushSubscriptionsRepository.test.ts
 *
 * F-25 — runs the shared PushSubscriptionsRepository contract against the Fake.
 * The Supabase adapter runs the SAME contract on the live stack
 * (tests/integration/adapters/supabase/PushSubscriptionsRepository.test.ts).
 */
import { pushSubscriptionsRepositoryContract } from "@/lib/ports/__contracts__/PushSubscriptionsRepository.contract";
import { createFakePushSubscriptionsRepository } from "@/lib/adapters/fake";

pushSubscriptionsRepositoryContract(async () => ({
  repo: createFakePushSubscriptionsRepository(),
  userId: "user-1",
  endpointA: "https://push.example/A",
  endpointB: "https://push.example/B",
  cleanup: async () => {},
}));
