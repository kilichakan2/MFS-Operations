/**
 * lib/ports/__contracts__/AuditLogRepository.contract.ts
 *
 * Shared behavioural contract for AuditLogRepository (F-20 PR3). Both adapters
 * (Supabase + Fake) pass the SAME suite.
 *
 * Pattern matches ProductsRepository.contract.ts (the setup-closure shape
 * locked at F-06 Gate 1). The setup closure yields `{ repo, makeEntry, cleanup }`.
 *
 * `record` is WRITE-ONLY — there is deliberately no read-back method on the port
 * (the deepest possible interface). So the shared contract can only assert that
 * `record` RESOLVES (no throw). The "persists every field verbatim" assertion
 * lives in the Fake-specific test, which can inspect the in-memory `entries`
 * array. The Supabase integration run proves the real insert resolves against
 * the live audit_log table.
 *
 * Per-case mapping to the port JSDoc (lib/ports/AuditLogRepository.ts):
 *   - Case 1 → `record` resolves on a valid entry.
 *   - Case 2 → a second `record` with the same fields also resolves (audit_log
 *     has no unique constraint on these fields — duplicates are allowed).
 */
import { describe, it, expect, afterEach } from "vitest";
import type { AuditLogRepository } from "@/lib/ports";
import type { AuditLogEntry } from "@/lib/domain";

export interface AuditLogContractSetup {
  repo: AuditLogRepository;
  /** Build a fresh, valid entry (each call may use a distinct summary so the
   *  Supabase run can clean up its own rows by a sentinel). */
  makeEntry: () => AuditLogEntry;
  cleanup: () => Promise<void>;
}

export function auditLogRepositoryContract(
  setup: () => Promise<AuditLogContractSetup>,
): void {
  describe("AuditLogRepository contract", () => {
    let ctx: AuditLogContractSetup;

    afterEach(async () => {
      if (ctx) await ctx.cleanup();
    });

    it("record resolves (no throw) on a valid entry", async () => {
      ctx = await setup();
      await expect(ctx.repo.record(ctx.makeEntry())).resolves.toBeUndefined();
    });

    it("record resolves on a duplicate entry (no unique constraint on these fields)", async () => {
      ctx = await setup();
      const entry = ctx.makeEntry();
      await expect(ctx.repo.record(entry)).resolves.toBeUndefined();
      // Same fields again — audit_log allows duplicates, so this also resolves.
      await expect(ctx.repo.record(entry)).resolves.toBeUndefined();
    });
  });
}
