/**
 * lib/ports/__contracts__/DiscrepanciesRepository.contract.ts
 *
 * Shared behavioural contract for DiscrepanciesRepository (F-21). Both
 * adapters — the Supabase real implementation and the Fake in-memory
 * implementation — pass the SAME suite.
 *
 * Pattern (locked at F-06 Gate 1 — mirrors CustomersRepository.contract.ts):
 *   Export a single function `discrepanciesRepositoryContract(setup)`. The
 *   setup closure returns a per-case `{ repo, todayWindow, weekWindow,
 *   knownTodayId, knownDetailId, missingId, cleanup }` bundle.
 *
 * The contract file is adapter-agnostic by construction: it imports the PORT
 * type and Vitest primitives, and nothing else. No concrete adapter, no SDK,
 * no row shape.
 *
 * Per-case structural mapping to the port JSDoc:
 *   - Case 1 → listToday window + newest-first + limit + RAW reason carry.
 *   - Case 2 → listWeekRollup window + trimmed { reason, productName } shape.
 *   - Case 3 → findDetailById hit (RAW reason carried).
 *   - Case 4 → findDetailById null on miss (define errors out of existence).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DiscrepanciesRepository } from "@/lib/ports";

export interface DiscrepanciesContractSetup {
  repo: DiscrepanciesRepository;
  /** A [from,to] window that contains the seeded discrepancy rows. */
  todayWindow: { from: string; to: string };
  /** A [from,to] window for the week rollup (may equal todayWindow). */
  weekWindow: { from: string; to: string };
  /** A discrepancy id known to fall inside todayWindow with joins resolvable. */
  knownTodayId: string;
  /** A discrepancy id known to be readable via findDetailById. */
  knownDetailId: string;
  /** A well-formed id that no row holds (the null-on-miss case). */
  missingId: string;
  /** The RAW reason value the known row carries (asserts no `.replace`). */
  knownRawReason: string;
  cleanup: () => Promise<void>;
}

export function discrepanciesRepositoryContract(
  setup: () => Promise<DiscrepanciesContractSetup>,
): void {
  describe("DiscrepanciesRepository contract", () => {
    let ctx: DiscrepanciesContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    it("listToday returns rows in the window, newest first, capped at 50", async () => {
      const rows = await ctx.repo.listToday(ctx.todayWindow);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(50);
      // newest-first: createdAt non-increasing.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].createdAt >= rows[i].createdAt).toBe(true);
      }
      // The known row is present.
      const found = rows.find((r) => r.id === ctx.knownTodayId);
      expect(found).toBeDefined();
      if (!found) throw new Error("known today row missing after expect");
      // Shape: the DiscrepancyToday keys are present and well-typed.
      expect(typeof found.id).toBe("string");
      expect(typeof found.createdAt).toBe("string");
      expect(["short", "not_sent"]).toContain(found.status);
      expect(typeof found.reason).toBe("string");
      expect(["number", "object"]).toContain(typeof found.orderedQty); // number | null
      expect(["number", "object"]).toContain(typeof found.sentQty);
      expect(["string", "object"]).toContain(typeof found.customerName); // string | null
      expect(["string", "object"]).toContain(typeof found.productName);
      expect(["string", "object"]).toContain(typeof found.loggedByName);
      // RAW reason carried verbatim (no underscore→space replace at this layer).
      expect(found.reason).toBe(ctx.knownRawReason);
    });

    it("listWeekRollup returns trimmed { reason, productName } rows in the window", async () => {
      const rows = await ctx.repo.listWeekRollup(ctx.weekWindow);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(typeof r.reason).toBe("string");
        expect(["string", "object"]).toContain(typeof r.productName); // string | null
      }
      // RAW reason present (asserts the rollup feed is un-replaced).
      const reasons = rows.map((r) => r.reason);
      expect(reasons).toContain(ctx.knownRawReason);
    });

    it("findDetailById returns the discrepancy with joins resolved + RAW reason", async () => {
      const detail = await ctx.repo.findDetailById(ctx.knownDetailId);
      expect(detail).not.toBeNull();
      if (detail === null) throw new Error("detail was null after expect");
      expect(detail.id).toBe(ctx.knownDetailId);
      expect(typeof detail.createdAt).toBe("string");
      expect(["short", "not_sent"]).toContain(detail.status);
      expect(typeof detail.reason).toBe("string");
      // RAW reason — no `.replace` at the adapter boundary.
      expect(detail.reason).toBe(ctx.knownRawReason);
      expect(["number", "object"]).toContain(typeof detail.orderedQty);
      expect(["number", "object"]).toContain(typeof detail.sentQty);
      expect(["string", "object"]).toContain(typeof detail.unit);
      expect(["string", "object"]).toContain(typeof detail.note);
      expect(["string", "object"]).toContain(typeof detail.customerId);
      expect(["string", "object"]).toContain(typeof detail.customerName);
      expect(["string", "object"]).toContain(typeof detail.productId);
      expect(["string", "object"]).toContain(typeof detail.productName);
      expect(["string", "object"]).toContain(typeof detail.productCategory);
      expect(["string", "object"]).toContain(typeof detail.loggedByName);
    });

    it("findDetailById returns null on miss (does NOT throw)", async () => {
      const detail = await ctx.repo.findDetailById(ctx.missingId);
      expect(detail).toBeNull();
    });
  });
}
