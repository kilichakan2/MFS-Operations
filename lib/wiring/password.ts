/**
 * lib/wiring/password.ts — composition root for the PasswordHasher port (F-10)
 *
 * The ONE business-layer file where the PasswordHasher port is bolted to its
 * concrete bcrypt adapter (same F-TD-11 rule as `lib/wiring/orders.ts` and
 * `lib/wiring/session.ts`: only composition roots import from
 * `@/lib/adapters/*`).
 *
 * Hashing is its own concern — used by both the auth domain (login, kds-pin)
 * and the user-admin domain — so it gets its own composition root rather than
 * being crammed into `session.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the hashing technology
 * (e.g. to argon2 / scrypt) = one new adapter folder (`lib/adapters/<vendor>/`)
 * + one edit to THIS file. Routes, ports and tests never change.
 *
 * This file is a parts list, not logic. bcrypt needs no secret/env, so unlike
 * `session.ts` there is no lazy `getSecret`.
 */
import { createBcryptPasswordHasher } from "@/lib/adapters/bcrypt";
import type { PasswordHasher } from "@/lib/ports";

export const passwordHasher: PasswordHasher = createBcryptPasswordHasher();
