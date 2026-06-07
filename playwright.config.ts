/**
 * playwright.config.ts
 *
 * F-INFRA-01 update — adds `api` + `ui` projects + auto-boot webServer.
 * The existing `chromium` and `Mobile Safari` projects are preserved
 * intact and continue to run the existing 13 E2E specs under
 * tests/e2e/* — they are testIgnored from the new api/ and ui/ subdirs.
 *
 * Dependency justification (ADR-0002 spirit):
 *   @playwright/test is the only devDep that covers BOTH UI browser
 *   automation AND request-fixture API smokes in one tool. Alternatives
 *   were supertest (API only) + a separate Cypress/Puppeteer setup (UI
 *   only) — two tools, two vocabularies, two CI integrations. One tool
 *   wins on every axis except raw browser-API depth, which this project
 *   doesn't need.
 *
 * webServer env: explicitly sourced from .env.test.local so the spawned
 * dev server points at LOCAL Supabase, never production — even if the
 * developer's .env.local points at prod. This is the production-safety
 * invariant for the Playwright path.
 *
 * Run locally:
 *   npm run db:up                # one terminal (or already up)
 *   npm run test:e2e:api         # auto-boots dev server + runs api smoke
 *   npm run test:e2e:ui          # auto-boots dev server + runs ui smoke
 *   npx playwright test          # all projects (existing 13 + 2 smokes)
 *
 * The order-pipeline E2E specs are numbered (01-order-place,
 * 02-picking-list-print, 03-kds-butcher-flow) and must run in that
 * order — 02 prints an order that 03 expects to find on the queue,
 * and 01 creates the order that 02 prints. workers: 1 enforces
 * serial execution so files don't interleave across workers.
 *
 * Mobile Safari project is defined but requires `npx playwright
 * install webkit` to use. Default ANVIL runs use --project=chromium.
 */
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load BOTH env files. .env.test.local for the new api/ui smokes
// (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — needed
// so webServer.env can pass them to the spawned dev server,
// overriding whatever .env.local says (which may point at prod).
// .env.e2e.local for the existing 13 specs (PINs + user names).
dotenv.config({ path: '.env.test.local' })
dotenv.config({ path: '.env.e2e.local' })

export default defineConfig({
  testDir:    './tests/e2e',
  timeout:    30_000,
  retries:    1,
  reporter:   'list',
  // Workers=1: run specs sequentially. The order-pipeline specs
  // share state (orders created in 01 are used by 02, then 03).
  // Speed cost is small (~10s total) and determinism is much
  // higher.
  workers:    1,
  use: {
    baseURL:       process.env.BASE_URL ?? 'http://localhost:3000',
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    trace:         'on-first-retry',
  },
  // Auto-boot the dev server if it isn't already up. `reuseExistingServer`
  // keeps the inner loop fast when a dev server is already running.
  // The explicit `env` block is THE production-safety boundary: the
  // spawned dev server inherits local Supabase URL + service-role key,
  // never .env.local's prod values.
  webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout:             60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  },
  projects: [
    // F-INFRA-01: API smoke — request fixture only, no browser.
    {
      name:      'api',
      testMatch: 'api/**/*.spec.ts',
      use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
      },
    },
    // F-INFRA-01: UI smoke — chromium browser.
    {
      name:      'ui',
      testMatch: 'ui/**/*.spec.ts',
      use:       { ...devices['Desktop Chrome'] },
    },
    // Existing — preserved untouched in behaviour. testIgnore the
    // new api/ + ui/ subdirs so this project doesn't double-run them.
    {
      name:       'chromium',
      testIgnore: ['api/**', 'ui/**'],
      use:        { ...devices['Desktop Chrome'] },
    },
    {
      name:       'Mobile Safari',
      testIgnore: ['api/**', 'ui/**'],
      use:        { ...devices['iPhone 14'] },
    },
  ],
})
