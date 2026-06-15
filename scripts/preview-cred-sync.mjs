/**
 * scripts/preview-cred-sync.mjs
 *
 * F-INFRA-05 — orchestrator entrypoint for the Supabase→Vercel preview cred
 * sync. Run by the GitHub Action via `node scripts/preview-cred-sync.mjs <mode>`
 * where <mode> is `sync` (PR opened/synchronize/reopened) or `cleanup`
 * (PR closed).
 *
 * This is the IMPURE shell (plan §6): it reads env + argv, builds the two real
 * I/O clients, then delegates every decision to the pure core. The two
 * orchestration functions (`runSync`, `runCleanup`) take their dependencies
 * INJECTED so they can be exercised without real network; `main()` wires the
 * real clients and process exit codes.
 *
 * Secrets (SUPABASE_ACCESS_TOKEN, VERCEL_API_TOKEN) come from env only and are
 * NEVER logged — all logging goes through `redact.mjs`. Non-secret IDs are
 * hardcoded constants (plan §6): public identifiers, not passwords.
 *
 * 🗣 The robot's controller: reads the job ticket, hires the two hands, lets the
 *    brain decide, and reports a clean pass/fail exit code to CI.
 */

import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

import { log, redact } from './preview-cred-sync/redact.mjs'
import {
  matchBranchByName,
  pollDecision,
  nextPollDelayMs,
  deriveSupabaseUrl,
  mapCredsToEnvWrites,
  decideEnvAction,
  jwtPlan,
  decideRedeploy,
  ENV_KEYS,
  POLL_DEFAULTS,
} from './preview-cred-sync/core.mjs'
import { createSupabaseManagementClient } from './preview-cred-sync/supabase-management-client.mjs'
import { createVercelEnvClient } from './preview-cred-sync/vercel-env-client.mjs'

// ── Hardcoded, non-secret config (plan §6). Public identifiers, never secrets. ──
export const CONFIG = Object.freeze({
  vercelProjectId: 'prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ',
  vercelTeamId: 'team_WRtx6wNjCoPN95xacOxK6m1e',
  supabaseParentRef: 'uqgecljspgtevoylwkep',
  // Numeric GitHub repo id — Vercel /v13/deployments with gitSource.type:'github'
  // REQUIRES it (omitting → HTTP 400). Stable + non-secret, so pinned here like
  // projectId/teamId so it works in CI and local `npm run preview:cred-sync`.
  // Overridable via VERCEL_GIT_REPO_ID (env wins) but never required.
  githubRepoId: 1182877359,
})

/**
 * Poll the Management API until the PR's branch is healthy, then read its creds.
 * Pure decisions (match/poll) come from the core; the wait + the reads are the
 * only side effects.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createSupabaseManagementClient>} deps.supabaseClient
 * @param {string} deps.gitBranch
 * @param {(ms: number) => Promise<void>} [deps.sleepImpl]
 * @param {() => number} [deps.now]
 * @param {{ totalTimeoutMs?: number }} [deps.pollOpts]
 * @returns {Promise<{ branchRef: string, url: string, anonKey: string, serviceRoleKey: string, jwtSecret: string | null }>}
 */
export async function waitForBranchAndReadCreds(deps) {
  const { supabaseClient, gitBranch } = deps
  const sleepImpl = deps.sleepImpl ?? ((ms) => sleep(ms))
  const now = deps.now ?? (() => Date.now())
  const totalTimeoutMs = deps.pollOpts?.totalTimeoutMs ?? POLL_DEFAULTS.totalTimeoutMs

  const start = now()
  let attempt = 0
  // Poll loop — driven entirely by the pure pollDecision.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const branches = await supabaseClient.listBranches(CONFIG.supabaseParentRef)
    const branch = matchBranchByName(branches, gitBranch)
    const elapsedMs = now() - start
    const decision = pollDecision(branch, { attempt, elapsedMs, totalTimeoutMs })

    if (decision === 'ready') {
      const branchRef = /** @type {{ project_ref: string }} */ (branch).project_ref
      log.info('branch healthy — reading creds', { gitBranch, branchRef })
      const { anonKey, serviceRoleKey } = await supabaseClient.getApiKeys(branchRef)
      const jwtSecret = await supabaseClient.getJwtSecret(branchRef)
      return {
        branchRef,
        url: deriveSupabaseUrl(branchRef),
        anonKey,
        serviceRoleKey,
        jwtSecret,
      }
    }

    if (decision === 'giveup') {
      throw new Error(
        `Timed out after ${Math.round(elapsedMs / 1000)}s waiting for Supabase preview branch "${gitBranch}" to become healthy (fail closed)`,
      )
    }

    const delayMs = nextPollDelayMs(attempt)
    log.info('branch not ready — waiting', { gitBranch, attempt, delayMs })
    await sleepImpl(delayMs)
    attempt += 1
  }
}

