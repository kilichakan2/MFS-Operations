import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load E2E test environment from .env.e2e.local (PINs, user names).
// This file is gitignored — see docs/anvil/run-prompts.md for setup.
dotenv.config({ path: '.env.e2e.local' })

/**
 * playwright.config.ts
 *
 * Run locally:
 *   npm run dev           (one terminal)
 *   npx playwright test --project=chromium   (another terminal)
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
  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'Mobile Safari',
      use:   { ...devices['iPhone 14'] },
    },
  ],
})
