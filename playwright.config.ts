import { defineConfig, devices } from '@playwright/test'

/**
 * playwright.config.ts
 *
 * Run locally:
 *   npm run dev           (one terminal)
 *   npx playwright test   (another terminal)
 *
 * Or with the webServer option below which starts the dev server automatically.
 * Set LOGIN_PIN env var to a real admin PIN from your Supabase DB.
 */
export default defineConfig({
  testDir:    './tests/e2e',
  timeout:    30_000,
  retries:    1,
  reporter:   'list',
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
  // Uncomment to auto-start the dev server:
  // webServer: {
  //   command: 'npm run dev',
  //   url:     'http://localhost:3000',
  //   reuseExistingServer: true,
  // },
})
