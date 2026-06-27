/**
 * scripts/e2e-preview.mjs
 *
 * F-INFRA-02 — Gate-4 preview smoke wrapper. One command does all the
 * plumbing for the conductor:
 *
 *   npm run test:e2e:preview -- https://<preview-url>
 *
 * 1. Loads the gitignored .env.e2e.local (bypass secret + test PINs).
 *    Deliberately does NOT load .env.test.local — remote mode has no
 *    local Supabase role.
 * 2. Pre-validates the target URL with the same fail-closed rules as
 *    playwright.config.ts (duplicated cheaply on purpose: defence in
 *    depth, and a friendlier error before Playwright spins up).
 * 3. Spawns `npx playwright test --project=chromium --grep @critical`
 *    with BASE_URL + VERCEL_AUTOMATION_BYPASS_SECRET in env and exits
 *    with Playwright's exit code.
 *
 * --unprotected mode (temporary — tracked as BACKLOG F-INFRA-04):
 * Vercel Deployment Protection is currently DISABLED on this project
 * (the plan exposes no usable Protection Bypass for Automation), so
 * there is no bypass secret to send. Passing `--unprotected` after the
 * URL skips the bypass-secret requirement and tells the config/probe
 * layer (via E2E_PREVIEW_UNPROTECTED=1) not to send bypass headers.
 * Every hostname/https/prod-ref guard still applies — ONLY the
 * secret/header logic changes. Without the flag, behaviour is
 * byte-identical to the protected mode (secret required, fail closed).
 *
 * The bypass secret is never printed. See docs/runbooks/preview-smoke.md.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'
import dotenv from 'dotenv'

// Capture BASE_URL as set in the SHELL before dotenv runs —
// .env.e2e.local carries a localhost BASE_URL convenience value for
// local runs which must not be mistaken for a preview target.
const shellBaseUrl = process.env.BASE_URL

dotenv.config({ path: '.env.e2e.local' })

const PROD_HOSTNAMES = ['mfs-operations.vercel.app']
const PROD_SUPABASE_REF = 'uqgecljspgtevoylwkep'
// Scope slug pinned to this project's exact Vercel scope (confirmed
// against the live Vercel project) — same rule as playwright.config.ts.
const PREVIEW_HOST_RE =
  /^mfs-operations(-git-[a-z0-9-]+|-[a-z0-9]{9})-hakan-kilics-projects-2c54f03f\.vercel\.app$/

function die(msg) {
  console.error(`[e2e-preview] ${msg}`)
  process.exit(1)
}

const cliArgs = process.argv.slice(2)
const unprotected = cliArgs.includes('--unprotected')
// Optional --grep override (default @critical). Lets ANVIL run a focused
// probe (e.g. the F-26 R1 live-refresh tap, --grep @f26r1) through the
// SAME fail-closed guards + env wiring as the full smoke. Backward
// compatible: omitting it keeps the exact @critical behaviour.
const grepIdx = cliArgs.indexOf('--grep')
const grepPattern =
  grepIdx !== -1 && cliArgs[grepIdx + 1] ? cliArgs[grepIdx + 1] : '@critical'
const consumed = new Set(['--unprotected', '--grep', grepPattern])
const rawUrl = cliArgs.find((a) => !consumed.has(a)) ?? shellBaseUrl
if (!rawUrl) {
  die(
    'no preview URL given.\nUsage: npm run test:e2e:preview -- <preview-url>\n' +
      'The URL is the PR\'s …-git-<branch>-<scope>.vercel.app preview deployment.',
  )
}

let url
try {
  url = new URL(rawUrl)
} catch {
  die(`'${rawUrl}' is not a valid URL — refusing to run (fail closed).`)
}

if (url.protocol !== 'https:') {
  die('preview smokes are https-only — refusing a plain-http target (fail closed).')
}
// Vercel also serves production at the git-main alias
// (mfs-operations-git-main-<scope>.vercel.app) — refuse it too.
if (
  PROD_HOSTNAMES.includes(url.hostname) ||
  url.hostname.includes('-git-main-') ||
  rawUrl.includes(PROD_SUPABASE_REF)
) {
  die(
    'that URL looks like PRODUCTION — preview smokes target ' +
      '-git-….vercel.app preview deployments only. Refusing to run.',
  )
}
if (!PREVIEW_HOST_RE.test(url.hostname)) {
  die(
    `hostname '${url.hostname}' does not match this project's Vercel preview ` +
      'pattern (mfs-operations-git-<branch>-<scope>.vercel.app). ' +
      'Refusing to run (fail closed) — check the URL for typos.',
  )
}

const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ''
if (!unprotected && (secret.length < 20 || /\s/.test(secret))) {
  die(
    'bypass secret missing — set VERCEL_AUTOMATION_BYPASS_SECRET in ' +
      '.env.e2e.local; the smoke fails closed without it.',
  )
}

if (unprotected) {
  console.warn(
    '[e2e-preview] WARNING: --unprotected mode — assuming Vercel Deployment Protection is OFF; no bypass secret/headers will be sent (deliberate, tracked as BACKLOG F-INFRA-04).',
  )
}

console.log(`[e2e-preview] target: ${url.origin} — running ${grepPattern} specs…`)

const child = spawn(
  'npx',
  ['playwright', 'test', '--project=chromium', '--grep', grepPattern],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BASE_URL: url.origin,
      // Protected (default) mode passes the secret through; --unprotected
      // strips it and flags the config/probe layer instead, so no
      // x-vercel-protection-bypass header is ever sent in that mode.
      ...(unprotected
        ? { E2E_PREVIEW_UNPROTECTED: '1', VERCEL_AUTOMATION_BYPASS_SECRET: '' }
        : { VERCEL_AUTOMATION_BYPASS_SECRET: secret }),
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
