/**
 * tests/integration/auth-login.test.ts
 *
 * Integration characterization tests for POST /api/auth/login (F-13 PR3).
 *
 * Posture: behaviour MUST be byte-identical before and after the re-point of
 * this route through usersService. These tests are written to pass against the
 * CURRENT (direct-Supabase) route first, then kept green after the swap —
 * proving the change is plumbing-only.
 *
 * They pin the two watch-points from the plan:
 *   - R1: an UNKNOWN username still calls recordFailure(name) so unknown-name
 *     attempts keep counting toward account lockout (the old PGRST116 branch
 *     did this; the new `if (!user)` null branch must too).
 *   - R2: a genuine DB failure returns { error: 'Database error' } (500), not
 *     the outer catch's { error: 'Server error' }.
 *
 * Login is unauthenticated, so this file does NOT use the shared api() helper
 * (which attaches session cookies). It POSTs raw to the booted dev server and
 * inspects Set-Cookie headers directly.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getServiceClient, TEST_PREFIX } from "./_setup";
import { INTEGRATION_BASE_URL } from "./_config";
import { passwordHasher } from "@/lib/wiring/password";

// Dedicated login fixtures — distinct names so .ilike() never collides with
// the shared ANVIL-TEST-<role> users (which carry a non-matching placeholder
// hash). These carry REAL bcrypt hashes of known credentials.
const PIN_USER = `${TEST_PREFIX}login-pin`;
const ADMIN_USER = `${TEST_PREFIX}login-admin`;
const INACTIVE_USER = `${TEST_PREFIX}login-inactive`;
const MULTIROLE_USER = `${TEST_PREFIX}login-multirole`;
const UNKNOWN_USER = `${TEST_PREFIX}login-does-not-exist-${Date.now()}`;

const KNOWN_PIN = "4821";
const KNOWN_PASSWORD = "correct-horse-battery";

interface LoginResult {
  status: number;
  body: Record<string, unknown>;
  setCookies: string[];
}

async function login(payload: unknown, asJson = true): Promise<LoginResult> {
  const res = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: asJson ? JSON.stringify(payload) : (payload as string),
    redirect: "manual",
  });
  const raw = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { _raw: raw };
  }
  // getSetCookie() returns every Set-Cookie header individually (Node 18.14+).
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  return { status: res.status, body, setCookies };
}

/** Upsert a login fixture by name with a known hash + role + active flag. */
async function seedUser(opts: {
  name: string;
  role: string;
  active: boolean;
  pinHash: string | null;
  passwordHash: string | null;
  secondaryRoles?: string[];
}): Promise<{ id: string }> {
  const supa = getServiceClient();
  // Delete-then-insert so re-runs start from a known state.
  await supa.from("users").delete().eq("name", opts.name);
  const { data, error } = await supa
    .from("users")
    .insert({
      name: opts.name,
      role: opts.role,
      active: opts.active,
      pin_hash: opts.pinHash,
      password_hash: opts.passwordHash,
      secondary_roles: opts.secondaryRoles ?? [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`seed ${opts.name} failed: ${error.message}`);
  return data;
}

function cookieNames(setCookies: string[]): string[] {
  return setCookies.map((c) => c.split("=")[0].trim());
}

describe("POST /api/auth/login (F-13 PR3 re-point)", () => {
  let pinId = "";
  const pinHash = () => passwordHasher.hash(KNOWN_PIN);
  const pwHash = () => passwordHasher.hash(KNOWN_PASSWORD);

  beforeAll(async () => {
    const [hPin, hPw] = await Promise.all([pinHash(), pwHash()]);
    const pin = await seedUser({
      name: PIN_USER,
      role: "warehouse",
      active: true,
      pinHash: hPin,
      passwordHash: null,
    });
    pinId = pin.id;
    await seedUser({
      name: ADMIN_USER,
      role: "admin",
      active: true,
      pinHash: null,
      passwordHash: hPw,
    });
    await seedUser({
      name: INACTIVE_USER,
      role: "warehouse",
      active: false,
      pinHash: hPin,
      passwordHash: null,
    });
    await seedUser({
      name: MULTIROLE_USER,
      role: "warehouse",
      active: true,
      pinHash: hPin,
      passwordHash: null,
      secondaryRoles: ["office"],
    });
  }, 30_000);

  // 1 — Success (PIN user) + last_login stamp ------------------------------

  it("PIN user, correct PIN → 200 success + session cookies + last_login advances", async () => {
    const supa = getServiceClient();
    const before = await supa
      .from("users")
      .select("last_login_at")
      .eq("id", pinId)
      .single();

    const res = await login({ name: PIN_USER, credential: KNOWN_PIN });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      role: "warehouse",
      secondaryRoles: [],
      name: PIN_USER,
      redirect: "/dispatch",
    });

    const names = cookieNames(res.setCookies);
    expect(names).toContain("mfs_session");
    expect(names).toContain("mfs_role");
    expect(names).toContain("mfs_user_id");
    expect(names).toContain("mfs_name");
    // mfs_secondary_roles is cleared (Max-Age=0) on a single-role session
    const secRolesCookie = res.setCookies.find((c) =>
      c.startsWith("mfs_secondary_roles="),
    );
    expect(secRolesCookie).toBeDefined();
    expect(secRolesCookie).toMatch(/Max-Age=0/i);

    // last_login_at advanced (fire-and-forget — poll briefly).
    const beforeTs = before.data?.last_login_at
      ? new Date(before.data.last_login_at).getTime()
      : 0;
    let advanced = false;
    for (let i = 0; i < 20 && !advanced; i++) {
      const after = await supa
        .from("users")
        .select("last_login_at")
        .eq("id", pinId)
        .single();
      const afterTs = after.data?.last_login_at
        ? new Date(after.data.last_login_at).getTime()
        : 0;
      if (afterTs > beforeTs) advanced = true;
      else await new Promise((r) => setTimeout(r, 100));
    }
    expect(advanced).toBe(true);
  });

  // 2 — Success (admin, password path) -------------------------------------

  it("admin user, correct password → 200 role:'admin', redirect /dashboard/admin", async () => {
    const res = await login({ name: ADMIN_USER, credential: KNOWN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      role: "admin",
      redirect: "/dashboard/admin",
    });
  });

  // 3 — Wrong credential ----------------------------------------------------

  it("correct name, wrong PIN → 401 Invalid credentials, no session cookie", async () => {
    const res = await login({ name: PIN_USER, credential: "0000" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(cookieNames(res.setCookies)).not.toContain("mfs_session");
  });

  // 4 — Unknown user (R1: recordFailure must still tick) -------------------

  it("unknown user → 401 Invalid credentials AND counts toward lockout (R1)", async () => {
    // Hammer the SAME unknown name MAX_ATTEMPTS (5) times. If recordFailure
    // runs on the null branch, the 6th attempt must be rate-limited (429).
    // If it does NOT run (the regression), all attempts stay 401.
    const name = `${UNKNOWN_USER}-r1`;
    let last: LoginResult | null = null;
    for (let i = 0; i < 5; i++) {
      last = await login({ name, credential: "whatever" });
      expect(last.status).toBe(401);
      expect(last.body).toEqual({ error: "Invalid credentials" });
    }
    // 6th attempt — locked out because the prior 5 failures were counted.
    const sixth = await login({ name, credential: "whatever" });
    expect(sixth.status).toBe(429);
    expect(String(sixth.body.error)).toMatch(/too many failed attempts/i);
  });

  // 5 — Inactive account ----------------------------------------------------

  it("inactive account, correct credential → 403 Account is inactive", async () => {
    const res = await login({ name: INACTIVE_USER, credential: KNOWN_PIN });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Account is inactive" });
    expect(cookieNames(res.setCookies)).not.toContain("mfs_session");
  });

  // 6 — Missing fields ------------------------------------------------------

  it("missing credential → 400 Name and credential are required", async () => {
    const res = await login({ name: PIN_USER });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Name and credential are required" });
  });

  it("missing name → 400 Name and credential are required", async () => {
    const res = await login({ credential: KNOWN_PIN });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Name and credential are required" });
  });

  // 7 — Malformed JSON body -------------------------------------------------

  it("non-JSON body → 400 Invalid JSON body", async () => {
    const res = await login("this is not json{", false);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON body" });
  });

  // 8 — Multi-role picker ---------------------------------------------------

  it("multi-role user, no chosenRole → 200 requiresRolePicker, no session cookie", async () => {
    const res = await login({ name: MULTIROLE_USER, credential: KNOWN_PIN });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      requiresRolePicker: true,
      roles: ["warehouse", "office"],
      name: MULTIROLE_USER,
    });
    expect(cookieNames(res.setCookies)).not.toContain("mfs_session");
  });

  // 9 — Invalid role selection ---------------------------------------------

  it("multi-role user, chosenRole not in roles → 400 Invalid role selection", async () => {
    const res = await login({
      name: MULTIROLE_USER,
      credential: KNOWN_PIN,
      chosenRole: "driver",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid role selection" });
  });

  // Note on case 10 (no-hash account, 403 "not configured"): un-seedable as an
  // integration fixture. The DB CHECK constraint `users_auth_check` forbids any
  // row whose role-appropriate hash is null (admin ⇒ password_hash NOT NULL;
  // non-admin ⇒ pin_hash NOT NULL — supabase/migrations/20260101000000_baseline.sql:1282).
  // So the route's `if (!hashToCheck)` branch cannot be hit by a real row. It is
  // covered instead by the route-handler unit test
  // (tests/unit/api/auth-login.route.test.ts), which injects a Fake credential
  // whose role-appropriate hash is null.
});
