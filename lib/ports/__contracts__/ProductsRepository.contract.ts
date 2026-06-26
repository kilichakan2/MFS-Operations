/**
 * lib/ports/__contracts__/ProductsRepository.contract.ts
 *
 * Shared behavioural contract for ProductsRepository. Both adapters
 * (Supabase + Fake) pass the SAME suite.
 *
 * Pattern matches CustomersRepository.contract.ts (locked at F-06
 * Gate 1). The setup closure yields `{ repo, knownProductId, cleanup }`.
 *
 * Per-case structural mapping to the port JSDoc
 * (lib/ports/ProductsRepository.ts:22-56):
 *   - Case 1 → line 29-30 (empty input short-circuit, returns []).
 *   - Case 2 → line 26-27 (bulk fetch, returns only matched rows).
 *   - Case 3 → line 32-33 (full domain projection — id, code, name,
 *     boxSize).
 *   - Case 4 → line 52-53 (NO guaranteed order — adapter may return
 *     rows in any order; caller computes its own map).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProductsRepository } from "@/lib/ports";

export interface ProductsContractSetup {
  repo: ProductsRepository;
  /** A product id the adapter is known to return on findProductsByIds. */
  knownProductId: string;
  /** F-20 PR3 — a name prefix unique to this run so insertMany/insertOne create
   *  fresh product rows that never collide with other rows/runs. */
  insertNamePrefix: string;
  /** F-20 PR3 — a valid users.id for the insert `created_by` FK. */
  createdBy: string;
  cleanup: () => Promise<void>;
}

export function productsRepositoryContract(
  setup: () => Promise<ProductsContractSetup>,
): void {
  describe("ProductsRepository contract", () => {
    let ctx: ProductsContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    it("returns empty array when ids is empty (no round-trip implied)", async () => {
      const result = await ctx.repo.findProductsByIds([]);
      expect(result).toEqual([]);
    });

    it("returns only the matched rows; ignores unknown ids", async () => {
      const unknownId = "00000000-0000-0000-0000-0000000000fe";
      const result = await ctx.repo.findProductsByIds([
        ctx.knownProductId,
        unknownId,
      ]);
      expect(result.length).toBe(1);
      expect(result[0]!.id).toBe(ctx.knownProductId);
    });

    it("returns full domain shape (id, code, name, boxSize)", async () => {
      const result = await ctx.repo.findProductsByIds([ctx.knownProductId]);
      expect(result.length).toBe(1);
      const product = result[0]!;
      expect(product.id).toBe(ctx.knownProductId);
      expect(typeof product.name).toBe("string");
      expect(product.name.length).toBeGreaterThan(0);
      // code + boxSize are `string | null` in the domain.
      expect(["string", "object"]).toContain(typeof product.code);
      expect(["string", "object"]).toContain(typeof product.boxSize);
    });

    it("does NOT guarantee result order matches caller-passed id order", async () => {
      // Port JSDoc at ProductsRepository.ts:52-53 leaves order
      // unspecified. The contract asserts that callers compute their
      // own map rather than relying on positional alignment. Single-id
      // call here verifies the matched row appears; multi-id ordering
      // is an explicit non-guarantee — the wrapper for Supabase relies
      // on a single seeded product, so we can't assert reorder without
      // seeding two. We assert what we can: a single lookup returns
      // exactly one row, and the row matches the requested id.
      const result = await ctx.repo.findProductsByIds([ctx.knownProductId]);
      expect(result.length).toBe(1);
      expect(result[0]!.id).toBe(ctx.knownProductId);
    });

    // ── F-20 PR2 — the admin surface (listAll + setActive) ───────────────────

    it("listAll returns rows ordered by name asc with the full ProductAdminView shape", async () => {
      const rows = await ctx.repo.listAll();
      expect(rows.length).toBeGreaterThan(0);
      // The known product is present in the list.
      const known = rows.find((r) => r.id === ctx.knownProductId);
      expect(known).toBeDefined();
      // Full admin-view shape: name + active + created_at always populated;
      // category/code/boxSize are `string | null`.
      expect(typeof known!.name).toBe("string");
      expect(known!.name.length).toBeGreaterThan(0);
      expect(typeof known!.active).toBe("boolean");
      expect(typeof known!.created_at).toBe("string");
      expect(["string", "object"]).toContain(typeof known!.category);
      expect(["string", "object"]).toContain(typeof known!.code);
      expect(["string", "object"]).toContain(typeof known!.boxSize);
      // name ASC ordering (each row's name >= the previous one).
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.name >= rows[i - 1]!.name).toBe(true);
      }
    });

    it("setActive flips active and returns the updated row", async () => {
      // Read current state, flip it, assert the returned row reflects the flip,
      // then restore so the suite leaves the row as it found it.
      const before = (await ctx.repo.listAll()).find(
        (r) => r.id === ctx.knownProductId,
      )!;
      const flipped = await ctx.repo.setActive(
        ctx.knownProductId,
        !before.active,
      );
      expect(flipped).not.toBeNull();
      expect(flipped!.id).toBe(ctx.knownProductId);
      expect(flipped!.active).toBe(!before.active);
      // Restore.
      const restored = await ctx.repo.setActive(
        ctx.knownProductId,
        before.active,
      );
      expect(restored!.active).toBe(before.active);
    });

    it("setActive on an unknown id returns null (the 404 anchor — never throws)", async () => {
      const unknownId = "00000000-0000-0000-0000-0000000000fe";
      const result = await ctx.repo.setActive(unknownId, false);
      expect(result).toBeNull();
    });

    // ── F-20 PR3 — import insert ──────────────────────────────────────────────

    it("insertMany inserts rows and returns an id for each", async () => {
      const rows = [
        {
          name: `${ctx.insertNamePrefix}A`,
          category: "Lamb",
          code: "P-A",
          box_size: "10 kg",
          created_by: ctx.createdBy,
        },
        {
          name: `${ctx.insertNamePrefix}B`,
          category: null,
          code: null,
          box_size: null,
          created_by: ctx.createdBy,
        },
      ];
      const created = await ctx.repo.insertMany(rows);
      expect(created.length).toBe(2);
      for (const c of created) {
        expect(typeof c.id).toBe("string");
        expect(c.id.length).toBeGreaterThan(0);
      }
    });

    it("insertOne returns { outcome: 'inserted' } on a fresh name", async () => {
      const result = await ctx.repo.insertOne({
        name: `${ctx.insertNamePrefix}fresh`,
        category: null,
        code: null,
        box_size: null,
        created_by: ctx.createdBy,
      });
      expect(result).toEqual({ outcome: "inserted" });
    });

    it("insertOne returns { outcome: 'duplicate' } on a 23505 (never throws)", async () => {
      const row = {
        name: `${ctx.insertNamePrefix}dup`,
        category: null,
        code: null,
        box_size: null,
        created_by: ctx.createdBy,
      };
      const first = await ctx.repo.insertOne(row);
      expect(first).toEqual({ outcome: "inserted" });
      const second = await ctx.repo.insertOne(row);
      expect(second).toEqual({ outcome: "duplicate" });
    });
  });
}
