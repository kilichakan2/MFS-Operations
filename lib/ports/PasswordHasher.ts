/**
 * lib/ports/PasswordHasher.ts
 *
 * The PasswordHasher port — scramble a credential for storage and check a
 * credential against a stored hash (F-10).
 *
 * Written in business language (credentials), not crypto language, so the
 * hashing technology can be swapped later (e.g. argon2 / scrypt) by writing
 * one new adapter + changing one line in `lib/wiring/password.ts` — the
 * CLAUDE.md rip-out contract.
 *
 * Despite the name `PasswordHasher`, this also hashes PINs — the name is kept
 * to match the roadmap. Both passwords and PINs flow through `hash`/`compare`
 * identically.
 *
 * Pure TypeScript: no vendor import, no framework import. Primitives only.
 */

export interface PasswordHasher {
  /**
   * Scramble a new credential (password OR PIN) for storage.
   * Caller passes the plaintext; gets back the storable hash.
   * @throws only on a genuine internal hashing failure (surfaces a 500).
   */
  hash(plain: string): Promise<string>;

  /**
   * TOTAL — never throws. Returns true iff `plain` matches the stored `hash`.
   * A malformed/garbage stored hash yields `false` (logged internally),
   * never an exception. Cost-factor agnostic: verifies hashes made at any
   * cost factor (existing stored credentials keep working).
   */
  compare(plain: string, hash: string): Promise<boolean>;
}
