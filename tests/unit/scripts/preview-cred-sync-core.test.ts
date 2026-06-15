/**
 * tests/unit/scripts/preview-cred-sync-core.test.ts
 *
 * F-INFRA-05 — unit tests for the PURE CORE of the preview cred-sync tooling
 * (plan §14, U1–U16) plus the secret-safe `redact` helper.
 *
 * The core (`scripts/preview-cred-sync/core.mjs`) makes every decision the sync
 * needs — branch matching, health, poll backoff, cred→env mapping, create-vs-
 * update, JWT-withheld handling, redeploy-yes/no — with ZERO network and ZERO
 * `process` access, so it is tested here with no mocking at all.
 *
 * These tests import the `.mjs` modules directly, the same pattern as
 * `tests/unit/scripts/e2e-preview-guards.test.ts` (Vitest runs `.mjs` natively).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { redact, log } from '../../../scripts/preview-cred-sync/redact.mjs'
import {
  matchBranchByName,
  isBranchHealthy,
  nextPollDelayMs,
  pollDecision,
  deriveSupabaseUrl,
  mapCredsToEnvWrites,
  decideEnvAction,
  jwtPlan,
  decideRedeploy,
} from '../../../scripts/preview-cred-sync/core.mjs'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── U1/U2 · redact + secret-safe logging ───────────────────────────────────

describe('redact', () => {
  it('U1 masks the value, reporting length only — never the raw secret', () => {
    const secret = 'sb-service-role-super-secret-value-0123456789'
    const out = redact(secret)
    expect(out).toBe(`<redacted:${secret.length} chars>`)
    expect(out).not.toContain(secret)
    expect(out).not.toContain('secret')
  })

  it('U1 handles absent values without leaking', () => {
    expect(redact(undefined)).toBe('<redacted:absent>')
    expect(redact(null)).toBe('<redacted:absent>')
  })
})

describe('log secret-safety', () => {
  it('U2 never emits a known secret literal when the caller only passes redacted fields', () => {
    const secret = 'super-secret-value-that-must-never-leak-0123456789'
    const spies = {
      info: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    // Correct usage: the value is redacted BEFORE it reaches the logger.
    log.info('wrote env var', { key: 'SUPABASE_SERVICE_ROLE_KEY', value: redact(secret) })
    log.warn('something', { token: redact(secret) })
    log.error('boom', { detail: redact(secret) })

    const allOutput = [
      ...spies.info.mock.calls,
      ...spies.warn.mock.calls,
      ...spies.error.mock.calls,
    ]
      .flat()
      .join('\n')

    expect(allOutput).not.toContain(secret)
    expect(allOutput).toContain('<redacted:')
    expect(allOutput).toContain('[preview-cred-sync]')
  })
})

// ── U3/U4 · branch matching ─────────────────────────────────────────────────

describe('matchBranchByName', () => {
  const branches = [
    { name: 'main', project_ref: 'parentref0000000000' },
    { name: 'feat/foo', project_ref: 'foorefaaaaaaaaaaaaaa' },
    { name: 'feat/bar', project_ref: 'barrefbbbbbbbbbbbbbb' },
  ]

  it('U3 returns the branch whose name exactly matches the git ref', () => {
    expect(matchBranchByName(branches, 'feat/foo')).toEqual(branches[1])
  })

  it('U4 returns null when no branch name matches', () => {
    expect(matchBranchByName(branches, 'feat/missing')).toBeNull()
  })

  it('U4 picks the correct branch even when several exist', () => {
    expect(matchBranchByName(branches, 'feat/bar')).toEqual(branches[2])
  })

  it('U4 returns null on empty / nullish input rather than throwing', () => {
    expect(matchBranchByName([], 'feat/foo')).toBeNull()
    expect(matchBranchByName(undefined, 'feat/foo')).toBeNull()
    expect(matchBranchByName(branches, '')).toBeNull()
  })
})

// ── U5 · health ─────────────────────────────────────────────────────────────

describe('isBranchHealthy', () => {
  it('U5 true only when ACTIVE_HEALTHY AND FUNCTIONS_DEPLOYED', () => {
    expect(
      isBranchHealthy({ status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' }),
    ).toBe(true)
  })

  it('U5 false for any other status combination', () => {
    expect(
      isBranchHealthy({ status: 'CREATING_PROJECT', preview_project_status: 'COMING_UP' }),
    ).toBe(false)
    expect(
      isBranchHealthy({ status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'COMING_UP' }),
    ).toBe(false)
    expect(
      isBranchHealthy({ status: 'MIGRATIONS_FAILED', preview_project_status: 'ACTIVE_HEALTHY' }),
    ).toBe(false)
    expect(isBranchHealthy(null)).toBe(false)
    expect(isBranchHealthy({})).toBe(false)
  })
})

// ── U6/U7 · poll backoff + decision ─────────────────────────────────────────

describe('nextPollDelayMs', () => {
  it('U6 backoff is monotonic non-decreasing and capped', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => nextPollDelayMs(n))
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
    }
    // Capped at ~20s.
    expect(Math.max(...delays)).toBeLessThanOrEqual(20_000)
    // Never returns below the floor.
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(5_000)
  })

  it('U6 respects a custom cap', () => {
    const d = nextPollDelayMs(100, { capMs: 8_000 })
    expect(d).toBeLessThanOrEqual(8_000)
  })
})

describe('pollDecision', () => {
  it('U7 ready when the branch is healthy', () => {
    const branch = { status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' }
    expect(pollDecision(branch, { attempt: 0, elapsedMs: 0 })).toBe('ready')
  })

  it('U7 wait while unhealthy and under the timeout', () => {
    const branch = { status: 'CREATING_PROJECT', preview_project_status: 'COMING_UP' }
    expect(pollDecision(branch, { attempt: 1, elapsedMs: 10_000 })).toBe('wait')
    // Missing branch (not created yet) is also a wait while under timeout.
    expect(pollDecision(null, { attempt: 0, elapsedMs: 0 })).toBe('wait')
  })

  it('U7 giveup once the elapsed time passes the total timeout', () => {
    const branch = { status: 'CREATING_PROJECT', preview_project_status: 'COMING_UP' }
    expect(pollDecision(branch, { attempt: 50, elapsedMs: 11 * 60_000 })).toBe('giveup')
    expect(pollDecision(null, { attempt: 50, elapsedMs: 11 * 60_000 })).toBe('giveup')
  })

  it('U7 ready wins even if the timeout has passed (healthy beats giveup)', () => {
    const branch = { status: 'FUNCTIONS_DEPLOYED', preview_project_status: 'ACTIVE_HEALTHY' }
    expect(pollDecision(branch, { attempt: 99, elapsedMs: 99 * 60_000 })).toBe('ready')
  })
})

// ── U8/U9 · cred→env mapping + URL derivation ───────────────────────────────

describe('deriveSupabaseUrl', () => {
  it('U9 derives https://{branch_ref}.supabase.co', () => {
    expect(deriveSupabaseUrl('foorefaaaaaaaaaaaaaa')).toBe(
      'https://foorefaaaaaaaaaaaaaa.supabase.co',
    )
  })
})

describe('mapCredsToEnvWrites', () => {
  const creds = {
    branchRef: 'foorefaaaaaaaaaaaaaa',
    url: 'https://foorefaaaaaaaaaaaaaa.supabase.co',
    anonKey: 'anon-key-value',
    serviceRoleKey: 'service-role-value',
    jwtSecret: 'jwt-secret-value',
  }

  it('U8 produces exactly the 4 keys with type=encrypted, target=[preview], correct gitBranch', () => {
    const writes = mapCredsToEnvWrites(creds, 'feat/foo')
    expect(writes).toHaveLength(4)
    const keys = writes.map((w) => w.key).sort()
    expect(keys).toEqual(
      [
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_JWT_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY',
      ].sort(),
    )
    for (const w of writes) {
      expect(w.type).toBe('encrypted')
      expect(w.target).toEqual(['preview'])
      expect(w.gitBranch).toBe('feat/foo')
      expect(typeof w.value).toBe('string')
      expect(w.value.length).toBeGreaterThan(0)
    }
  })

  it('U8 maps each value from the correct source', () => {
    const writes = mapCredsToEnvWrites(creds, 'feat/foo')
    const byKey = Object.fromEntries(writes.map((w) => [w.key, w.value]))
    expect(byKey.NEXT_PUBLIC_SUPABASE_URL).toBe(creds.url)
    expect(byKey.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(creds.anonKey)
    expect(byKey.SUPABASE_SERVICE_ROLE_KEY).toBe(creds.serviceRoleKey)
    expect(byKey.SUPABASE_JWT_SECRET).toBe(creds.jwtSecret)
  })

  it('U8/U14 omits the JWT key when the secret is absent (3-key path, no throw)', () => {
    const writes = mapCredsToEnvWrites({ ...creds, jwtSecret: null }, 'feat/foo')
    expect(writes).toHaveLength(3)
    expect(writes.map((w) => w.key)).not.toContain('SUPABASE_JWT_SECRET')
    // Every write still carries the production guard.
    for (const w of writes) {
      expect(w.target).toEqual(['preview'])
      expect(w.gitBranch).toBe('feat/foo')
    }
  })

  it('R5 guard: never emits a write without target=[preview] and a non-empty gitBranch', () => {
    const writes = mapCredsToEnvWrites(creds, 'feat/foo')
    for (const w of writes) {
      expect(w.target).toEqual(['preview'])
      expect(w.gitBranch).toBeTruthy()
    }
  })

  it('R5 guard: refuses to map when gitBranch is empty (fail closed, never a project-wide write)', () => {
    expect(() => mapCredsToEnvWrites(creds, '')).toThrow()
  })
})

// ── U10/U11/U12 · idempotency decision ──────────────────────────────────────

describe('decideEnvAction', () => {
  it('U10 create when no existing var has that key for the branch', () => {
    const action = decideEnvAction([], { key: 'NEXT_PUBLIC_SUPABASE_URL' })
    expect(action).toEqual({ action: 'create' })
  })

  it('U11 update (with the right envId) when a var with that key already exists', () => {
    const existing = [
      { id: 'env_111', key: 'NEXT_PUBLIC_SUPABASE_URL' },
      { id: 'env_222', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    ]
    const action = decideEnvAction(existing, { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' })
    expect(action).toEqual({ action: 'update', envId: 'env_222' })
  })

  it('U12 the 4-key set converges with no duplicates across a full pass', () => {
    // Two of the four already exist; expect 2 creates + 2 updates, no dup keys.
    const existing = [
      { id: 'env_url', key: 'NEXT_PUBLIC_SUPABASE_URL' },
      { id: 'env_anon', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    ]
    const desired = [
      { key: 'NEXT_PUBLIC_SUPABASE_URL' },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      { key: 'SUPABASE_SERVICE_ROLE_KEY' },
      { key: 'SUPABASE_JWT_SECRET' },
    ]
    const actions = desired.map((d) => decideEnvAction(existing, d))
    expect(actions.filter((a) => a.action === 'create')).toHaveLength(2)
    expect(actions.filter((a) => a.action === 'update')).toHaveLength(2)
    // Updates target the existing ids, never invent new ones.
    const updates = actions.filter((a) => a.action === 'update')
    expect(updates.map((a) => a.envId).sort()).toEqual(['env_anon', 'env_url'])
  })
})

// ── U13/U14 · JWT plan ──────────────────────────────────────────────────────

describe('jwtPlan', () => {
  it('U13 present → write, no warn', () => {
    expect(jwtPlan({ jwtSecret: 'abc' })).toEqual({ write: true, warn: false })
  })

  it('U14 absent → warn, no write, and DOES NOT THROW', () => {
    expect(() => jwtPlan({ jwtSecret: null })).not.toThrow()
    expect(jwtPlan({ jwtSecret: null })).toEqual({ write: false, warn: true })
    expect(jwtPlan({})).toEqual({ write: false, warn: true })
    expect(jwtPlan({ jwtSecret: '' })).toEqual({ write: false, warn: true })
  })
})

// ── U15/U16 · redeploy decision ─────────────────────────────────────────────

describe('decideRedeploy', () => {
  it('U15 true when at least one create or update happened', () => {
    expect(decideRedeploy({ created: 1, updated: 0 })).toBe(true)
    expect(decideRedeploy({ created: 0, updated: 3 })).toBe(true)
    expect(decideRedeploy({ created: 2, updated: 2 })).toBe(true)
  })

  it('U16 false on a full no-op run (nothing changed)', () => {
    expect(decideRedeploy({ created: 0, updated: 0 })).toBe(false)
    expect(decideRedeploy({})).toBe(false)
  })
})