/**
 * Write the 4 creds into Vercel Preview scope idempotently, then conditionally
 * redeploy. All decisions (env action, jwt plan, redeploy) are pure-core; the
 * GET/POST/PATCH and redeploy are the only side effects.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createVercelEnvClient>} deps.vercelClient
 * @param {{ branchRef: string, url: string, anonKey: string, serviceRoleKey: string, jwtSecret: string | null }} deps.creds
 * @param {string} deps.gitBranch
 * @param {number} [deps.repoId]
 * @returns {Promise<{ created: number, updated: number, redeployed: boolean }>}
 */
export async function syncEnvVars(deps) {
  const { vercelClient, creds, gitBranch, repoId } = deps

  // §10: loud warning when the JWT secret is withheld — never throws.
  if (jwtPlan(creds).warn) {
    log.warn(
      `SUPABASE_JWT_SECRET not returned by the Management API for branch "${gitBranch}" — continuing; url/anon/service-role were synced. If the preview needs the JWT secret, this is a known gap, see F-INFRA-05 §10`,
    )
  }

  const writes = mapCredsToEnvWrites(creds, gitBranch)
  const existing = await vercelClient.listBranchEnv(gitBranch)

  let created = 0
  let updated = 0
  for (const write of writes) {
    const decision = decideEnvAction(existing, write)
    if (decision.action === 'create') {
      await vercelClient.createEnv(write)
      created += 1
      log.info('env var created', { key: write.key, gitBranch, value: redact(write.value) })
    } else {
      await vercelClient.updateEnv(decision.envId, { value: write.value })
      updated += 1
      log.info('env var updated', {
        key: write.key,
        gitBranch,
        envId: decision.envId,
        value: redact(write.value),
      })
    }
  }

  const redeployNeeded = decideRedeploy({ created, updated })
  let redeployed = false
  if (redeployNeeded) {
    await vercelClient.createDeployment({ gitBranch, repoId })
    redeployed = true
    log.info('preview redeploy triggered', { gitBranch })
  } else {
    log.info('no changes — skipping redeploy (loop guard)', { gitBranch })
  }

  return { created, updated, redeployed }
}

/**
 * Full sync orchestration (PR opened/synchronize/reopened): wait → read → write
 * → redeploy. Dependencies injected for testability.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createSupabaseManagementClient>} deps.supabaseClient
 * @param {ReturnType<typeof createVercelEnvClient>} deps.vercelClient
 * @param {string} deps.gitBranch
 * @param {number} [deps.repoId]
 * @param {(ms: number) => Promise<void>} [deps.sleepImpl]
 * @param {() => number} [deps.now]
 * @param {{ totalTimeoutMs?: number }} [deps.pollOpts]
 * @returns {Promise<{ created: number, updated: number, redeployed: boolean }>}
 */
export async function runSync(deps) {
  log.info('sync start', { gitBranch: deps.gitBranch })
  const creds = await waitForBranchAndReadCreds(deps)
  const result = await syncEnvVars({ ...deps, creds })
  log.info('sync done', { gitBranch: deps.gitBranch, ...result })
  return result
}

/**
 * Cleanup orchestration (PR closed): delete the 4 branch-scoped Preview vars.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createVercelEnvClient>} deps.vercelClient
 * @param {string} deps.gitBranch
 * @returns {Promise<{ deleted: number }>}
 */
