// Vitest global setup — runs BEFORE any test module loads.
//
// Why: `lib/supabase.ts` calls `createClient(URL!, KEY!)` at module-load time,
// which throws "supabaseUrl is required" if the env vars are missing. Unit tests
// use F-06's in-memory Fake adapters and NEVER touch the real client — but the
// transitive import chain still forces module-load evaluation. We stub the env
// vars here so the supabase client constructs harmlessly; the stub URL is never
// reached because Fake adapters intercept before any real call.
//
// Tracked as F-TD-04 in docs/plans/BACKLOG.md — proper fix is to make
// `lib/supabase.ts` lazy (Option B). Until then, this is the documented shim.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "stub-service-role-key-for-tests";
