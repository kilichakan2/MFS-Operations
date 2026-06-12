/**
 * lib/adapters/web-crypto/index.ts
 *
 * Barrel re-export for the Web Crypto adapter package. Import surface:
 *   import { createWebCryptoSessionTokens } from '@/lib/adapters/web-crypto'
 *
 * Factory only — the ready-to-use singleton lives in
 * `lib/wiring/session.ts` (F-TD-11 rule: adapters/services export
 * factories, composition roots export singletons).
 */

export { createWebCryptoSessionTokens } from "./SessionTokens";
