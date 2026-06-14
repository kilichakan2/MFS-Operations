import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("F-TD-04 lazy Supabase client", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  beforeEach(() => {
    // Fresh module instance per test → fresh `memo`, so one test's
    // constructed client cannot mask another test's no-env assertions.
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  });

  it("importing the module with no env vars does not throw", async () => {
    await expect(
      import("@/lib/adapters/supabase/client"),
    ).resolves.toBeDefined();
  });

  it("holding the supabaseService proxy reference does not construct the client", async () => {
    const mod = await import("@/lib/adapters/supabase/client");
    // plain reference — must NOT throw even with env unset
    const ref = mod.supabaseService;
    expect(ref).toBeDefined();
  });

  it("getSupabaseService() is memoized — same instance every call", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";
    const mod = await import("@/lib/adapters/supabase/client");
    expect(mod.getSupabaseService()).toBe(mod.getSupabaseService());
  });
});
