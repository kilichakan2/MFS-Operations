/**
 * lib/adapters/bcrypt/index.ts
 *
 * Barrel re-export for the bcrypt adapter package. Import surface:
 *   import { createBcryptPasswordHasher } from '@/lib/adapters/bcrypt'
 *
 * Factory only — the ready-to-use singleton lives in
 * `lib/wiring/password.ts` (F-TD-11 rule: adapters/services export
 * factories, composition roots export singletons).
 */

export { createBcryptPasswordHasher } from "./PasswordHasher";
