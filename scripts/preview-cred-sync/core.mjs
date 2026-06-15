/**
 * scripts/preview-cred-sync/core.mjs
 *
 * F-INFRA-05 — the PURE CORE of the preview cred-sync.
 *
 * Every decision the sync makes lives here as a pure function: branch matching,
 * health, poll backoff, cred→env mapping, create-vs-update, JWT-withheld
 * handling, redeploy-yes/no. NO network (`fetch`), NO `process` access, NO
 * mutation of inputs. This is what makes the sync's judgement unit-testable with
 * zero mocking (plan §6, §13).
 *
 * 🗣 The robot's brain. It decides everything; the two client files are the
 *    robot's hands that actually phone Supabase and Vercel.
 */

// The four Vercel Preview env keys this sync owns (plan §6).
export const ENV_KEYS = Object.freeze({
  URL: 'NEXT_PUBLIC_SUPABASE_URL',
  ANON: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  SERVICE_ROLE: 'SUPABASE_SERVICE_ROLE_KEY',
  JWT: 'SUPABASE_JWT_SECRET',
})

// Health-poll tuning (plan §7): 10-minute total budget, backoff capped ~20s.
export const POLL_DEFAULTS = Object.freeze({
  floorMs: 5_000,
  capMs: 20_000,
  totalTimeoutMs: 10 * 60_000,
})

/**
 * @typedef {{ name: string, project_ref: string, status?: string, preview_project_status?: string }} SupabaseBranch
 */

/**
 * Find the Supabase preview branch whose name equals the PR's git head ref.
 * Returns null (never throws) when there is no match or the inputs are empty —
 * the caller treats "no branch yet" as a poll-wait, not an error.
 *
 * @param {SupabaseBranch[] | undefined | null} branches
 * @param {string} gitBranch
 * @returns {SupabaseBranch | null}
 */
export function matchBranchByName(branches, gitBranch) {
  if (!Array.isArray(branches) || branches.length === 0) return null
  if (!gitBranch) return null
  return branches.find((b) => b && b.name === gitBranch) ?? null
}

/**
 * A branch is usable only when its project is up AND functions are deployed
 * (plan §7). Anything else — including a null/partial branch — is unhealthy.
 *
 * @param {SupabaseBranch | null | undefined} branch
 * @returns {boolean}
 */
export function isBranchHealthy(branch) {
  if (!branch) return false
  return (
    branch.preview_project_status === 'ACTIVE_HEALTHY' &&
    branch.status === 'FUNCTIONS_DEPLOYED'
  )
}

/**
 * Next poll delay given the attempt count. Steps up from the floor and is
 * capped — a gentle exponential-ish backoff so a slow branch boot does not
 * hammer the Management API (plan §7).
 *
 * @param {number} attempt 0-based attempt index
 * @param {{ floorMs?: number, capMs?: number }} [opts]
 * @returns {number} milliseconds to wait before the next poll
 */
export function nextPollDelayMs(attempt, opts = {}) {
  const floorMs = opts.floorMs ?? POLL_DEFAULTS.floorMs
  const capMs = opts.capMs ?? POLL_DEFAULTS.capMs
  const n = Math.max(0, Math.floor(attempt))
  // floor, floor, 2x, 2x, 3x… stepping every two attempts, then capped.
  const step = Math.floor(n / 2) + 1
  const delay = floorMs * step
  return Math.min(delay, capMs)
}

/**
 * The poll loop's single decision: ready / wait / giveup. Healthy always wins
 * (even past the timeout — if it came up, use it). Otherwise wait while under
 * the total budget; give up once the budget is spent (fail closed, plan §7).
 *
 * @param {SupabaseBranch | null} branch the matched branch, or null if absent
 * @param {{ attempt: number, elapsedMs: number, totalTimeoutMs?: number }} state
 * @returns {'ready' | 'wait' | 'giveup'}
 */
