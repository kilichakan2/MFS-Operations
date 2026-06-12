/**
 * tests/integration/session-signing.test.ts
 *
 * T1 — proves the middleware accepts only HMAC-signed `mfs_session`
 * cookies, through the real booted dev server:
 *
 *   - properly signed cookie        → 200 on a protected API
 *   - forged role, original sig     → 307 to /login
 *   - legacy unsigned JSON cookie   → 307 (pre-T1 cookies die at deploy)
 *   - garbage cookie                → 307 + Set-Cookie clears mfs_session
 *   - no cookie at all              → 307 (regression pin)
 *
 * Signs locally via the SAME adapter factory the app wires up
 * (`createWebCryptoSessionTokens`) with the suite's SESSION_SECRET
 * from .env.test.local — the spawned dev server shares that secret
 * (passed through by _globalSetup.ts).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createWebCryptoSessionTokens } from "@/lib/adapters/web-crypto";
import { INTEGRATION_BASE_URL } from "./_config";
import { setupTestUsers, type TestUserSet } from "./_setup";

const tokens = createWebCryptoSessionTokens({
  getSecret: () => process.env.SESSION_SECRET,
});

/** base64url-decode/encode helpers for forging payloads (Node-side). */
function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** GET a protected path with a raw mfs_session cookie value. */
async function getWithSession(
  path: string,
  sessionCookie: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (sessionCookie !== null) {
    headers.Cookie = `mfs_session=${sessionCookie}`;
  }
  return fetch(`${INTEGRATION_BASE_URL}${path}`, {
    headers,
    redirect: "manual", // surface middleware 307s instead of following
  });
}

describe("session cookie signing (T1)", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  it("accepts a properly signed admin session (200 on /api/reference)", async () => {
    const token = await tokens.issue({
      userId: users.admin.id,
      name: users.admin.name,
      role: "admin",
    });
    const res = await getWithSession("/api/reference", token);
    expect(res.status).toBe(200);
  });

  it("rejects a sales session whose payload was re-encoded to admin (307)", async () => {
    const token = await tokens.issue({
      userId: users.sales.id,
      name: users.sales.name,
      role: "sales",
    });
    const [payload, sig] = token.split(".");
    const claims = JSON.parse(b64urlDecode(payload)) as Record<string, unknown>;
    claims.role = "admin";
    const forged = `${b64urlEncode(JSON.stringify(claims))}.${sig}`;
    const res = await getWithSession("/api/reference", forged);
    expect(res.status).toBe(307);
  });

  it("rejects a legacy unsigned JSON cookie (today's exact format) (307)", async () => {
    const legacy = encodeURIComponent(
      JSON.stringify({
        userId: users.admin.id,
        name: users.admin.name,
        role: "admin",
        secondaryRoles: [],
      }),
    );
    const res = await getWithSession("/api/reference", legacy);
    expect(res.status).toBe(307);
  });

  it("rejects a garbage cookie (307) and clears mfs_session", async () => {
    const res = await getWithSession("/api/reference", "garbage-not-a-token");
    expect(res.status).toBe(307);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("mfs_session=");
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("rejects a request with no cookie at all (307) — regression pin", async () => {
    const res = await getWithSession("/api/reference", null);
    expect(res.status).toBe(307);
  });
});
