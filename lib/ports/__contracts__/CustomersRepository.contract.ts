/**
 * lib/ports/__contracts__/CustomersRepository.contract.ts
 *
 * Shared behavioural contract for CustomersRepository. Both adapters —
 * the Supabase real implementation and the Fake in-memory
 * implementation — pass the SAME suite.
 *
 * Pattern (locked at F-06 Gate 1 — template for every future
 * port-extraction unit):
 *   Export a single function `customersRepositoryContract(setup)`. The
 *   setup closure returns a per-case `{ repo, knownCustomerId, cleanup }`
 *   bundle. The suite declares a top-level describe block with
 *   beforeEach() invoking setup() and afterEach() invoking cleanup().
 *
 * The contract file is adapter-agnostic by construction: it imports the
 * PORT type (`CustomersRepository`) and Vitest primitives, and nothing
 * else. No concrete adapter, no SDK, no row shape.
 *
 * Per-case structural mapping to the port JSDoc:
 *   - Case 1 → `findCustomerById` lines 29-44 (read by id + null on miss).
 *   - Case 2 → `findCustomerById` line 43 ("returns null on miss; never
 *     throws NotFoundError" — APOSD principle 11 verbatim).
 *   - Case 3 → `findCustomerById` lines 36-42 ("does not pre-filter on
 *     active" — callers see the raw flag).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { CustomersRepository } from "@/lib/ports";

export interface CustomersContractSetup {
  repo: CustomersRepository;
  /** A customer id the adapter is known to return on findCustomerById. */
  knownCustomerId: string;
  /**
   * F-20 PR1 — a customer id that is known to be UNGEOCODED at setup time:
   * has a non-null postcode but null lat/lng, so it appears in
   * listUngeocoded() and can have setCoords() / setPostcodeAndCoords() /
   * setActive() applied to it. May be the same row as `knownCustomerId` as
   * long as the wrapper guarantees it starts ungeocoded for each case.
   */
  ungeocodedCustomerId: string;
  cleanup: () => Promise<void>;
}

export function customersRepositoryContract(
  setup: () => Promise<CustomersContractSetup>,
): void {
  describe("CustomersRepository contract", () => {
    let ctx: CustomersContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    it("returns the customer with id, name, postcode, active", async () => {
      const customer = await ctx.repo.findCustomerById(ctx.knownCustomerId);
      expect(customer).not.toBeNull();
      // Type-narrow for the rest of the asserts.
      if (customer === null) throw new Error("customer was null after expect");
      expect(customer.id).toBe(ctx.knownCustomerId);
      expect(typeof customer.name).toBe("string");
      expect(customer.name.length).toBeGreaterThan(0);
      // `postcode` is `string | null` in the domain; both shapes pass.
      expect(["string", "object"]).toContain(typeof customer.postcode);
      expect(typeof customer.active).toBe("boolean");
    });

    it("returns null on miss (does NOT throw NotFoundError)", async () => {
      // A well-formed UUID that no row in any seeded fixture should hold.
      const missingId = "00000000-0000-0000-0000-0000000000ff";
      const customer = await ctx.repo.findCustomerById(missingId);
      expect(customer).toBeNull();
    });

    it("returns the active flag verbatim (does NOT pre-filter on active)", async () => {
      // The port JSDoc at CustomersRepository.ts:36-42 says callers
      // see the raw `active` flag. The contract asserts the field is
      // present and is a boolean — the wrapper's seed determines its
      // value. The point: the adapter does not silently filter out
      // inactive customers.
      const customer = await ctx.repo.findCustomerById(ctx.knownCustomerId);
      expect(customer).not.toBeNull();
      if (customer === null) throw new Error("customer was null after expect");
      expect(typeof customer.active).toBe("boolean");
    });

    // ── F-20 PR1 admin surface ────────────────────────────────────────────────

    it("listAllCustomers returns CustomerAdminView rows ordered by name asc", async () => {
      const rows = await ctx.repo.listAllCustomers();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      // Shape: every row carries the admin-view fields.
      for (const r of rows) {
        expect(typeof r.id).toBe("string");
        expect(typeof r.name).toBe("string");
        expect(["string", "object"]).toContain(typeof r.postcode); // string | null
        expect(typeof r.active).toBe("boolean");
        expect(typeof r.created_at).toBe("string");
      }
      // Ordering: names are non-decreasing.
      const names = rows.map((r) => r.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it("listUngeocoded returns rows with a postcode but null coords", async () => {
      const rows = await ctx.repo.listUngeocoded(500);
      expect(Array.isArray(rows)).toBe(true);
      // Our seeded ungeocoded customer must be among them.
      const found = rows.find((r) => r.id === ctx.ungeocodedCustomerId);
      expect(found).toBeDefined();
      for (const r of rows) {
        expect(r.postcode).not.toBeNull();
        expect(r.lat).toBeNull();
        expect(r.lng).toBeNull();
      }
    });

    it("setActive flips the flag and returns the updated row", async () => {
      const updated = await ctx.repo.setActive(ctx.ungeocodedCustomerId, false);
      expect(updated).not.toBeNull();
      if (updated === null) throw new Error("row was null after setActive");
      expect(updated.id).toBe(ctx.ungeocodedCustomerId);
      expect(updated.active).toBe(false);
    });

    it("setActive returns null when no row matches the id", async () => {
      const missingId = "00000000-0000-0000-0000-0000000000fe";
      const updated = await ctx.repo.setActive(missingId, true);
      expect(updated).toBeNull();
    });

    it("setPostcodeAndCoords persists postcode + coords and returns the row", async () => {
      const updated = await ctx.repo.setPostcodeAndCoords(
        ctx.ungeocodedCustomerId,
        {
          postcode: "S3 8DG",
          lat: 53.38,
          lng: -1.47,
          geocoded_at: "2026-06-26T00:00:00.000Z",
          is_approximate_location: false,
        },
      );
      expect(updated).not.toBeNull();
      if (updated === null) throw new Error("row was null after update");
      expect(updated.id).toBe(ctx.ungeocodedCustomerId);
      expect(updated.postcode).toBe("S3 8DG");
      expect(updated.lat).toBe(53.38);
      expect(updated.lng).toBe(-1.47);
    });

    it("setCoords stamps coordinates onto one customer (void)", async () => {
      await expect(
        ctx.repo.setCoords(ctx.ungeocodedCustomerId, {
          lat: 51.5,
          lng: -0.12,
          geocoded_at: "2026-06-26T00:00:00.000Z",
          is_approximate_location: true,
        }),
      ).resolves.toBeUndefined();
    });
  });
}
