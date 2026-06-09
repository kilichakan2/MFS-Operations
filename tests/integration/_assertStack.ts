/**
 * tests/integration/_assertStack.ts
 *
 * Vitest setupFile — runs once before any integration spec to verify
 * the local Supabase stack is reachable. Fails fast with an actionable
 * error if the stack is down, instead of letting each test eat a 30s
 * timeout deep inside a fetch.
 *
 * Wired in `vitest.integration.config.ts` setupFiles. Runs AFTER
 * `_loadEnv.ts` so NEXT_PUBLIC_SUPABASE_URL is populated.
 */
import { assertLocalStackReachable, assertAppServerReachable } from "./_setup";

// Top-level await inside a setupFile is supported by vitest — it blocks
// test collection until the probe resolves (or throws).
await assertLocalStackReachable();
// App server second — booted by _globalSetup.ts; this probe only fires
// if vitest was invoked in a way that skipped globalSetup.
await assertAppServerReachable();
