/**
 * tests/unit/adapters/bcrypt/PasswordHasher.test.ts
 *
 * F-10 — battle-tests the bcrypt PasswordHasher adapter on the bench before
 * it is bolted into the four auth/admin routes: hash round-trip, wrong
 * plaintext, TOTAL compare on garbage/empty hashes (returns false, never
 * throws), non-string casting on both args, the cost-factor-12 pin, and the
 * headline cross-cost proof (a cost-10 hash still verifies — existing stored
 * credentials keep working). No DB. No network.
 *
 * Modelled on tests/unit/adapters/web-crypto/SessionTokens.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createBcryptPasswordHasher } from "@/lib/adapters/bcrypt";

const hasher = createBcryptPasswordHasher();

describe("createBcryptPasswordHasher", () => {
  it("round-trips: hash(p) then compare(p, h) is true", async () => {
    const h = await hasher.hash("right-credential");
    expect(await hasher.compare("right-credential", h)).toBe(true);
  });

  it("returns false for the wrong plaintext", async () => {
    const h = await hasher.hash("right-credential");
    expect(await hasher.compare("wrong-credential", h)).toBe(false);
  });

  it("returns false (never throws) on a garbage stored hash", async () => {
    await expect(
      hasher.compare("x", "not-a-bcrypt-hash"),
    ).resolves.toBe(false);
  });

  it("returns false (never throws) on an empty stored hash", async () => {
    await expect(hasher.compare("x", "")).resolves.toBe(false);
  });

  it("casts a non-string plaintext (no 'Illegal arguments' throw)", async () => {
    const known = await hasher.hash("1234");
    // A number plaintext must not throw and must match when String(n) was
    // the original plaintext.
    await expect(
      hasher.compare(1234 as unknown as string, known),
    ).resolves.toBe(true);
  });

  it("casts a non-string input to hash() and round-trips it", async () => {
    const h = await hasher.hash(5678 as unknown as string);
    expect(typeof h).toBe("string");
    expect(await hasher.compare("5678", h)).toBe(true);
  });

  it("hashes at cost factor 12", async () => {
    const h = await hasher.hash("cost-check");
    // bcrypt format: $2<variant>$<cost>$<22-char-salt><31-char-hash>
    expect(h).toMatch(/^\$2[aby]\$12\$/);
  });

  it("verifies a hash made at cost 10 (cross-cost compatibility)", async () => {
    // Plant a hash at cost 10 with raw bcryptjs — exactly what the
    // integration fixtures (_globalSetup, kds.test) do. It must still verify
    // through the adapter: no re-hash, no cost lock-in.
    const cost10 = await bcrypt.hash("legacy-pin", 10);
    expect(cost10).toMatch(/^\$2[aby]\$10\$/);
    expect(await hasher.compare("legacy-pin", cost10)).toBe(true);
    expect(await hasher.compare("wrong", cost10)).toBe(false);
  });

  it("logs (does not throw) when an input's String() conversion itself throws", async () => {
    // A garbage hash STRING does not reach the catch — bcryptjs just returns
    // false for it (see the "garbage stored hash" case above), so there is
    // nothing to log. The ONLY input that reaches the adapter's catch is one
    // whose String() conversion itself throws — e.g. an object with a throwing
    // toString(). That is what actually exercises the TOTAL guard + log.
    const throwingHash = {
      toString() {
        throw new Error("boom");
      },
    } as unknown as string;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await hasher.compare("x", throwingHash);
    expect(result).toBe(false); // TOTAL — never propagates the throw
    expect(spy).toHaveBeenCalled(); // logged internally
    spy.mockRestore();
  });
});
