/**
 * tests/integration/adapters/supabase/AuditLogRepository.test.ts
 *
 * F-20 PR3 — runs the shared AuditLogRepository contract suite against the
 * Supabase adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up                                          (one terminal)
 *   npm run test:integration -- adapters/supabase          (another)
 *
 * No `npm run dev` required — this calls the adapter directly, bypassing the
 * routes (the F-06 direct-adapter pattern).
 *
 * audit_log is append-only with no read-back on the port; the contract only
 * asserts `record` RESOLVES. cleanup deletes every row this run inserted by a
 * sentinel `summary` prefix so the table doesn't accumulate test rows. A real
 * user_id is required by the audit_log.user_id FK, so the wrapper provisions the
 * standard test users and uses the admin id.
 */
import { auditLogRepositoryContract } from "@/lib/ports/__contracts__/AuditLogRepository.contract";
import { createSupabaseAuditLogRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestUsers, TEST_PREFIX } from "../../_setup";
import type { AuditLogEntry } from "@/lib/domain";

const SENTINEL = `${TEST_PREFIX}audit`;

auditLogRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseAuditLogRepository(client);
  const users = await setupTestUsers();

  let seq = 0;
  const makeEntry = (): AuditLogEntry => {
    seq += 1;
    return {
      user_id: users.admin.id,
      screen: "screen5",
      action: "imported",
      record_id: null,
      summary: `${SENTINEL} entry ${seq}`,
    };
  };

  return {
    repo,
    makeEntry,
    cleanup: async () => {
      await getServiceClient()
        .from("audit_log")
        .delete()
        .like("summary", `${SENTINEL}%`);
    },
  };
});
