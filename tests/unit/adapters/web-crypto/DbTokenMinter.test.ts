/**
 * tests/unit/adapters/web-crypto/DbTokenMinter.test.ts
 *
 * F-RLS-03 Slice 1 — proves the web-crypto DbTokenMinter adapter mints a
 * REAL 3-segment HS256 JWT (header.payload.signature) PostgREST can verify,
 * NOT the 2-segment `mfs_session` shape. Reuses the same Web Crypto HMAC
 * primitive as SessionTokens — no new dependency.
 *
 * Asserted against a fixed test-only secret (never a real production
 * secret). The signature is independently re-computed here via Web Crypto
 * `verify`, so the test proves the token verifies under the same secret.
 */
import { describe, it, expect } from "vitest";
import { createWebCryptoDbTokenMinter } from "@/lib/adapters/web-crypto";

const TEST_SECRET = "f-rls-03-test-only-jwt-secret-not-a-real-one";
const USER_ID = "11111111-1111-1111-1111-111111111111";

/** Node-side base64url decode helper for inspecting the segments. */
function decodeSegment(seg: string): unknown {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

const encoder = new TextEncoder();

/** Re-verify the signature independently using Web Crypto, the same way
 *  PostgREST would (HMAC-SHA256 over `header.payload`). */
async function verifySignature(
  token: string,
  secret: string,
): Promise<boolean> {
  const [header, payload, signature] = token.split(".");
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = Uint8Array.from(Buffer.from(signature, "base64url"));
  return globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    encoder.encode(`${header}.${payload}`),
  );
}

describe("F-RLS-03 web-crypto DbTokenMinter", () => {
  const minter = createWebCryptoDbTokenMinter({
    getSecret: () => TEST_SECRET,
  });

  it("mints a 3-segment compact JWT (header.payload.signature), not the 2-segment mfs_session shape", async () => {
    const token = await minter.mint({ userId: USER_ID });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    // every segment is non-empty base64url
    for (const seg of parts) {
      expect(seg.length).toBeGreaterThan(0);
      expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("encodes the standard HS256 JWT header", async () => {
    const token = await minter.mint({ userId: USER_ID });
    const header = decodeSegment(token.split(".")[0]);
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("carries { role: 'authenticated', sub, user_id, iat, exp } with a 60s TTL", async () => {
    const token = await minter.mint({ userId: USER_ID });
    const payload = decodeSegment(token.split(".")[1]) as Record<
      string,
      unknown
    >;
    expect(payload.role).toBe("authenticated");
    expect(payload.sub).toBe(USER_ID);
    expect(payload.user_id).toBe(USER_ID);
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("produces a signature that verifies under the same secret (independent re-computation)", async () => {
    const token = await minter.mint({ userId: USER_ID });
    expect(await verifySignature(token, TEST_SECRET)).toBe(true);
  });

  it("produces a signature that FAILS verification under a different secret", async () => {
    const token = await minter.mint({ userId: USER_ID });
    expect(await verifySignature(token, "a-completely-different-secret")).toBe(
      false,
    );
  });

  it("throws when the signing secret is unavailable (fail closed, mirrors SessionTokens.issue)", async () => {
    const noSecret = createWebCryptoDbTokenMinter({
      getSecret: () => undefined,
    });
    await expect(noSecret.mint({ userId: USER_ID })).rejects.toThrow();
  });
});
