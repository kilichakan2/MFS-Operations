import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Integration test config — separate from the unit-test config so
 * `npm run test` (unit only, fast, no DB) stays clean.
 *
 * Run with: npm run test:integration
 *
 * Prerequisites before running:
 *   1. Local Supabase running (supabase start)
 *   2. Migration applied (supabase db reset)
 *   3. Next.js dev server running (npm run dev)
 *   4. .env.test.local with local Supabase URL + service-role key
 */
export default defineConfig({
  test: {
    globals:        true,
    environment:    'node',
    include:        ['tests/integration/**/*.test.ts'],
    reporters:      ['verbose'],
    testTimeout:    30_000,   // API calls + DB writes
    hookTimeout:    30_000,
    setupFiles:     ['./tests/integration/_loadEnv.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
