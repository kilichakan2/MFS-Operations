/**
 * lib/wiring/session.ts — composition root for the Session domain (T1)
 *
 * The ONE file where the SessionTokens port is bolted to its concrete
 * adapter (same F-TD-11 rule as `lib/wiring/orders.ts`: only
 * composition roots import from `@/lib/adapters/*`).
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the sealing
 * technology (e.g. to encrypted JWTs) = one new adapter folder
 * (`lib/adapters/<vendor>/`) + edits to THIS file. Middleware, routes
 * and tests never change.
 *
 * This file is a parts list, not logic. `getSecret` is lazy — the env
 * var is read per call, never at import, so Edge bundling order can
 * never freeze a missing secret in place.
 */
import { createWebCryptoSessionTokens } from "@/lib/adapters/web-crypto";
import type { SessionTokens } from "@/lib/ports";

export const sessionTokens: SessionTokens = createWebCryptoSessionTokens({
  getSecret: () => process.env.SESSION_SECRET,
});
