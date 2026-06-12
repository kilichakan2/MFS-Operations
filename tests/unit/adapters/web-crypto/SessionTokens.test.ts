/**
 * tests/unit/adapters/web-crypto/SessionTokens.test.ts
 *
 * T1 — battle-tests the Web Crypto SessionTokens adapter on the bench
 * before it is bolted into the app: round-trip, every forgery shape
 * (tampered payload, tampered/truncated signature, wrong secret),
 * legacy unsigned cookies, malformed inputs, missing-secret behaviour
 * and the cookie-safe charset pin. No DB. No network.
 *
 * The same adapter code path is bundled into the Edge middleware, so
 * these tests double as the middleware's verification-logic coverage.
 */
import { describe, it, expect } from "vitest";
import { createWebCryptoSessionTokens } from "@/lib/adapters/web-crypto";
import type { SessionClaims } from "@/lib/domain";

const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-secret-0123456789abcdef0123456789abcdef";

const tokens = createWebCryptoSessionTokens({ getSecret: () => SECRET });

const CLAIMS: SessionClaims = {
  userId: "00000000-0000-0000-0000-000000000a01",
  name: "ANVIL-TEST-admin",
  role: "admin",
  secondaryRoles: ["warehouse"],
};

// ── test-side base64url helpers (Node Buffer — tests run in Node) ──

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

/** Re-encode the payload with edited claims, keeping the original signature. */
function tamperPayload(
  token: string,
  edit: (claims: Record<string, unknown>) => void,
): string {
  const [payload, sig] = token.split(".");
  const claims = JSON.parse(b64urlDecode(payload)) as Record<string, unknown>;
  edit(claims);
  return `${b64urlEncode(JSON.stringify(claims))}.${sig}`;
}

/** Sign an arbitrary payload string with the REAL algorithm — used to
 *  reach the post-signature branches (JSON parse, shape check). */
async function signRaw(payloadJson: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = b64urlEncode(payloadJson);
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payload),
  );
  return `${payload}.${Buffer.from(sig).toString("base64url")}`;
}

describe("createWebCryptoSessionTokens", () => {
  it("round-trips claims with secondaryRoles", async () => {
    const token = await tokens.issue(CLAIMS);
    expect(await tokens.verify(token)).toEqual(CLAIMS);
  });

  it("round-trips claims without secondaryRoles", async () => {
    const claims: SessionClaims = {
      userId: CLAIMS.userId,
      name: "ANVIL-TEST-sales",
      role: "sales",
    };
    const token = await tokens.issue(claims);
    expect(await tokens.verify(token)).toEqual(claims);
  });

  it("rejects a tampered payload (role escalated, original signature)", async () => {
    const token = await tokens.issue({ ...CLAIMS, role: "sales" });
    const forged = tamperPayload(token, (c) => {
      c.role = "admin";
    });
    expect(await tokens.verify(forged)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await tokens.issue(CLAIMS);
    const [payload, sig] = token.split(".");
    const flipped = sig[0] === "A" ? "B" : "A";
    expect(
      await tokens.verify(`${payload}.${flipped}${sig.slice(1)}`),
    ).toBeNull();
  });

  it("rejects a truncated signature", async () => {
    const token = await tokens.issue(CLAIMS);
    const [payload, sig] = token.split(".");
    expect(await tokens.verify(`${payload}.${sig.slice(0, 8)}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const other = createWebCryptoSessionTokens({
      getSecret: () => OTHER_SECRET,
    });
    const token = await other.issue(CLAIMS);
    expect(await tokens.verify(token)).toBeNull();
  });

  it("rejects a legacy unsigned JSON cookie (raw)", async () => {
    expect(await tokens.verify(JSON.stringify(CLAIMS))).toBeNull();
  });

  it("rejects a legacy unsigned JSON cookie (URI-encoded, old helper format)", async () => {
    expect(
      await tokens.verify(encodeURIComponent(JSON.stringify(CLAIMS))),
    ).toBeNull();
  });

  it("returns null (never throws) on malformed inputs", async () => {
    const malformed: Array<string | null | undefined> = [
      "", // empty string
      undefined,
      null,
      "no-dot-at-all", // no dot
      "a.b.c", // two dots
      "!!!.@@@", // non-base64url junk
      `${b64urlEncode("not json")}.AAAA`, // base64url of non-JSON, bad sig
    ];
    for (const input of malformed) {
      expect(await tokens.verify(input)).toBeNull();
    }
  });

  it("rejects a correctly signed payload that is not JSON", async () => {
    expect(await tokens.verify(await signRaw("not json", SECRET))).toBeNull();
  });

  it("rejects a correctly signed payload with the wrong claim shape", async () => {
    expect(
      await tokens.verify(await signRaw('{"role":"admin"}', SECRET)),
    ).toBeNull();
  });

  it("issue rejects when the secret is missing", async () => {
    const noSecret = createWebCryptoSessionTokens({
      getSecret: () => undefined,
    });
    await expect(noSecret.issue(CLAIMS)).rejects.toThrow(
      "SESSION_SECRET is not set — cannot issue sessions",
    );
  });

  it("verify fails closed (null) when the secret is missing", async () => {
    const noSecret = createWebCryptoSessionTokens({ getSecret: () => "" });
    const token = await tokens.issue(CLAIMS);
    expect(await noSecret.verify(token)).toBeNull();
  });

  it("emits only cookie-safe base64url characters", async () => {
    const token = await tokens.issue(CLAIMS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
