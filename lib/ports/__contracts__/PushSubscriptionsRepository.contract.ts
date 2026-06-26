/**
 * lib/ports/__contracts__/PushSubscriptionsRepository.contract.ts
 *
 * Shared behavioural contract for PushSubscriptionsRepository (F-25). Both
 * adapters (Supabase + Fake) pass the SAME suite.
 *
 * Pattern matches AuditLogRepository.contract.ts (the setup-closure shape locked
 * at F-06 Gate 1). The setup closure yields `{ repo, seedRow, listEndpoints,
 * cleanup }`:
 *   - `seedRow(input)` inserts a subscription row directly (so listAll/delete can
 *     observe it) and returns its endpoint.
 *   - `listEndpoints()` reads back the current endpoints (so the contract can
 *     assert deleteByEndpoints removed the right rows). For the Fake this reads
 *     its in-memory store; for Supabase it re-queries the table.
 *
 * Cases:
 *   1 → listAll returns a seeded row's id/endpoint/p256dh/auth.
 *   2 → upsert inserts a new row (it then appears in listAll).
 *   3 → upsert on a conflicting (userId, endpoint) updates, does NOT duplicate.
 *   4 → deleteByEndpoints removes only the named endpoints.
 *   5 → deleteByEndpoints([]) is a no-op (mirrors the route's length>0 guard).
 */
import { describe, it, expect, afterEach } from "vitest";
import type { PushSubscriptionsRepository } from "@/lib/ports";

export interface PushSubscriptionsContractSetup {
  repo: PushSubscriptionsRepository;
  /** A user id rows can be attached to (FK-valid where the DB enforces it). */
  userId: string;
  /** Fresh unique endpoints for this run (so parallel runs don't collide). */
  endpointA: string;
  endpointB: string;
  cleanup: () => Promise<void>;
}

export function pushSubscriptionsRepositoryContract(
  setup: () => Promise<PushSubscriptionsContractSetup>,
): void {
  describe("PushSubscriptionsRepository contract", () => {
    let ctx: PushSubscriptionsContractSetup;

    afterEach(async () => {
      if (ctx) await ctx.cleanup();
    });

    it("upsert inserts a row that listAll then returns with id/endpoint/p256dh/auth", async () => {
      ctx = await setup();
      await ctx.repo.upsert({
        userId: ctx.userId,
        endpoint: ctx.endpointA,
        p256dh: "p256dh-A",
        auth: "auth-A",
        deviceLabel: "Device A",
        lastUsedIso: "2026-06-26T10:00:00.000Z",
      });
      const all = await ctx.repo.listAll();
      const row = all.find((r) => r.endpoint === ctx.endpointA);
      expect(row).toBeDefined();
      expect(row!.p256dh).toBe("p256dh-A");
      expect(row!.auth).toBe("auth-A");
      expect(typeof row!.id).toBe("string");
    });

    it("upsert on the same (userId, endpoint) updates rather than duplicating", async () => {
      ctx = await setup();
      const base = {
        userId: ctx.userId,
        endpoint: ctx.endpointA,
        p256dh: "p256dh-1",
        auth: "auth-1",
        deviceLabel: null,
        lastUsedIso: "2026-06-26T10:00:00.000Z",
      };
      await ctx.repo.upsert(base);
      await ctx.repo.upsert({ ...base, p256dh: "p256dh-2", auth: "auth-2" });
      const all = await ctx.repo.listAll();
      const matching = all.filter((r) => r.endpoint === ctx.endpointA);
      expect(matching).toHaveLength(1);
      expect(matching[0].p256dh).toBe("p256dh-2");
    });

    it("deleteByEndpoints removes only the named endpoints", async () => {
      ctx = await setup();
      await ctx.repo.upsert({
        userId: ctx.userId,
        endpoint: ctx.endpointA,
        p256dh: "pA",
        auth: "aA",
        deviceLabel: null,
        lastUsedIso: "2026-06-26T10:00:00.000Z",
      });
      await ctx.repo.upsert({
        userId: ctx.userId,
        endpoint: ctx.endpointB,
        p256dh: "pB",
        auth: "aB",
        deviceLabel: null,
        lastUsedIso: "2026-06-26T10:00:00.000Z",
      });
      await ctx.repo.deleteByEndpoints([ctx.endpointA]);
      const all = await ctx.repo.listAll();
      const endpoints = all.map((r) => r.endpoint);
      expect(endpoints).not.toContain(ctx.endpointA);
      expect(endpoints).toContain(ctx.endpointB);
    });

    it("deleteByEndpoints([]) is a no-op", async () => {
      ctx = await setup();
      await ctx.repo.upsert({
        userId: ctx.userId,
        endpoint: ctx.endpointA,
        p256dh: "pA",
        auth: "aA",
        deviceLabel: null,
        lastUsedIso: "2026-06-26T10:00:00.000Z",
      });
      await expect(ctx.repo.deleteByEndpoints([])).resolves.toBeUndefined();
      const all = await ctx.repo.listAll();
      expect(all.map((r) => r.endpoint)).toContain(ctx.endpointA);
    });
  });
}
