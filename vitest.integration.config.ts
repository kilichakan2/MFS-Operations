import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Integration test config — separate from the unit-test config so
 * `npm run test` (unit only, fast, no DB) stays clean.
 *
 * Run with: npm run test:integration
 *
 * Self-contained (F-TD-03): globalSetup boots its own Next.js dev
 * server on a dedicated port (3100), wired explicitly to LOCAL
 * Supabase from .env.test.local, verifies the wiring with a DB
 * identity probe, and tears the server down afterwards. Never start
 * `npm run dev` manually for this suite — a manually started server
 * reads .env.local, which may point at production.
 *
 * Prerequisites before running:
 *   1. Local Supabase running (npm run db:up)
 *   2. .env.test.local with local Supabase URL + service-role key
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    reporters: ["verbose"],
    testTimeout: 30_000, // API calls + DB writes
    hookTimeout: 30_000,
    // _loadEnv first — populates NEXT_PUBLIC_SUPABASE_URL from
    // .env.test.local. _assertStack second — fast-fails if the local
    // Supabase stack isn't reachable, so devs don't wait 30s on a
    // misleading timeout deep inside a test.
    setupFiles: [
      "./tests/integration/_loadEnv.ts",
      "./tests/integration/_assertStack.ts",
    ],
    // _globalSetup boots the dev server (own process, runs before
    // setupFiles) and returns the teardown that kills it.
    globalSetup: ["./tests/integration/_globalSetup.ts"],
    // Integration suites share DB state. Force single-fork serial
    // execution to eliminate TOCTOU races in beforeAll fixture setup.
    pool: "forks",
    isolate: false,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
