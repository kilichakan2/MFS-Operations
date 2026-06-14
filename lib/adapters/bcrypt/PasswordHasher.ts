/**
 * lib/adapters/bcrypt/PasswordHasher.ts
 *
 * The bcrypt adapter for the PasswordHasher port (F-10). The ONLY file in the
 * app allowed to import `bcryptjs` (enforced by the no-restricted-imports lint
 * rule in `.eslintrc.json`).
 *
 * It owns two chores the four auth/admin routes used to repeat inline:
 *   1. String() casting of inputs — bcryptjs throws "Illegal arguments:
 *      number, string" if a non-string slips in.
 *   2. The try/catch around compare — a malformed stored hash makes bcryptjs
 *      throw; the port contract says compare is TOTAL, so we swallow it,
 *      log internally, and return false (treat a broken hash like a wrong
 *      credential).
 *
 * Cost factor 12 — unchanged from the inline value the four routes used.
 * `compare` is cost-agnostic (the cost is encoded in the stored hash), so it
 * verifies existing credentials regardless of the cost they were made at.
 *
 * Factory shape mirrors createWebCryptoSessionTokens for house-style
 * consistency, but takes no deps argument — bcrypt needs no secret/env.
 */
import bcrypt from "bcryptjs";
import type { PasswordHasher } from "@/lib/ports";

const COST_FACTOR = 12; // unchanged from the four routes' inline value

export function createBcryptPasswordHasher(): PasswordHasher {
  return {
    async hash(plain: string): Promise<string> {
      // Adapter OWNS the String() cast the routes used to do — prevents
      // bcryptjs "Illegal arguments: number, string" if a non-string slips in.
      return bcrypt.hash(String(plain), COST_FACTOR);
    },

    async compare(plain: string, hash: string): Promise<boolean> {
      try {
        return await bcrypt.compare(String(plain), String(hash));
      } catch (err) {
        // Preserve today's route-level console.error, now inside the adapter.
        console.error("[bcrypt] compare threw on malformed hash:", err);
        return false; // TOTAL — never propagate the throw.
      }
    },
  };
}
