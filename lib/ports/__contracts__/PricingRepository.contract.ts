/**
 * lib/ports/__contracts__/PricingRepository.contract.ts
 *
 * Shared behavioural contract for PricingRepository (F-15). Both adapters
 * — the Supabase real implementation and the Fake in-memory twin — pass
 * the SAME suite (F-06 template). The Fake can never quietly drift from
 * the real database's behaviour because they sit the same exam.
 *
 * Adapter-agnostic by construction: imports the PORT type
 * (`PricingRepository`), domain types, and Vitest primitives — nothing else.
 *
 * The dangerous-to-get-wrong mappings this suite pins (per the plan's risk
 * section), proving BOTH adapters answer identically:
 *   - `isExpired` (computed, never stored): active + past valid_until = true;
 *     draft + past = false; active + null valid_until = false.
 *   - the `customerName` / `productName` `?? prospect/override ?? 'Unknown'`
 *     fallbacks, and `isProspect` / `isFreetext`.
 *   - the customer_or_prospect XOR (flag #1): create throws if neither.
 *   - the product_or_override + price > 0 CHECKs on addLine.
 *   - replaceLines atomic semantics (flag #2): full swap; empty allowed.
 *
 * Setup contract (each adapter's test file supplies this):
 *   - `repo`         — the adapter under test.
 *   - `agreedBy`     — a user id valid as price_agreements.agreed_by (FK).
 *   - `customerId`   — a customer id valid as price_agreements.customer_id (FK).
 *   - `productId`    — a product id valid as price_agreement_lines.product_id
 *                      (FK); the suite reads its display name back.
 *   - `productName`  — the display name the productId resolves to.
 *   - `cleanup()`    — deletes every agreement this case created (cascades lines).
 *
 * Each case builds its OWN agreements via `repo.createAgreement(...)` so the
 * suite never depends on pre-seeded fixtures, and registers them for cleanup.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { PricingRepository } from "@/lib/ports";
import type { CreateAgreementInput, CreateLineInput } from "@/lib/domain";
import { londonToday } from "@/lib/dates";

export interface PricingContractSetup {
  repo: PricingRepository;
  /** A user id valid as price_agreements.agreed_by (FK-satisfying). */
  agreedBy: string;
  /** A customer id valid as price_agreements.customer_id (FK-satisfying). */
  customerId: string;
  /** A product id valid as price_agreement_lines.product_id (FK-satisfying). */
  productId: string;
  /** The display name `productId` resolves to (for the join assertion). */
  productName: string;
  /** Remove every agreement this contract run created (lines cascade). */
  cleanup: () => Promise<void>;
}