export function pollDecision(branch, state) {
  if (isBranchHealthy(branch)) return 'ready'
  const totalTimeoutMs = state.totalTimeoutMs ?? POLL_DEFAULTS.totalTimeoutMs
  if (state.elapsedMs >= totalTimeoutMs) return 'giveup'
  return 'wait'
}

/**
 * Derive the branch's Supabase URL from its own project ref (plan §6/§7).
 * @param {string} branchRef
 * @returns {string}
 */
export function deriveSupabaseUrl(branchRef) {
  return `https://${branchRef}.supabase.co`
}

/**
 * @typedef {{ branchRef: string, url: string, anonKey: string, serviceRoleKey: string, jwtSecret: string | null }} BranchCreds
 * @typedef {{ key: string, value: string, type: 'encrypted', target: ['preview'], gitBranch: string }} EnvWrite
 */

/**
 * Map the branch's credentials to the exact set of Vercel env writes. Always
 * url + anon + service-role; the JWT key is included only when present (the
 * 3-key path is valid — plan §10). EVERY write is hardcoded to
 * `type:encrypted`, `target:["preview"]`, scoped to the git branch — the
 * structural guard (R5) against ever writing a production-scoped var.
 *
 * Throws (fail closed) if `gitBranch` is empty: a write without a branch scope
 * would be a project-wide Preview var, which is forbidden.
 *
 * @param {BranchCreds} creds
 * @param {string} gitBranch
 * @returns {EnvWrite[]}
 */
export function mapCredsToEnvWrites(creds, gitBranch) {
  if (!gitBranch) {
    throw new Error(
      'mapCredsToEnvWrites: gitBranch is required — refusing to build a project-wide (un-scoped) Preview env write',
    )
  }
  /** @param {string} key @param {string} value @returns {EnvWrite} */
  const write = (key, value) => ({
    key,
    value,
    type: 'encrypted',
    target: ['preview'],
    gitBranch,
  })

  const writes = [
    write(ENV_KEYS.URL, creds.url),
    write(ENV_KEYS.ANON, creds.anonKey),
    write(ENV_KEYS.SERVICE_ROLE, creds.serviceRoleKey),
  ]
  if (jwtPlan(creds).write) {
    writes.push(write(ENV_KEYS.JWT, /** @type {string} */ (creds.jwtSecret)))
  }
  return writes
}

/**
 * @typedef {{ id: string, key: string }} ExistingEnvVar
 */

/**
 * Create-vs-update decision for one desired write, given the branch's existing
 * vars. Never blind-POSTs (Vercel 409s on a duplicate create): if a var with
 * the same key already exists for the branch, PATCH it by its id; otherwise
 * create (plan §8).
 *
 * @param {ExistingEnvVar[]} existing branch-scoped vars already in Vercel
 * @param {{ key: string }} desired
 * @returns {{ action: 'create' } | { action: 'update', envId: string }}
 */
export function decideEnvAction(existing, desired) {
  const match = (Array.isArray(existing) ? existing : []).find(
    (e) => e && e.key === desired.key,
  )
  if (match) return { action: 'update', envId: match.id }
  return { action: 'create' }
}

/**
 * JWT-secret plan (plan §10). Present → write it. Absent → warn loudly and
 * continue (the url/anon/service-role path must NOT be blocked). Never throws.
 *
 * @param {{ jwtSecret?: string | null }} creds
 * @returns {{ write: boolean, warn: boolean }}
 */
export function jwtPlan(creds) {
  const present = typeof creds?.jwtSecret === 'string' && creds.jwtSecret.length > 0
  return present ? { write: true, warn: false } : { write: false, warn: true }
}

/**
 * Redeploy only when this run actually changed something (plan §9). A pure
 * no-op run skips the redeploy so the action can never spin in a
 * redeploy→synchronize loop.
 *
 * @param {{ created?: number, updated?: number }} syncResult
 * @returns {boolean}
 */
export function decideRedeploy(syncResult) {
  const created = syncResult?.created ?? 0
  const updated = syncResult?.updated ?? 0
  return created + updated > 0
}
