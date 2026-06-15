/**
 * lib/adapters/web-crypto/DbTokenMinter.ts
 *
 * Web Crypto implementation of the DbTokenMinter port (F-RLS-03, ADR-0007).
 *
 * Mints a REAL 3-segment HS256 JWT (`header.payload.signature`) so PostgREST
 * accepts it as a Bearer token and exposes its claims at
 * `request.jwt.claims`. This is deliberately the standard JWT compact form —
 * NOT the 2-segment `mfs_session` shape, which PostgREST would reject.
 *
 * Why Web Crypto (`globalThis.crypto.subtle`) and NOT a JWT library:
 *   the project already owns the exact HMAC-SHA256 + base64url primitive in
 *   the sibling SessionTokens adapter. Reusing it here means ZERO new
 *   dependency (ADR-0007 §Decision: no jsonwebtoken/jose). The helpers below
 *   are copied verbatim from SessionTokens.ts to keep that adapter untouched;
 *   they are tiny and pinned by this adapter's unit test (signature is
 *   independently re-verified there), so drift is caught.
 *
 * Security invariants (mirror SessionTokens):
 *   - `mint` refuses to mint when the secret is missing (throws — fail
 *     closed; never emit an unsigned identity token).
 *   - Secret material and tokens are never logged.
 *   - Lazy secret read (per call via `getSecret`), never at import — the
 *     import graph loads with no env set, matching the lazy-client pattern.
 */

import type { DbTokenMinter } from "@/lib/ports";

const encoder = new TextEncoder();

/** Backdate `iat` by this many seconds so a DB whose clock is a few
 *  seconds behind the app never rejects a brand-new token as "not yet
 *  valid" (nbf/iat skew). Server-only, never sent to the browser, so a
 *  small backdate is safe. (F-RLS-04a clock-skew fix.) */
export const TOKEN_SKEW_SECONDS = 30;

/** Token lifetime forward of mint time: short window minimises replay;
 *  tokens are minted per-request, server-side only, never persisted, never
 *  sent to the browser. (ADR-0007 §Consequences — token lifetime is an
 *  owned concern.) The total claim span is `SKEW + TTL` = 150s. */
export const TOKEN_TTL_SECONDS = 120;

/** Copied verbatim from SessionTokens.ts — base64url-encode raw bytes. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Copied verbatim from SessionTokens.ts — import the HMAC signing key. */
function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function createWebCryptoDbTokenMinter(deps: {
  /** Lazy — read per call, never at import (Edge bundles evaluate early). */
  getSecret: () => string | undefined;
}): DbTokenMinter {
  return {
    async mint(claims: { userId: string }): Promise<string> {
      const secret = deps.getSecret();
      if (!secret) {
        throw new Error(
          "SUPABASE_JWT_SECRET is not set — cannot mint DB identity tokens",
        );
      }

      const now = Math.floor(Date.now() / 1000);
      const header = { alg: "HS256", typ: "JWT" };
      const payload = {
        role: "authenticated",
        sub: claims.userId,
        user_id: claims.userId,
        iat: now - TOKEN_SKEW_SECONDS,
        exp: now + TOKEN_TTL_SECONDS,
      };

      const encodedHeader = toBase64Url(
        encoder.encode(JSON.stringify(header)),
      );
      const encodedPayload = toBase64Url(
        encoder.encode(JSON.stringify(payload)),
      );
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      const key = await importHmacKey(secret);
      const signature = await globalThis.crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signingInput),
      );

      return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
    },
  };
}
