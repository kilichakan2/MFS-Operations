/**
 * tests/unit/adapters/supabase/authenticatedClient.test.ts
 *
 * F-RLS-03 Slice 2 — proves the per-request authenticated client factory
 * and the requireServiceRole() escape hatch.
 *
 *   - authenticatedClientForCaller({ token }) builds a client with
 *     Authorization: Bearer <token> in its global headers, using the
 *     ANON key (not the service-role key) → runs as the `authenticated`
 *     Postgres role so RLS fires.
 *   - requireServiceRole() returns the SAME instance as getSupabaseService()
 *     (the existing master-key client, untouched) → BYPASSES RLS, named so
 *     it's visible and on purpose.
 *
 * createClient is mocked so the test inspects the URL/key/options the
 * factory passes, without standing up a real Supabase connection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const createClientMock = vi.fn((..._args: unknown[]) => ({ __mock: true }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe("F-RLS-03 authenticated Supabase client", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-stub";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-stub";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
  });

  it("attaches Authorization: Bearer <token> in the global headers", async () => {
    const { authenticatedClientForCaller } = await import(
      "@/lib/adapters/supabase/authenticatedClient"
    );
    authenticatedClientForCaller({ token: "minted.jwt.token" });

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [, , options] = createClientMock.mock.calls[0] as [
      string,
      string,
      { global?: { headers?: Record<string, string> } },
    ];
    expect(options?.global?.headers?.Authorization).toBe(
      "Bearer minted.jwt.token",
    );
  });

  it("uses the ANON key + public URL, never the service-role key", async () => {
    const { authenticatedClientForCaller } = await import(
      "@/lib/adapters/supabase/authenticatedClient"
    );
    authenticatedClientForCaller({ token: "tok" });

    const [url, key] = createClientMock.mock.calls[0] as [string, string];
    expect(url).toBe("http://localhost:54321");
    expect(key).toBe("anon-key-stub");
    expect(key).not.toBe("service-role-key-stub");
  });

  it("does NOT persist a session (per-request, anonymous auth config)", async () => {
    const { authenticatedClientForCaller } = await import(
      "@/lib/adapters/supabase/authenticatedClient"
    );
    authenticatedClientForCaller({ token: "tok" });

    const [, , options] = createClientMock.mock.calls[0] as [
      string,
      string,
      { auth?: { persistSession?: boolean; autoRefreshToken?: boolean } },
    ];
    expect(options?.auth?.persistSession).toBe(false);
    expect(options?.auth?.autoRefreshToken).toBe(false);
  });

  it("builds a fresh client per call (not memoized — token is per-caller)", async () => {
    const { authenticatedClientForCaller } = await import(
      "@/lib/adapters/supabase/authenticatedClient"
    );
    authenticatedClientForCaller({ token: "a" });
    authenticatedClientForCaller({ token: "b" });
    expect(createClientMock).toHaveBeenCalledTimes(2);
    const firstAuth = (
      createClientMock.mock.calls[0][2] as {
        global: { headers: { Authorization: string } };
      }
    ).global.headers.Authorization;
    const secondAuth = (
      createClientMock.mock.calls[1][2] as {
        global: { headers: { Authorization: string } };
      }
    ).global.headers.Authorization;
    expect(firstAuth).toBe("Bearer a");
    expect(secondAuth).toBe("Bearer b");
  });

  it("requireServiceRole() returns the same instance as getSupabaseService()", async () => {
    const { requireServiceRole } = await import(
      "@/lib/adapters/supabase/authenticatedClient"
    );
    const { getSupabaseService } = await import(
      "@/lib/adapters/supabase/client"
    );
    expect(requireServiceRole()).toBe(getSupabaseService());
  });
});
