/**
 * lib/ports/__contracts__/AlarmSessionsRepository.contract.ts
 *
 * Shared behavioural contract for AlarmSessionsRepository (F-25). Both adapters
 * (Supabase + Fake) pass the SAME suite.
 *
 * Pattern matches AuditLogRepository.contract.ts (the setup-closure shape locked
 * at F-06 Gate 1). The setup closure yields `{ repo, subscriptionId, overdueKey,
 * cleanup }`.
 *
 * Cases (mirror the alarm cron's exact ordering + the byte-identical quirks):
 *   1 → find on an absent (subscription, key) returns null (no-row → null, NOT
 *       an error — the route's `if (existing)` treats no-row as "create one").
 *   2 → insert creates an active session with notificationCount 0 (PRESERVE the
 *       insert-0 quirk) which find then returns.
 *   3 → updateCount bumps notificationCount; find reflects the new count.
 *   4 → resolveAllActive resolves the active session so find then returns null.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { AlarmSessionsRepository } from "@/lib/ports";

export interface AlarmSessionsContractSetup {
  repo: AlarmSessionsRepository;
  /** A subscription id rows attach to (FK-valid where the DB enforces it). */
  subscriptionId: string;
  /** A fresh overdue key for this run. */
  overdueKey: string;
  cleanup: () => Promise<void>;
}

export function alarmSessionsRepositoryContract(
  setup: () => Promise<AlarmSessionsContractSetup>,
): void {
  describe("AlarmSessionsRepository contract", () => {
    let ctx: AlarmSessionsContractSetup;

    afterEach(async () => {
      if (ctx) await ctx.cleanup();
    });

    it("find returns null for an absent (subscription, key)", async () => {
      ctx = await setup();
      const found = await ctx.repo.findActiveBySubscriptionAndKey(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      expect(found).toBeNull();
    });

    it("insert creates an active session with notificationCount 0 that find returns", async () => {
      ctx = await setup();
      const inserted = await ctx.repo.insert(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      expect(inserted).not.toBeNull();
      const found = await ctx.repo.findActiveBySubscriptionAndKey(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(inserted!.id);
      expect(found!.notificationCount).toBe(0);
    });

    it("updateCount updates notificationCount which find then reflects", async () => {
      ctx = await setup();
      const inserted = await ctx.repo.insert(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      await ctx.repo.updateCount(
        inserted!.id,
        3,
        "2026-06-26T10:05:00.000Z",
      );
      const found = await ctx.repo.findActiveBySubscriptionAndKey(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      expect(found!.notificationCount).toBe(3);
    });

    it("resolveAllActive resolves the active session so find returns null", async () => {
      ctx = await setup();
      await ctx.repo.insert(ctx.subscriptionId, ctx.overdueKey);
      await ctx.repo.resolveAllActive("2026-06-26T11:00:00.000Z");
      const found = await ctx.repo.findActiveBySubscriptionAndKey(
        ctx.subscriptionId,
        ctx.overdueKey,
      );
      expect(found).toBeNull();
    });
  });
}
