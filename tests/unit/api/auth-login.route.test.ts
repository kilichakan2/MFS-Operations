/**
 * tests/unit/api/auth-login.route.test.ts
 *
 * F-13 PR3 — proves POST /api/auth/login is a thin doorman over the Users
 * service. The wiring singletons are mocked to inject deterministic fakes —
 * the route never touches a DB or bcrypt.
 *
 * These pin the paths the integration suite cannot reach against the real DB
 * (the no-hash 403 is forbidden by the users_auth_check CHECK constraint), plus
 * the two plan watch-points cheaply and in isolation:
 *   - R1: an UNKNOWN name (findCredentialByName → null) still calls
 *     recordFailure, so it counts toward lockout.
 *   - R2: a DB failure (findCredentialByName throws) returns
 *     { error: 'Database error' } (500), NOT the outer catch's 'Server error'.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { UserCredential } from "@/lib/domain/User";

// Spies stand in for the wired usersService methods.
const findCredentialByName = vi.fn();
const recordLogin = vi.fn();
const compare = vi.fn();

vi.mock("@/lib/wiring/users", () => ({
  usersService: {
    findCredentialByName: (...a: unknown[]) => findCredentialByName(...a),
    recordLogin: (...a: unknown[]) => recordLogin(...a),
  },
}));

vi.mock("@/lib/wiring/password", () => ({
  passwordHasher: {
    compare: (...a: unknown[]) => compare(...a),
  },
}));

// Stub the session token issue so success paths don't need a real secret.
vi.mock("@/lib/wiring/session", () => ({
  sessionTokens: {
    issue: vi.fn(async () => "stub-session-token"),
  },
}));

import { POST } from "@/app/api/auth/login/route";

function makeReq(body: unknown, rawBody?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

function cred(over: Partial<UserCredential> = {}): UserCredential {
  return {
    id: "u-1",
    name: "Casey",
    role: "warehouse",
    active: true,
    secondaryRoles: [],
    passwordHash: null,
    pinHash: "hashed-pin",
    ...over,
  };
}

beforeEach(() => {
  findCredentialByName.mockReset();
  recordLogin.mockReset();
  compare.mockReset();
  recordLogin.mockResolvedValue(undefined);
});

describe("POST /api/auth/login (F-13 PR3) — service-backed", () => {
  it("wrong credential → 401 Invalid credentials, no cookie", async () => {
    findCredentialByName.mockResolvedValue(cred());
    compare.mockResolvedValue(false);

    const res = await POST(makeReq({ name: "Casey", credential: "0000" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid credentials" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("R1 — unknown user (null) → 401 AND recordFailure ticks toward lockout", async () => {
    findCredentialByName.mockResolvedValue(null);

    // 5 failures lock the account; the 6th is 429 only if recordFailure ran.
    const name = `ghost-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = await POST(makeReq({ name, credential: "x" }));
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Invalid credentials" });
    }
    const sixth = await POST(makeReq({ name, credential: "x" }));
    expect(sixth.status).toBe(429);
    expect(String((await sixth.json()).error)).toMatch(
      /too many failed attempts/i,
    );
    // compare must never run for an unknown user.
    expect(compare).not.toHaveBeenCalled();
  });

  it("R2 — findCredentialByName throws → 500 Database error (not Server error)", async () => {
    findCredentialByName.mockRejectedValue(new Error("connection reset"));

    const res = await POST(makeReq({ name: "Casey", credential: "1234" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Database error" });
  });

  it("inactive account, correct credential → 403 Account is inactive", async () => {
    findCredentialByName.mockResolvedValue(cred({ active: false }));
    compare.mockResolvedValue(true);

    const res = await POST(makeReq({ name: "Casey", credential: "1234" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Account is inactive" });
  });

  it("role-appropriate hash null → 403 not configured", async () => {
    // warehouse user with pin_hash null — un-seedable in the DB (CHECK), so
    // this branch is only reachable here.
    findCredentialByName.mockResolvedValue(cred({ pinHash: null }));

    const res = await POST(makeReq({ name: "Casey", credential: "1234" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Account not configured — ask an admin to reset your credentials",
    });
    // never reaches the credential compare
    expect(compare).not.toHaveBeenCalled();
  });

  it("admin uses passwordHash, non-admin uses pinHash", async () => {
    findCredentialByName.mockResolvedValue(
      cred({ role: "admin", passwordHash: "admin-pw-hash", pinHash: null }),
    );
    compare.mockResolvedValue(true);

    const res = await POST(makeReq({ name: "Casey", credential: "secret" }));
    expect(res.status).toBe(200);
    // the admin's password_hash was the value compared, not the (null) pin
    expect(compare).toHaveBeenCalledWith("secret", "admin-pw-hash");
    const body = await res.json();
    expect(body).toMatchObject({ success: true, role: "admin" });
  });

  it("multi-role, no chosenRole → requiresRolePicker (camelCase secondaryRoles read)", async () => {
    findCredentialByName.mockResolvedValue(
      cred({ secondaryRoles: ["office"] }),
    );
    compare.mockResolvedValue(true);

    const res = await POST(makeReq({ name: "Casey", credential: "1234" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      requiresRolePicker: true,
      roles: ["warehouse", "office"],
      name: "Casey",
    });
  });

  it("invalid role selection → 400", async () => {
    findCredentialByName.mockResolvedValue(
      cred({ secondaryRoles: ["office"] }),
    );
    compare.mockResolvedValue(true);

    const res = await POST(
      makeReq({ name: "Casey", credential: "1234", chosenRole: "driver" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid role selection" });
  });

  it("success → recordLogin called with the user id and a Date", async () => {
    findCredentialByName.mockResolvedValue(cred());
    compare.mockResolvedValue(true);

    const res = await POST(makeReq({ name: "Casey", credential: "1234" }));
    expect(res.status).toBe(200);
    // fire-and-forget stamp — let the microtask flush
    await new Promise((r) => setTimeout(r, 0));
    expect(recordLogin).toHaveBeenCalledTimes(1);
    const [id, when] = recordLogin.mock.calls[0];
    expect(id).toBe("u-1");
    expect(when).toBeInstanceOf(Date);
  });
});
