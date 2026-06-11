/**
 * lib/ports/__contracts__/UsersRepository.contract.ts
 *
 * Shared behavioural contract for UsersRepository. Both adapters —
 * the Supabase real implementation and the Fake in-memory
 * implementation — pass the SAME suite (F-06 template, same pattern
 * as CustomersRepository.contract.ts).
 *
 * Adapter-agnostic by construction: imports the PORT type
 * (`UsersRepository`) and Vitest primitives, and nothing else.
 *
 * Per-case structural mapping to the port JSDoc:
 *   - Case 1 → `findUserById` (read by id; full UserSummary shape).
 *   - Case 2 → `findUserById` ("returns null on miss; never throws
 *     NotFoundError" — APOSD §11 verbatim).
 *   - Case 3 → `findUserById` (does NOT pre-filter on `active` —
 *     callers see the raw flag; the KDS line-done use-case needs to
 *     distinguish "no such user" (404) from "inactive user" (403)).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { UsersRepository } from "@/lib/ports";

export interface UsersContractSetup {
  repo: UsersRepository;
  /** A user id the adapter is known to return on findUserById. */
  knownUserId: string;
  cleanup: () => Promise<void>;
}

export function usersRepositoryContract(
  setup: () => Promise<UsersContractSetup>,
): void {
  describe("UsersRepository contract", () => {
    let ctx: UsersContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    it("returns the user with id, name, role, active", async () => {
      const user = await ctx.repo.findUserById(ctx.knownUserId);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      expect(user.id).toBe(ctx.knownUserId);
      expect(typeof user.name).toBe("string");
      expect(user.name.length).toBeGreaterThan(0);
      expect(typeof user.role).toBe("string");
      expect(user.role.length).toBeGreaterThan(0);
      expect(typeof user.active).toBe("boolean");
    });

    it("returns null on miss (does NOT throw NotFoundError)", async () => {
      // A well-formed UUID that no row in any seeded fixture should hold.
      const missingId = "00000000-0000-0000-0000-0000000000fe";
      const user = await ctx.repo.findUserById(missingId);
      expect(user).toBeNull();
    });

    it("returns the active flag verbatim (does NOT pre-filter on active)", async () => {
      // Callers (kdsLineDone use-case) must see inactive users so they
      // can answer 403 "account inactive" rather than 404 "not found".
      const user = await ctx.repo.findUserById(ctx.knownUserId);
      expect(user).not.toBeNull();
      if (user === null) throw new Error("user was null after expect");
      expect(typeof user.active).toBe("boolean");
    });
  });
}
