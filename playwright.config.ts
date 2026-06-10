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
 *
 * F-INFRA-02 update — remote preview mode. When BASE_URL points at a
 * non-localhost host the config flips to REMOTE: no local webServer is
 * booted, every request carries the Vercel Protection Bypass headers,
 * and a globalSetup DB-identity probe (tests/e2e/_previewProbe.ts)
 * must pass before any spec runs. Module-scope guards refuse plain
 * http, production-looking hostnames, anything that is not a
 * *.vercel.app preview host, and a missing/malformed bypass secret —
 * all BEFORE any network call (fail closed). When BASE_URL is unset
 * (or localhost) every value below is byte-identical to the previous
 * local-only config. Run: npm run test:e2e:preview -- <preview-url>
 * (see docs/runbooks/preview-smoke.md).
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

// ── F-INFRA-02: remote preview mode detection + fail-closed guards ──
// REMOTE = BASE_URL is set and not localhost. new URL() throws on a
// malformed BASE_URL — that is deliberate (fail closed, never guess).
const RAW_BASE = process.env.BASE_URL
const baseUrl  = RAW_BASE ? new URL(RAW_BASE) : null
const REMOTE   = !!baseUrl && !['localhost', '127.0.0.1'].includes(baseUrl.hostname)

// Hard-coded production identifiers (deny-list). The preview smoke
// must be physically unable to target the live site or anything that
// references the production Supabase project. Vercel ALSO serves
// production at the git-main alias (mfs-operations-git-main-<scope>
// .vercel.app) and its unique deployment URLs — so any hostname
// containing '-git-main-' is refused too.
const PROD_HOSTNAMES    = ['mfs-operations.vercel.app']
const PROD_SUPABASE_REF = 'uqgecljspgtevoylwkep'
// Vercel preview hosts for this project: either the git-branch alias
// (mfs-operations-git-<branch>-<scope>.vercel.app) or the unique
// deployment URL (mfs-operations-<hash9>-<scope>.vercel.app). The
// scope slug is pinned to this project's exact Vercel scope
// (confirmed against the live Vercel project) so preview URLs from
// any OTHER scope are refused too.
const PREVIEW_HOST_RE =
  /^mfs-operations(-git-[a-z0-9-]+|-[a-z0-9]{9})-hakan-kilics-projects-2c54f03f\.vercel\.app$/

const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ''

if (REMOTE && baseUrl) {
  if (baseUrl.protocol !== 'https:') {
    throw new Error(
      `Refusing to run against a plain-${baseUrl.protocol} remote target — ` +
      'preview smokes are https-only (fail closed).',
    )
  }
  if (
    PROD_HOSTNAMES.includes(baseUrl.hostname) ||
    baseUrl.hostname.includes('-git-main-') ||
    (RAW_BASE ?? '').includes(PROD_SUPABASE_REF)
  ) {
    throw new Error(
      'Refusing to run @critical specs against a production-looking URL — ' +
      'preview smokes target -git-….vercel.app preview deployments only.',
    )
  }
  if (!PREVIEW_HOST_RE.test(baseUrl.hostname)) {
    throw new Error(
      `Hostname '${baseUrl.hostname}' does not match this project's Vercel ` +
      'preview pattern (mfs-operations-git-<branch>-<scope>.vercel.app). ' +
      'Refusing to run (fail closed) — check the URL for typos.',
    )
  }
  if (BYPASS_SECRET.length < 20 || /\s/.test(BYPASS_SECRET)) {
    throw new Error(
      'bypass secret missing — set VERCEL_AUTOMATION_BYPASS_SECRET in ' +
      '.env.e2e.local; the smoke fails closed without it.',
    )
  }
}

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
    // F-INFRA-02: remote mode shows the Vercel gate pass on every
    // request AND asks Vercel to set the _vercel_jwt bypass cookie so
    // request paths that miss the header stay authorized.
    ...(REMOTE
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': BYPASS_SECRET,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },
  // F-INFRA-02: the DB-identity probe runs before any spec, remote
  // mode only. Local runs have no globalSetup, exactly as before.
  ...(REMOTE ? { globalSetup: './tests/e2e/_previewProbe.ts' } : {}),
  // Auto-boot the dev server if it isn't already up. `reuseExistingServer`
  // keeps the inner loop fast when a dev server is already running.
  // The explicit `env` block is THE production-safety boundary: the
  // spawned dev server inherits local Supabase URL + service-role key,
  // never .env.local's prod values.
  // F-INFRA-02: remote mode tests the deployed build — no local dev
  // server is booted. Local mode keeps the exact block below.
  ...(REMOTE ? {} : { webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout:             60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  } }),
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
