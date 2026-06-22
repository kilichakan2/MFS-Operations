/**
 * lib/adapters/supabase/HaccpCorrectiveActionsRepository.ts
 *
 * Supabase implementation of `HaccpCorrectiveActionsRepository`
 * (lib/ports/HaccpCorrectiveActionsRepository.ts). One of the adapter files
 * allowed to import `@supabase/supabase-js` (allow-listed for the
 * `lib/adapters/supabase` tree at `.eslintrc.json`). The ONLY file that imports
 * the vendor SDK for the shared `haccp_corrective_actions` ledger.
 *
 * Boundary discipline (ADR-0002 line 27): the `.select(…)` / `.update(…)`
 * strings are copied VERBATIM from `app/api/haccp/corrective-actions/route.ts`
 * (queue) and `app/api/haccp/corrective-actions/[id]/route.ts` (sign-off), so
 * the PR2 re-point's wire output stays byte-identical. `insertMany` passes the
 * rows through UNMODIFIED (no normalisation) so the per-writer
 * `resolved`/`null` nuances are preserved on the wire.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseHaccpCorrectiveActionsRepository(client)` factory.
 *   - `supabaseHaccpCorrectiveActionsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract: reads return empty lists on miss; every DB failure throws
 * ServiceError. The `ca_write_failed` soft-fail (insert error → logged, not
 * thrown) is owned by the use-case — `insertMany` throws on a DB failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  CorrectiveActionInsert,
  CorrectiveActionQueue,
  CorrectiveActionQueueRow,
  CorrectiveActionResolvedRow,
} from "@/lib/domain";
import type { HaccpCorrectiveActionsRepository } from "@/lib/ports";

// Select column strings copied VERBATIM from corrective-actions/route.ts
// (lines 25 + 32) so the wire output stays byte-identical after PR2.
const QUEUE_UNRESOLVED_COLS =
  "id, submitted_at, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, source_table, management_verification_required, users!actioned_by(name)";

const QUEUE_RESOLVED_COLS =
  "id, submitted_at, verified_at, ccp_ref, deviation_description, action_taken, source_table, users!actioned_by(name), verifier:users!verified_by(name)";

export function createSupabaseHaccpCorrectiveActionsRepository(
  client: SupabaseClient,
): HaccpCorrectiveActionsRepository {
  return {
    async insertMany(rows: readonly CorrectiveActionInsert[]): Promise<void> {
      if (rows.length === 0) return;
      // Pass the rows through UNMODIFIED — the per-writer resolved/null nuances
      // are byte-identity-critical (§7). `as unknown[]` keeps the readonly
      // domain rows acceptable to the supabase-js insert signature.
      const { error } = await client
        .from("haccp_corrective_actions")
        .insert(rows as unknown as Record<string, unknown>[]);
      if (error) {
        log.error("HaccpCorrectiveActionsRepository.insertMany DB error", {
          error: error.message,
        });
        throw new ServiceError("CA insert failed", { cause: error });
      }
    },

    async listVerificationQueue(): Promise<CorrectiveActionQueue> {
      const [unresolved, resolved] = await Promise.all([
        client
          .from("haccp_corrective_actions")
          .select(QUEUE_UNRESOLVED_COLS)
          .eq("management_verification_required", true)
          .is("verified_at", null)
          .order("submitted_at", { ascending: false }),
        client
          .from("haccp_corrective_actions")
          .select(QUEUE_RESOLVED_COLS)
          .eq("management_verification_required", true)
          .not("verified_at", "is", null)
          .order("verified_at", { ascending: false })
          .limit(20),
      ]);

      if (unresolved.error) {
        log.error(
          "HaccpCorrectiveActionsRepository.listVerificationQueue unresolved DB error",
          { error: unresolved.error.message },
        );
        throw new ServiceError("Failed to load corrective actions", {
          cause: unresolved.error,
        });
      }
      if (resolved.error) {
        log.error(
          "HaccpCorrectiveActionsRepository.listVerificationQueue resolved DB error",
          { error: resolved.error.message },
        );
        throw new ServiceError("Failed to load corrective actions", {
          cause: resolved.error,
        });
      }

      return {
        unresolved: (unresolved.data ??
          []) as unknown as CorrectiveActionQueueRow[],
        resolved: (resolved.data ??
          []) as unknown as CorrectiveActionResolvedRow[],
      };
    },

    async signOff(id: string, verifiedBy: string): Promise<void> {
      const { error } = await client
        .from("haccp_corrective_actions")
        .update({
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
          resolved: true,
        })
        .eq("id", id)
        .eq("management_verification_required", true);
      if (error) {
        log.error("HaccpCorrectiveActionsRepository.signOff DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Sign-off failed", { cause: error });
      }
    },
  };
}

export const supabaseHaccpCorrectiveActionsRepository: HaccpCorrectiveActionsRepository =
  createSupabaseHaccpCorrectiveActionsRepository(supabaseService);
