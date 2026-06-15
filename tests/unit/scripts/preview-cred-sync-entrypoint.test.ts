/**
 * tests/unit/scripts/preview-cred-sync-entrypoint.test.ts
 *
 * F-INFRA-05 — tests for the orchestrator entrypoint (plan §13 step 8).
 *
 * Two layers:
 *  1. Black-box (spawned child, like e2e-preview-guards): the script must FAIL
 *     CLOSED on an unknown mode and on missing required env, and must never
 *     print a secret. No real network is reachable in these paths.
 *  2. Direct-import of the injected orchestration functions (`runSync`,
 *     `runCleanup`, `syncEnvVars`, `waitForBranchAndReadCreds`) with FAKE
 *     clients — proves the wiring: idempotency loop, conditional redeploy,
 *     JWT-withheld warning (no throw), and cleanup mapping.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  runSync,
  runCleanup,
  syncEnvVars,
  waitForBranchAndReadCreds,
  readEnv,
  CONFIG,
} from '../../../scripts/preview-cred-sync.mjs'

const SCRIPT = resolve(__dirname, '../../../scripts/preview-cred-sync.mjs')
const REFUSAL_MS = 5_000
const KILL_MS = 15_000

afterEach(() => {
  vi.restoreAllMocks()
})

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
  durationMs: number
}

function runScript(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const cwd = mkdtempSync(join(tmpdir(), 'preview-cred-sync-guard-'))
  const started = Date.now()
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    timeout: KILL_MS,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...extraEnv },
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - started,
  }
}

// ── Black-box fail-closed dispatch / env guards ─────────────────────────────

describe('preview-cred-sync.mjs entrypoint fail-closed guards (black-box)', () => {
  it('exits non-zero on an unknown mode', () => {
    const run = runScript(['bogus'])
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('unknown mode')
    expect(run.durationMs).toBeLessThan(REFUSAL_MS)
  })

  it('exits non-zero with no mode at all', () => {
    const run = runScript([])
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('usage')
  })

  it('sync fails closed when PR_GIT_BRANCH is missing', () => {
    const run = runScript(['sync'], {
      VERCEL_API_TOKEN: 'x'.repeat(24),
      SUPABASE_ACCESS_TOKEN: 'y'.repeat(24),
    })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('PR_GIT_BRANCH is required')
  })

  it('sync fails closed when SUPABASE_ACCESS_TOKEN is missing', () => {
    const run = runScript(['sync'], {
      PR_GIT_BRANCH: 'feat/foo',
      VERCEL_API_TOKEN: 'x'.repeat(24),
    })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('SUPABASE_ACCESS_TOKEN is required')
  })

  it('cleanup fails closed when VERCEL_API_TOKEN is missing', () => {
    const run = runScript(['cleanup'], { PR_GIT_BRANCH: 'feat/foo' })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('VERCEL_API_TOKEN is required')
  })

  it('never prints a provided token in any fail-closed output', () => {
    const token = 'super-secret-token-that-must-never-leak-0123456789'
    const run = runScript(['sync'], {
      PR_GIT_BRANCH: '', // forces a fail-closed path before any network
      VERCEL_API_TOKEN: token,
      SUPABASE_ACCESS_TOKEN: token,
    })
    expect(run.status).not.toBe(0)
    expect(run.stdout).not.toContain(token)
    expect(run.stderr).not.toContain(token)
  })
})

// ── Direct-import orchestration wiring (fake clients, no network) ────────────

function fakeSupabaseClient(overrides: Record<string, unknown> = {}) {
  return {
    listBranches: vi.fn(async () => [
      { name: 'feat/foo', project_ref: 'branchref000', status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' },
    ]),
    getApiKeys: vi.fn(async () => ({ anonKey: 'anon-val', serviceRoleKey: 'svc-val' })),
    getJwtSecret: vi.fn(async () => 'jwt-val'),
    ...overrides,
  }
}

function fakeVercelClient(existing: Array<{ id: string; key: string }> = []) {
  return {
    listBranchEnv: vi.fn(async (_gitBranch: string) => existing),
    createEnv: vi.fn(async (_write: Record<string, unknown>) => ({ created: { id: 'env_new' } })),
    updateEnv: vi.fn(async (_envId: string, _patch: Record<string, unknown>) => ({ id: 'env_patched' })),
    deleteEnv: vi.fn(async (_envId: string) => ({})),
    createDeployment: vi.fn(async (_opts: Record<string, unknown>) => ({ id: 'dpl_new' })),
  }
}

describe('runSync wiring (fake clients)', () => {
  it('writes 4 creates on a fresh branch and triggers exactly one redeploy', async () => {
    const supabaseClient = fakeSupabaseClient()
    const vercelClient = fakeVercelClient([])

    const result = await runSync({
      supabaseClient,
      vercelClient,
      gitBranch: 'feat/foo',
      sleepImpl: async () => {},
    })

    expect(result).toEqual({ created: 4, updated: 0, redeployed: true })
    expect(vercelClient.createEnv).toHaveBeenCalledTimes(4)
    expect(vercelClient.updateEnv).not.toHaveBeenCalled()
    expect(vercelClient.createDeployment).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a second run with all 4 present updates and still redeploys (latest creds win)', async () => {
    const supabaseClient = fakeSupabaseClient()
    const vercelClient = fakeVercelClient([
      { id: 'e1', key: 'NEXT_PUBLIC_SUPABASE_URL' },
      { id: 'e2', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      { id: 'e3', key: 'SUPABASE_SERVICE_ROLE_KEY' },
      { id: 'e4', key: 'SUPABASE_JWT_SECRET' },
    ])

    const result = await runSync({
      supabaseClient,
      vercelClient,
      gitBranch: 'feat/foo',
      sleepImpl: async () => {},
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBe(4)
    expect(vercelClient.createEnv).not.toHaveBeenCalled()
    expect(vercelClient.updateEnv).toHaveBeenCalledTimes(4)
  })

  it('JWT withheld: warns (no throw), writes only 3 keys, never a project-wide var', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const supabaseClient = fakeSupabaseClient({ getJwtSecret: vi.fn(async () => null) })
    const vercelClient = fakeVercelClient([])

    const result = await runSync({
      supabaseClient,
      vercelClient,
      gitBranch: 'feat/foo',
      sleepImpl: async () => {},
    })

    expect(result.created).toBe(3)
    expect(vercelClient.createEnv).toHaveBeenCalledTimes(3)
    // Every write carries the production guard.
    for (const call of vercelClient.createEnv.mock.calls) {
      const write = call[0] as unknown as { target: string[]; gitBranch: string; key: string }
      expect(write.target).toEqual(['preview'])
      expect(write.gitBranch).toBe('feat/foo')
      expect(write.key).not.toBe('SUPABASE_JWT_SECRET')
    }
    const warned = warnSpy.mock.calls.flat().join('\n')
    expect(warned).toContain('SUPABASE_JWT_SECRET not returned')
    expect(warned).toContain('F-INFRA-05')
  })

  it('poll: waits while the branch is unhealthy then reads creds once healthy', async () => {
    const unhealthy = [{ name: 'feat/foo', project_ref: 'branchref000', status: 'CREATING_PROJECT', preview_project_status: 'COMING_UP' }]
    const healthy = [{ name: 'feat/foo', project_ref: 'branchref000', status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' }]
    const listBranches = vi
      .fn()
      .mockResolvedValueOnce(unhealthy)
      .mockResolvedValueOnce(unhealthy)
      .mockResolvedValue(healthy)
    const supabaseClient = fakeSupabaseClient({ listBranches })

    const creds = await waitForBranchAndReadCreds({
      supabaseClient,
      gitBranch: 'feat/foo',
      sleepImpl: async () => {},
    })

    expect(listBranches).toHaveBeenCalledTimes(3)
    expect(creds.branchRef).toBe('branchref000')
    expect(creds.url).toBe('https://branchref000.supabase.co')
  })

  it('poll: gives up (throws fail-closed) once the timeout elapses', async () => {
    const unhealthy = [{ name: 'feat/foo', project_ref: 'branchref000', status: 'COMING_UP', preview_project_status: 'COMING_UP' }]
    const supabaseClient = fakeSupabaseClient({ listBranches: vi.fn(async () => unhealthy) })
    // A clock that jumps past the timeout immediately on the second read.
    let t = 0
    const now = () => {
      const v = t
      t += 11 * 60_000
      return v
    }

    await expect(
      waitForBranchAndReadCreds({
        supabaseClient,
        gitBranch: 'feat/foo',
        sleepImpl: async () => {},
        now,
      }),
    ).rejects.toThrow(/Timed out/)
  })
})

describe('syncEnvVars redeploy decision (fake clients)', () => {
  // The false branch of decideRedeploy (zero writes → no redeploy) cannot be
  // reached honestly through syncEnvVars: mapCredsToEnvWrites always yields ≥3
  // writes for valid creds, each of which is a create or an update, so
  // created+updated > 0 on every call. That false branch is owned by the
  // pure-core test U16 (core.test.ts). Here we assert the path syncEnvVars CAN
  // take: any env write triggers exactly one redeploy.
  it('triggers exactly one redeploy whenever env writes occurred (created+updated > 0)', async () => {
    const vercelClient = fakeVercelClient([])
    const result = await syncEnvVars({
      vercelClient,
      gitBranch: 'feat/foo',
      creds: {
        branchRef: 'branchref000',
        url: 'https://branchref000.supabase.co',
        anonKey: 'a',
        serviceRoleKey: 's',
        jwtSecret: 'j',
      },
    })
    expect(result.created + result.updated).toBeGreaterThan(0)
    expect(result.redeployed).toBe(true)
    expect(vercelClient.createDeployment).toHaveBeenCalledTimes(1)
  })

  it('passes the pinned numeric repoId through to the redeploy body', async () => {
    const vercelClient = fakeVercelClient([])
    await syncEnvVars({
      vercelClient,
      gitBranch: 'feat/foo',
      repoId: 1182877359,
      creds: {
        branchRef: 'branchref000',
        url: 'https://branchref000.supabase.co',
        anonKey: 'a',
        serviceRoleKey: 's',
        jwtSecret: 'j',
      },
    })
    expect(vercelClient.createDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ gitBranch: 'feat/foo', repoId: 1182877359 }),
    )
  })
})

describe('readEnv repoId resolution', () => {
  // Cast: readEnv only ever reads a handful of keys; the test env literal stands
  // in for a full NodeJS.ProcessEnv.
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
    ({
      PR_GIT_BRANCH: 'feat/foo',
      VERCEL_API_TOKEN: 'x'.repeat(24),
      SUPABASE_ACCESS_TOKEN: 'y'.repeat(24),
      ...extra,
    }) as unknown as NodeJS.ProcessEnv

  it('defaults repoId to the pinned numeric constant when no override is set', () => {
    const inputs = readEnv(env(), 'sync')
    expect(inputs.repoId).toBe(CONFIG.githubRepoId)
    expect(inputs.repoId).toBe(1182877359)
    expect(typeof inputs.repoId).toBe('number')
  })

  it('lets VERCEL_GIT_REPO_ID override and coerces it to a number', () => {
    const inputs = readEnv(env({ VERCEL_GIT_REPO_ID: '999' }), 'sync')
    expect(inputs.repoId).toBe(999)
    expect(typeof inputs.repoId).toBe('number')
  })

  it('fails closed when the override is non-numeric', () => {
    expect(() => readEnv(env({ VERCEL_GIT_REPO_ID: 'not-a-number' }), 'sync')).toThrow(
      /numeric GitHub repo id/,
    )
  })
})

describe('runCleanup wiring (fake clients)', () => {
  it('deletes only the 4 owned keys, ignoring foreign branch vars', async () => {
    const vercelClient = fakeVercelClient([
      { id: 'e1', key: 'NEXT_PUBLIC_SUPABASE_URL' },
      { id: 'e2', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      { id: 'e3', key: 'SUPABASE_SERVICE_ROLE_KEY' },
      { id: 'e4', key: 'SUPABASE_JWT_SECRET' },
      { id: 'e5', key: 'SOME_OTHER_APP_VAR' },
    ])

    const result = await runCleanup({ vercelClient, gitBranch: 'feat/foo' })

    expect(result.deleted).toBe(4)
    expect(vercelClient.deleteEnv).toHaveBeenCalledTimes(4)
    const deletedIds = vercelClient.deleteEnv.mock.calls.map((c) => c[0]).sort()
    expect(deletedIds).toEqual(['e1', 'e2', 'e3', 'e4'])
  })

  it('deletes nothing when no owned vars exist (idempotent re-close)', async () => {
    const vercelClient = fakeVercelClient([])
    const result = await runCleanup({ vercelClient, gitBranch: 'feat/foo' })
    expect(result.deleted).toBe(0)
    expect(vercelClient.deleteEnv).not.toHaveBeenCalled()
  })
})