export function pricingRepositoryContract(
  setup: () => Promise<PricingContractSetup>,
): void {
  describe("PricingRepository contract", () => {
    let ctx: PricingContractSetup;

    // Helpers bound to the current ctx ────────────────────────────

    function line(over: Partial<CreateLineInput> = {}): CreateLineInput {
      return {
        productId: ctx.productId,
        productNameOverride: null,
        price: 9.5,
        unit: "per_kg",
        notes: null,
        position: null,
        ...over,
      };
    }

    function agreementInput(
      over: Partial<CreateAgreementInput> = {},
    ): CreateAgreementInput {
      return {
        customerId: ctx.customerId,
        prospectName: null,
        agreedBy: ctx.agreedBy,
        validFrom: "2026-06-01",
        validUntil: "2026-12-31",
        notes: null,
        lines: [line()],
        ...over,
      };
    }

    async function create(over: Partial<CreateAgreementInput> = {}) {
      return ctx.repo.createAgreement(agreementInput(over));
    }

    afterEach(async () => {
      await ctx.cleanup();
    });

    // ─── createAgreement + getAgreementById ─────────────────────

    it("createAgreement persists the header + lines, read back position-sorted with joins", async () => {
      ctx = await setup();
      const created = await create({
        notes: "ANVIL-TEST-create",
        // supply lines out of order to prove the read sorts them
        lines: [
          line({ position: 2, price: 12 }),
          line({ position: 1, price: 8 }),
        ],
      });
      expect(created.id).toBeTruthy();
      expect(created.referenceNumber).toBeTruthy();

      const full = await ctx.repo.getAgreementById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("agreement was null after expect");
      expect(full.id).toBe(created.id);
      expect(full.status).toBe("draft"); // create literal
      expect(full.agreedBy).toBe(ctx.agreedBy);
      expect(full.customerId).toBe(ctx.customerId);
      expect(full.isProspect).toBe(false);
      // customerName resolves via the customer join (not prospect/Unknown)
      expect(full.customerName).not.toBe("Unknown");
      // rep join resolves
      expect(full.repId).toBe(ctx.agreedBy);
      expect(full.repName).not.toBe("Unknown");
      // lines sorted ascending by position
      expect(full.lines.map((l) => l.position)).toEqual([1, 2]);
      // product join resolves the display name
      expect(full.lines[0].productId).toBe(ctx.productId);
      expect(full.lines[0].productName).toBe(ctx.productName);
      expect(full.lines[0].isFreetext).toBe(false);
      // numeric coercion: price is a number
      expect(typeof full.lines[0].price).toBe("number");
      expect(full.lines[0].price).toBe(8);
    });

    it("getAgreementById returns null on miss (does NOT throw)", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fe";
      const full = await ctx.repo.getAgreementById(missing);
      expect(full).toBeNull();
    });

    // ─── customer_or_prospect XOR (flag #1) ─────────────────────

    it("createAgreement with a prospect (no customer) resolves customerName to the prospect name", async () => {
      ctx = await setup();
      const created = await create({
        customerId: null,
        prospectName: "ANVIL-TEST-prospect",
        lines: [],
      });
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("agreement was null after expect");
      expect(full.customerId).toBeNull();
      expect(full.isProspect).toBe(true);
      expect(full.customerName).toBe("ANVIL-TEST-prospect");
    });

    it("createAgreement throws when neither customer nor prospect is supplied (CHECK customer_or_prospect)", async () => {
      ctx = await setup();
      await expect(
        ctx.repo.createAgreement(
          agreementInput({
            customerId: null,
            prospectName: null,
            lines: [],
          }),
        ),
      ).rejects.toBeTruthy();
    });

    // ─── is_expired (computed, never stored) ────────────────────

    it("isExpired is true for an active agreement past valid_until", async () => {
      ctx = await setup();
      const yesterday = "2000-01-01"; // safely in the past vs londonToday()
      const created = await create({ validUntil: yesterday, lines: [] });
      await ctx.repo.updateAgreement(created.id, { status: "active" });
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.status).toBe("active");
      expect(full?.isExpired).toBe(true);
    });

    it("isExpired is false for a draft agreement past valid_until", async () => {
      ctx = await setup();
      const created = await create({ validUntil: "2000-01-01", lines: [] });
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.status).toBe("draft");
      expect(full?.isExpired).toBe(false);
    });

    it("isExpired is false for an active agreement with no valid_until", async () => {
      ctx = await setup();
      const created = await create({ validUntil: null, lines: [] });
      await ctx.repo.updateAgreement(created.id, { status: "active" });
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.status).toBe("active");
      expect(full?.isExpired).toBe(false);
    });

    it("isExpired is false for an active agreement whose valid_until is today (not past)", async () => {
      ctx = await setup();
      const today = londonToday();
      const created = await create({ validUntil: today, lines: [] });
      await ctx.repo.updateAgreement(created.id, { status: "active" });
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.isExpired).toBe(false);
    });

    // ─── listAgreements ─────────────────────────────────────────

    it("listAgreements returns the created agreements with computed isExpired", async () => {
      ctx = await setup();
      // One active+past (expired) and one draft+past (not expired) so the
      // computed flag is asserted per row regardless of list order. The two
      // headers can share a created_at instant, so the suite does NOT assert
      // a tie-break order (unspecified by both adapters); it asserts
      // membership + the per-row computed flag.
      const expired = await create({
        notes: "ANVIL-TEST-list-expired",
        validUntil: "2000-01-01",
        lines: [],
      });
      await ctx.repo.updateAgreement(expired.id, { status: "active" });
      const draft = await create({
        notes: "ANVIL-TEST-list-draft",
        validUntil: "2000-01-01",
        lines: [],
      });

      const all = await ctx.repo.listAgreements({});
      const byId = new Map(all.map((x) => [x.id, x]));
      expect(byId.has(expired.id)).toBe(true);
      expect(byId.has(draft.id)).toBe(true);
      // active + past valid_until → expired; draft + past → not expired
      expect(byId.get(expired.id)?.isExpired).toBe(true);
      expect(byId.get(draft.id)?.isExpired).toBe(false);
      // every row carries the computed flag (boolean, never undefined)
      for (const row of all) {
        expect(typeof row.isExpired).toBe("boolean");
      }
    });

    // ─── addLine ────────────────────────────────────────────────

    it("addLine appends with next position = max + 1 and resolves the product join", async () => {
      ctx = await setup();
      const created = await create({
        lines: [line({ position: 0 }), line({ position: 1 })],
      });
      const added = await ctx.repo.addLine(created.id, line({ position: null }));
      expect(added.position).toBe(2); // max(0,1)+1
      expect(added.productId).toBe(ctx.productId);
      expect(added.productName).toBe(ctx.productName);
      expect(added.isFreetext).toBe(false);

      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.lines.map((l) => l.position)).toEqual([0, 1, 2]);
    });

    it("addLine with a free-text override (no product) sets isFreetext and falls back to the override name", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      const added = await ctx.repo.addLine(
        created.id,
        line({ productId: null, productNameOverride: "ANVIL-TEST-freetext" }),
      );
      expect(added.isFreetext).toBe(true);
      expect(added.productName).toBe("ANVIL-TEST-freetext");
      expect(added.position).toBe(0); // first line on an empty agreement
    });

    it("addLine rejects price <= 0 (CHECK price > 0)", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      await expect(
        ctx.repo.addLine(created.id, line({ price: 0 })),
      ).rejects.toBeTruthy();
    });

    it("addLine rejects a line with neither product nor override (CHECK product_or_override)", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      await expect(
        ctx.repo.addLine(
          created.id,
          line({ productId: null, productNameOverride: null }),
        ),
      ).rejects.toBeTruthy();
    });

    // ─── updateLine / deleteLine ────────────────────────────────

    it("updateLine patches supplied fields and returns the resolved line", async () => {
      ctx = await setup();
      const created = await create({ lines: [line({ position: 0 })] });
      const full = await ctx.repo.getAgreementById(created.id);
      const lineId = full!.lines[0].id;

      const updated = await ctx.repo.updateLine(lineId, {
        price: 21.25,
        unit: "per_box",
        notes: "ANVIL-TEST-note",
      });
      expect(updated).not.toBeNull();
      expect(updated?.price).toBe(21.25);
      expect(updated?.unit).toBe("per_box");
      expect(updated?.notes).toBe("ANVIL-TEST-note");
    });

    it("updateLine returns null on a missing id", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fd";
      const res = await ctx.repo.updateLine(missing, { price: 5 });
      expect(res).toBeNull();
    });

    // Patch the line fields whose camelCase ≠ snake_case spelling
    // (productId→product_id, productNameOverride→product_name_override): flip
    // a product-linked line to a free-text override. If an adapter forwards
    // the camelCase patch unmapped, the wrong column names go over the wire
    // and the read does NOT reflect the change. Locks the line mapping.
    it("updateLine persists differently-spelled fields (productId→override)", async () => {
      ctx = await setup();
      const created = await create({ lines: [line({ position: 0 })] });
      const full = await ctx.repo.getAgreementById(created.id);
      const lineId = full!.lines[0].id;

      const updated = await ctx.repo.updateLine(lineId, {
        productId: null,
        productNameOverride: "ANVIL-TEST-line-freetext",
      });
      expect(updated).not.toBeNull();
      expect(updated?.productId).toBeNull();
      expect(updated?.productNameOverride).toBe("ANVIL-TEST-line-freetext");
      expect(updated?.isFreetext).toBe(true);
      // product join no longer resolves → name falls back to the override
      expect(updated?.productName).toBe("ANVIL-TEST-line-freetext");
    });

    it("deleteLine removes only that line", async () => {
      ctx = await setup();
      const created = await create({
        lines: [line({ position: 0 }), line({ position: 1 })],
      });
      const full = await ctx.repo.getAgreementById(created.id);
      const firstId = full!.lines[0].id;
      await ctx.repo.deleteLine(firstId);
      const after = await ctx.repo.getAgreementById(created.id);
      expect(after?.lines.map((l) => l.id)).not.toContain(firstId);
      expect(after?.lines.length).toBe(1);
    });

    // ─── replaceLines (RPC — flag #2) ───────────────────────────

    it("replaceLines swaps the whole set atomically and returns the count", async () => {
      ctx = await setup();
      const created = await create({
        lines: [line({ position: 0 }), line({ position: 1 }), line({ position: 2 })],
      });
      const count = await ctx.repo.replaceLines(created.id, [
        line({ position: 0, price: 1.5 }),
        line({ position: 1, price: 2.5 }),
      ]);
      expect(count).toBe(2);

      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.lines.map((l) => l.position)).toEqual([0, 1]);
      expect(full?.lines.map((l) => l.price)).toEqual([1.5, 2.5]);
    });

    it("replaceLines with an empty array clears all lines (empty is valid)", async () => {
      ctx = await setup();
      const created = await create({
        lines: [line({ position: 0 }), line({ position: 1 })],
      });
      const count = await ctx.repo.replaceLines(created.id, []);
      expect(count).toBe(0);
      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.lines.length).toBe(0);
    });

    // ─── updateAgreement ────────────────────────────────────────

    it("updateAgreement patches the header and returns the trimmed echo", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      const echo = await ctx.repo.updateAgreement(created.id, {
        status: "active",
        notes: "ANVIL-TEST-patched",
      });
      expect(echo).not.toBeNull();
      expect(echo?.id).toBe(created.id);
      expect(echo?.referenceNumber).toBe(created.referenceNumber);
      expect(echo?.status).toBe("active");
      expect(typeof echo?.updatedAt).toBe("string");

      const full = await ctx.repo.getAgreementById(created.id);
      expect(full?.status).toBe("active");
      expect(full?.notes).toBe("ANVIL-TEST-patched");
    });

    it("updateAgreement returns null on a missing id", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fc";
      const echo = await ctx.repo.updateAgreement(missing, { status: "active" });
      expect(echo).toBeNull();
    });

    // Patch the header fields whose camelCase ≠ snake_case spelling
    // (validFrom→valid_from, validUntil→valid_until, customerId→customer_id,
    // prospectName→prospect_name). If an adapter forwards the camelCase patch
    // straight to the vendor, the wrong column names go over the wire and the
    // read does NOT reflect the change. Both adapters must land the new
    // values — this locks the snake_case mapping in the adapter boundary.
    it("updateAgreement persists differently-spelled header fields", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      const echo = await ctx.repo.updateAgreement(created.id, {
        validFrom: "2027-01-02",
        validUntil: "2027-03-04",
        customerId: null,
        prospectName: "ANVIL-TEST-becomes-prospect",
      });
      expect(echo).not.toBeNull();

      const full = await ctx.repo.getAgreementById(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("agreement was null after expect");
      expect(full.validFrom).toBe("2027-01-02");
      expect(full.validUntil).toBe("2027-03-04");
      expect(full.customerId).toBeNull();
      expect(full.prospectName).toBe("ANVIL-TEST-becomes-prospect");
      expect(full.isProspect).toBe(true);
      expect(full.customerName).toBe("ANVIL-TEST-becomes-prospect");
    });

    // ─── deleteAgreement + owners ───────────────────────────────

    it("deleteAgreement removes the agreement and cascades its lines", async () => {
      ctx = await setup();
      const created = await create({ lines: [line({ position: 0 })] });
      const full = await ctx.repo.getAgreementById(created.id);
      const lineId = full!.lines[0].id;

      await ctx.repo.deleteAgreement(created.id);
      expect(await ctx.repo.getAgreementById(created.id)).toBeNull();
      // line cascaded → its owner walk now misses
      expect(await ctx.repo.getLineOwner(lineId)).toBeNull();
    });

    it("deleteAgreement on a missing id is not an error (idempotent)", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000fb";
      await expect(
        ctx.repo.deleteAgreement(missing),
      ).resolves.toBeUndefined();
    });

    it("getAgreementOwner returns agreedBy + status; null on miss", async () => {
      ctx = await setup();
      const created = await create({ lines: [] });
      const owner = await ctx.repo.getAgreementOwner(created.id);
      expect(owner).not.toBeNull();
      expect(owner?.agreedBy).toBe(ctx.agreedBy);
      expect(owner?.status).toBe("draft");

      const missing = "00000000-0000-0000-0000-0000000000fa";
      expect(await ctx.repo.getAgreementOwner(missing)).toBeNull();
    });

    it("getLineOwner walks line → agreement.agreed_by; null on miss", async () => {
      ctx = await setup();
      const created = await create({ lines: [line({ position: 0 })] });
      const full = await ctx.repo.getAgreementById(created.id);
      const lineId = full!.lines[0].id;
      const owner = await ctx.repo.getLineOwner(lineId);
      expect(owner?.agreedBy).toBe(ctx.agreedBy);

      const missing = "00000000-0000-0000-0000-0000000000f9";
      expect(await ctx.repo.getLineOwner(missing)).toBeNull();
    });

    // ─── getAgreementForEmail (flag #3) ─────────────────────────

    it("getAgreementForEmail returns the full aggregate (header + lines + joins)", async () => {
      ctx = await setup();
      const created = await create({ lines: [line({ position: 0 })] });
      const full = await ctx.repo.getAgreementForEmail(created.id);
      expect(full).not.toBeNull();
      if (full === null) throw new Error("agreement was null after expect");
      expect(full.id).toBe(created.id);
      expect(full.referenceNumber).toBe(created.referenceNumber);
      expect(full.lines.length).toBe(1);
      expect(full.lines[0].productName).toBe(ctx.productName);
    });

    it("getAgreementForEmail returns null on a missing id", async () => {
      ctx = await setup();
      const missing = "00000000-0000-0000-0000-0000000000f8";
      expect(await ctx.repo.getAgreementForEmail(missing)).toBeNull();
    });
  });
}