export async function runCleanup(deps) {
  const { vercelClient, gitBranch } = deps
  log.info('cleanup start', { gitBranch })
  const ownedKeys = new Set(Object.values(ENV_KEYS))
  const existing = await vercelClient.listBranchEnv(gitBranch)
  let deleted = 0
  for (const v of existing) {
    if (!ownedKeys.has(v.key)) continue
    await vercelClient.deleteEnv(v.id)
    deleted += 1
    log.info('env var deleted', { key: v.key, gitBranch, envId: v.id })
  }
  log.info('cleanup done', { gitBranch, deleted })
  return { deleted }
}

/**
 * Read + validate the environment, failing closed with a clear message if a
 * required value is missing. Returns the parsed, non-secret-shaped inputs.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} mode
 * @returns {{ gitBranch: string, repoId: number, supabaseAccessToken: string, vercelApiToken: string }}
 */
export function readEnv(env, mode) {
  const gitBranch = env.PR_GIT_BRANCH ?? ''
  if (!gitBranch) {
    throw new Error('PR_GIT_BRANCH is required (the PR head git ref) — refusing to run (fail closed)')
  }
  const vercelApiToken = env.VERCEL_API_TOKEN ?? ''
  if (!vercelApiToken) {
    throw new Error('VERCEL_API_TOKEN is required — refusing to run (fail closed)')
  }
  // The Supabase token is only needed on the sync path (cleanup is Vercel-only).
  const supabaseAccessToken = env.SUPABASE_ACCESS_TOKEN ?? ''
  if (mode === 'sync' && !supabaseAccessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required for sync — refusing to run (fail closed)')
  }
  // repoId: env override wins (Vercel wants a number, env is always a string →
  // coerce), else the pinned non-secret constant. Always present so the redeploy
  // body never omits repoId (would 400 on /v13/deployments with a github source).
  const repoIdOverride = env.VERCEL_GIT_REPO_ID
  const repoId = repoIdOverride ? Number(repoIdOverride) : CONFIG.githubRepoId
  if (!Number.isInteger(repoId)) {
    throw new Error(`VERCEL_GIT_REPO_ID must be a numeric GitHub repo id, got "${repoIdOverride}" (fail closed)`)
  }
  return {
    gitBranch,
    repoId,
    supabaseAccessToken,
    vercelApiToken,
  }
}

/**
 * Thin process shell: parse mode, build real clients, dispatch, exit code.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<number>} exit code
 */
export async function main(argv, env) {
  const mode = argv[2]
  if (mode !== 'sync' && mode !== 'cleanup') {
    log.error("usage: node scripts/preview-cred-sync.mjs <sync|cleanup> — unknown mode", { mode: mode ?? '(none)' })
    return 1
  }

  let inputs
  try {
    inputs = readEnv(env, mode)
  } catch (err) {
    log.error('environment validation failed', { detail: String(err instanceof Error ? err.message : err) })
    return 1
  }

  const vercelClient = createVercelEnvClient({
    apiToken: inputs.vercelApiToken,
    projectId: CONFIG.vercelProjectId,
    teamId: CONFIG.vercelTeamId,
  })

  try {
    if (mode === 'cleanup') {
      await runCleanup({ vercelClient, gitBranch: inputs.gitBranch })
    } else {
      const supabaseClient = createSupabaseManagementClient({ accessToken: inputs.supabaseAccessToken })
      await runSync({
        supabaseClient,
        vercelClient,
        gitBranch: inputs.gitBranch,
        repoId: inputs.repoId,
      })
    }
    return 0
  } catch (err) {
    // Message only — never the underlying secrets/tokens.
    log.error(`${mode} failed`, { detail: String(err instanceof Error ? err.message : err) })
    return 1
  }
}

// Only run when invoked directly (not when imported by a test).
const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('preview-cred-sync.mjs')
if (invokedDirectly) {
  main(process.argv, process.env).then((code) => process.exit(code))
}
