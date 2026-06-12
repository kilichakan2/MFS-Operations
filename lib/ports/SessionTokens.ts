/**
 * lib/ports/SessionTokens.ts
 *
 * The SessionTokens port — seal and check session cookies (T1).
 *
 * Written in business language (sessions), not crypto language, so the
 * sealing technology can be swapped later (e.g. encrypted JWTs) by
 * writing one new adapter + changing one line in
 * `lib/wiring/session.ts` — the CLAUDE.md rip-out contract.
 *
 * ADR-0002 depth rule honoured: `verify` hides base64url decoding,
 * structural parsing, constant-time signature comparison, JSON parsing
 * and the claim-shape check. It defines errors out of existence —
 * `null` is the one failure shape, exactly what the middleware needs
 * (a bad badge is treated like no badge at all).
 */

import type { SessionClaims } from "@/lib/domain";

export interface SessionTokens {
  /**
   * Seal claims into a cookie-safe token.
   *
   * @returns `base64url(claimsJson) + "." + base64url(signature)` —
   *   only `[A-Za-z0-9_-.]`, safe in a Set-Cookie header unencoded.
   * @throws  If the signing secret is unavailable (fail closed —
   *   never issue an unsealed session).
   */
  issue(claims: SessionClaims): Promise<string>;

  /**
   * Open and check a token.
   *
   * @returns The claims, or `null` on ANY failure: bad signature,
   *   tampered payload, legacy unsigned JSON cookie, malformed input,
   *   missing secret. Never throws.
   */
  verify(token: string | null | undefined): Promise<SessionClaims | null>;
}
