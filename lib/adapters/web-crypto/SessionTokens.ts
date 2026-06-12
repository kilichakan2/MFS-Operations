/**
 * lib/adapters/web-crypto/SessionTokens.ts
 *
 * Web Crypto implementation of the SessionTokens port (T1) —
 * HMAC-SHA256 over the base64url-encoded claims JSON.
 *
 * Why Web Crypto (`globalThis.crypto.subtle`) and NOT `node:crypto`:
 *   the Next.js middleware runs on the Edge runtime, which cannot
 *   import `node:crypto`. Web Crypto is built into BOTH runtimes
 *   (Edge, and Node — global since Node 19), so ONE adapter serves the
 *   login routes, the middleware and the test helpers with zero new
 *   dependencies. Same reasoning for atob/btoa + TextEncoder instead
 *   of Buffer (not available on the Edge runtime).
 *
 * What this hides (ADR-0002 depth rule): base64url encode/decode,
 * structural token parsing, constant-time signature comparison
 * (`crypto.subtle.verify` — NEVER string equality, which leaks
 * timing), JSON parsing and the claim-shape check. Callers see
 * "claims or null", nothing else.
 *
 * Security invariants:
 *   - `verify` never throws and fails closed (null) on any doubt,
 *     including a missing secret.
 *   - `issue` refuses to mint unsigned sessions when the secret is
 *     missing (throws — login surfaces a server error).
 *   - Secret material and tokens are never logged.
 */

import type { SessionClaims } from "@/lib/domain";
import type { SessionTokens } from "@/lib/ports";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

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

/** Strict decode: returns null unless the input is pure base64url. */
function fromBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL_RE.test(value)) return null;
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Shape check: userId/name/role non-empty strings; secondaryRoles an
 *  optional string array. Anything else is not a session. */
function isSessionClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.userId !== "string" || v.userId.length === 0) return false;
  if (typeof v.name !== "string" || v.name.length === 0) return false;
  if (typeof v.role !== "string" || v.role.length === 0) return false;
  if (v.secondaryRoles !== undefined) {
    if (
      !Array.isArray(v.secondaryRoles) ||
      v.secondaryRoles.some((r) => typeof r !== "string")
    ) {
      return false;
    }
  }
  return true;
}

// Fail-closed alarm — once per process, never includes secret/token.
let missingSecretLogged = false;
function logMissingSecretOnce(): void {
  if (missingSecretLogged) return;
  missingSecretLogged = true;
  console.error(
    "[session] SESSION_SECRET is not set — all sessions are treated as " +
      "invalid (fail closed). Set SESSION_SECRET in the environment " +
      "(locally: .env.local; generate with `openssl rand -base64 48`).",
  );
}

export function createWebCryptoSessionTokens(deps: {
  /** Lazy — read per call, never at import (Edge bundles evaluate early). */
  getSecret: () => string | undefined;
}): SessionTokens {
  return {
    async issue(claims: SessionClaims): Promise<string> {
      const secret = deps.getSecret();
      if (!secret) {
        throw new Error("SESSION_SECRET is not set — cannot issue sessions");
      }
      const key = await importHmacKey(secret);
      const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
      const signature = await globalThis.crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload),
      );
      return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
    },

    async verify(
      token: string | null | undefined,
    ): Promise<SessionClaims | null> {
      try {
        if (typeof token !== "string" || token.length === 0) return null;
        const secret = deps.getSecret();
        if (!secret) {
          logMissingSecretOnce();
          return null;
        }
        const parts = token.split(".");
        if (parts.length !== 2) return null;
        const [payload, signature] = parts;
        if (!payload || !signature) return null;
        const signatureBytes = fromBase64Url(signature);
        const payloadBytes = fromBase64Url(payload);
        if (!signatureBytes || !payloadBytes) return null;
        const key = await importHmacKey(secret);
        // Constant-time comparison — the crypto kit compares the
        // seals itself; `===` on signatures leaks timing.
        const valid = await globalThis.crypto.subtle.verify(
          "HMAC",
          key,
          signatureBytes as BufferSource,
          encoder.encode(payload),
        );
        if (!valid) return null;
        const claims: unknown = JSON.parse(decoder.decode(payloadBytes));
        return isSessionClaims(claims) ? claims : null;
      } catch {
        // ANY failure shape — malformed, non-JSON, runtime quirk —
        // collapses to "no session" (define errors out of existence).
        return null;
      }
    },
  };
}
