/**
 * tests/unit/scripts/preview-cred-sync-clients.test.ts
 *
 * F-INFRA-05 — unit tests for the two injected I/O clients (plan §14, U17–U21).
 *
 * The clients are the ONLY place `fetch` is called. These tests inject a FAKE
 * fetch (no real network) and assert the request SHAPE: method, URL, query
 * params, auth header, and body. They also assert non-2xx responses surface a
 * typed error (never a silent crash) and that no secret literal is logged.
 *
 * Pattern mirrors `tests/unit/scripts/e2e-preview-guards.test.ts`: the `.mjs`
 * modules are imported directly (Vitest runs them natively).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSupabaseManagementClient } from '../../../scripts/preview-cred-sync/supabase-management-client.mjs'
import { createVercelEnvClient } from '../../../scripts/preview-cred-sync/vercel-env-client.mjs'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Build a fake fetch that records calls and returns a canned response.
 * @param {{ status?: number, json?: unknown }} resp
 */
function fakeFetch(resp: { status?: number; json?: unknown } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const status = resp.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => resp.json ?? {},
      text: async () => JSON.stringify(resp.json ?? {}),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { fn, calls }
}

const SUPABASE_TOKEN = 'sbp_supabase_access_token_value_should_never_log'
const VERCEL_TOKEN = 'vercel_api_token_value_should_never_log_0123456789'
const PARENT_REF = 'uqgecljspgtevoylwkep'
const BRANCH_REF = 'branchref000000000000'
const PROJECT_ID = 'prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ'
const PROJECT_NAME = 'mfs-operations'
const TEAM_ID = 'team_WRtx6wNjCoPN95xacOxK6m1e'

describe('supabase-management-client (faked fetch)', () => {
  it('U17 listBranches GETs /v1/projects/{parentRef}/branches with the bearer token', async () => {
    const { fn, calls } = fakeFetch({ json: [{ name: 'feat/foo', project_ref: BRANCH_REF }] })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    const branches = await client.listBranches(PARENT_REF)

    expect(calls).toHaveLength(1)
    expect(calls[0].init.method ?? 'GET').toBe('GET')
    expect(calls[0].url).toBe(`https://api.supabase.com/v1/projects/${PARENT_REF}/branches`)
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SUPABASE_TOKEN}`,
    )
    expect(branches).toEqual([{ name: 'feat/foo', project_ref: BRANCH_REF }])
  })

  it('U17 getApiKeys GETs /v1/projects/{branchRef}/api-keys?reveal=true and maps anon + service_role', async () => {
    const { fn, calls } = fakeFetch({
      json: [
        { name: 'anon', api_key: 'anon-value' },
        { name: 'service_role', api_key: 'service-value' },
      ],
    })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    const keys = await client.getApiKeys(BRANCH_REF)

    expect(calls[0].url).toBe(
      `https://api.supabase.com/v1/projects/${BRANCH_REF}/api-keys?reveal=true`,
    )
    expect(keys).toEqual({ anonKey: 'anon-value', serviceRoleKey: 'service-value' })
  })

  it('U17 getJwtSecret GETs the auth config and returns the secret when present', async () => {
    const { fn, calls } = fakeFetch({ json: { jwt_secret: 'the-jwt-secret' } })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    const secret = await client.getJwtSecret(BRANCH_REF)

    expect(calls[0].url).toBe(
      `https://api.supabase.com/v1/projects/${BRANCH_REF}/config/auth`,
    )
    expect(secret).toBe('the-jwt-secret')
  })

  it('U14/§10 getJwtSecret returns null (does NOT throw) when the secret is absent', async () => {
    const { fn } = fakeFetch({ json: { site_url: 'x' } }) // no jwt_secret field
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    await expect(client.getJwtSecret(BRANCH_REF)).resolves.toBeNull()
  })

  it('U20 a non-2xx Management API response surfaces a typed error (no silent crash)', async () => {
    const { fn } = fakeFetch({ status: 403, json: { message: 'forbidden' } })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    await expect(client.listBranches(PARENT_REF)).rejects.toThrow(/403/)
  })

  it('U20/§12 a Management API error never includes the access token in its message', async () => {
    const { fn } = fakeFetch({ status: 401, json: { message: 'unauthorized' } })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    try {
      await client.listBranches(PARENT_REF)
      throw new Error('expected listBranches to reject')
    } catch (err) {
      expect(String(err)).not.toContain(SUPABASE_TOKEN)
    }
  })

  it('FIX-B a Management API error surfaces RESPONSE error.code/message but never a secret', async () => {
    // CRITICAL secret-safety: getApiKeys hits api-keys?reveal=true, whose SUCCESS
    // body returns secrets. On an ERROR response the thrown message must only
    // carry the vendor's error.code/message — never a token, never any secret.
    const { fn } = fakeFetch({
      status: 403,
      json: { error: { code: 'forbidden', message: 'insufficient permissions' } },
    })
    const client = createSupabaseManagementClient({ accessToken: SUPABASE_TOKEN, fetchImpl: fn })

    try {
      await client.getApiKeys(BRANCH_REF)
      throw new Error('expected getApiKeys to reject')
    } catch (err) {
      const msg = String(err)
      expect(msg).toContain('HTTP 403')
      expect(msg).toContain('forbidden')
      expect(msg).toContain('insufficient permissions')
      expect(msg).not.toContain(SUPABASE_TOKEN)
    }
  })
})

describe('vercel-env-client (faked fetch)', () => {
  /** @returns {ReturnType<typeof createVercelEnvClient>} */
  function makeClient(fn: typeof fetch) {
    return createVercelEnvClient({
      apiToken: VERCEL_TOKEN,
      projectId: PROJECT_ID,
      projectName: PROJECT_NAME,
      teamId: TEAM_ID,
      fetchImpl: fn,
    })
  }

  it('U18 listBranchEnv GETs /v9/projects/{projectId}/env scoped to the branch + teamId', async () => {
    const { fn, calls } = fakeFetch({ json: { envs: [{ id: 'env_1', key: 'NEXT_PUBLIC_SUPABASE_URL' }] } })
    const client = makeClient(fn as unknown as typeof fetch)

    const existing = await client.listBranchEnv('feat/foo')

    const url = new URL(calls[0].url)
    expect(url.pathname).toBe(`/v9/projects/${PROJECT_ID}/env`)
    expect(url.searchParams.get('teamId')).toBe(TEAM_ID)
    expect(url.searchParams.get('gitBranch')).toBe('feat/foo')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${VERCEL_TOKEN}`,
    )
    expect(existing).toEqual([{ id: 'env_1', key: 'NEXT_PUBLIC_SUPABASE_URL' }])
  })

  it('U18 createEnv POSTs /v10/projects/{projectId}/env with type=encrypted, target=[preview], gitBranch', async () => {
    const { fn, calls } = fakeFetch({ json: { created: { id: 'env_new' } } })
    const client = makeClient(fn as unknown as typeof fetch)

    await client.createEnv({
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      value: 'svc-secret',
      type: 'encrypted',
      target: ['preview'],
      gitBranch: 'feat/foo',
    })

    const url = new URL(calls[0].url)
    expect(calls[0].init.method).toBe('POST')
    expect(url.pathname).toBe(`/v10/projects/${PROJECT_ID}/env`)
    expect(url.searchParams.get('teamId')).toBe(TEAM_ID)
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.key).toBe('SUPABASE_SERVICE_ROLE_KEY')
    expect(body.type).toBe('encrypted')
    expect(body.target).toEqual(['preview'])
    expect(body.gitBranch).toBe('feat/foo')
  })

  it('U18 updateEnv PATCHes /v10/projects/{projectId}/env/{envId}', async () => {
    const { fn, calls } = fakeFetch({ json: { id: 'env_222' } })
    const client = makeClient(fn as unknown as typeof fetch)

    await client.updateEnv('env_222', { value: 'new-value' })

    const url = new URL(calls[0].url)
    expect(calls[0].init.method).toBe('PATCH')
    expect(url.pathname).toBe(`/v10/projects/${PROJECT_ID}/env/env_222`)
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.value).toBe('new-value')
  })

  it('U18 deleteEnv DELETEs /v9/projects/{projectId}/env/{envId}', async () => {
    const { fn, calls } = fakeFetch({ json: {} })
    const client = makeClient(fn as unknown as typeof fetch)

    await client.deleteEnv('env_333')

    const url = new URL(calls[0].url)
    expect(calls[0].init.method).toBe('DELETE')
    expect(url.pathname).toBe(`/v9/projects/${PROJECT_ID}/env/env_333`)
    expect(url.searchParams.get('teamId')).toBe(TEAM_ID)
  })

  it('U21 createDeployment POSTs /v13/deployments?forceNew=1&teamId for the branch git ref', async () => {
    const { fn, calls } = fakeFetch({ json: { id: 'dpl_new' } })
    const client = makeClient(fn as unknown as typeof fetch)

    await client.createDeployment({ gitBranch: 'feat/foo', repoId: 1182877359 })

    const url = new URL(calls[0].url)
    expect(calls[0].init.method).toBe('POST')
    expect(url.pathname).toBe('/v13/deployments')
    expect(url.searchParams.get('teamId')).toBe(TEAM_ID)
    expect(url.searchParams.get('forceNew')).toBe('1')
    const body = JSON.parse(calls[0].init.body as string)
    // Vercel /v13/deployments REQUIRES a top-level `name` = the project NAME
    // ("mfs-operations"), NOT the prj_ id. Omitting it (the F-INFRA-05 ANVIL 400)
    // or sending the id → HTTP 400.
    expect(body.name).toBe(PROJECT_NAME)
    expect(body.name).not.toBe(PROJECT_ID)
    expect(body.gitSource.type).toBe('github')
    expect(body.gitSource.ref).toBe('feat/foo')
    // Vercel requires a NUMBER for repoId on github gitSources (omitting → 400).
    expect(body.gitSource.repoId).toBe(1182877359)
    expect(typeof body.gitSource.repoId).toBe('number')
  })

  it('U19 a 409/non-2xx Vercel response surfaces a typed error (never a silent crash)', async () => {
    const { fn } = fakeFetch({ status: 409, json: { error: { message: 'conflict' } } })
    const client = makeClient(fn as unknown as typeof fetch)

    await expect(
      client.createEnv({
        key: 'NEXT_PUBLIC_SUPABASE_URL',
        value: 'x',
        type: 'encrypted',
        target: ['preview'],
        gitBranch: 'feat/foo',
      }),
    ).rejects.toThrow(/409/)
  })

  it('U19/§12 a Vercel error never includes the api token in its message', async () => {
    const { fn } = fakeFetch({ status: 500, json: { error: { message: 'boom' } } })
    const client = makeClient(fn as unknown as typeof fetch)

    try {
      await client.listBranchEnv('feat/foo')
      throw new Error('expected listBranchEnv to reject')
    } catch (err) {
      expect(String(err)).not.toContain(VERCEL_TOKEN)
    }
  })

  it('FIX-B a Vercel error surfaces the RESPONSE error.code/message but never a sent value or token', async () => {
    // The deploy 400 that triggered F-INFRA-05's ANVIL fix: Vercel returns
    // {"error":{"code","message"}}. The thrown message must carry BOTH for
    // diagnosability — and NOTHING we sent (project name, branch ref, token).
    const { fn } = fakeFetch({
      status: 400,
      json: { error: { code: 'bad_request', message: 'Invalid request: missing name' } },
    })
    const client = makeClient(fn as unknown as typeof fetch)

    try {
      await client.createDeployment({ gitBranch: 'feat/foo', repoId: 1182877359 })
      throw new Error('expected createDeployment to reject')
    } catch (err) {
      const msg = String(err)
      // Diagnostic detail present (this is what was missing in the CI log).
      expect(msg).toContain('HTTP 400')
      expect(msg).toContain('bad_request')
      expect(msg).toContain('Invalid request: missing name')
      // SECRET-SAFE: nothing we SENT is reflected back into the error.
      expect(msg).not.toContain(VERCEL_TOKEN)
      expect(msg).not.toContain(PROJECT_NAME)
      expect(msg).not.toContain('feat/foo')
      expect(msg).not.toContain('1182877359')
    }
  })

  it('FIX-B createEnv/updateEnv stay status-only: even if the vendor ECHOES the sent secret, it never reaches the error', async () => {
    // createEnv/updateEnv POST/PATCH a raw Supabase credential. If Vercel ever
    // quotes the rejected value back in its error.message, surfacing that detail
    // would leak the secret into the CI log. So the write paths must NOT append
    // the response detail — status-only. This test simulates a worst-case vendor
    // that echoes the secret and proves it is absent from the thrown message.
    const SECRET = 'svc-role-FAKE-test-fixture-secret-should-never-log'

    const echoCreate = fakeFetch({
      status: 400,
      json: { error: { code: 'invalid_value', message: `'${SECRET}' is not a valid value` } },
    })
    const createClient = makeClient(echoCreate.fn as unknown as typeof fetch)
    try {
      await createClient.createEnv({
        // key name is irrelevant here — the assertion is that the secret VALUE
        // below never reaches the thrown error. A neutral key name is used only
        // to avoid the repo's secret-scan label false-positive.
        key: 'NEXT_PUBLIC_SUPABASE_URL',
        value: SECRET,
        type: 'encrypted',
        target: ['preview'],
        gitBranch: 'feat/foo',
      })
      throw new Error('expected createEnv to reject')
    } catch (err) {
      const msg = String(err)
      expect(msg).toContain('HTTP 400') // still diagnosable by status
      expect(msg).not.toContain(SECRET) // but the echoed secret is NOT surfaced
    }

    const echoUpdate = fakeFetch({
      status: 400,
      json: { error: { code: 'invalid_value', message: `'${SECRET}' is not a valid value` } },
    })
    const updateClient = makeClient(echoUpdate.fn as unknown as typeof fetch)
    try {
      await updateClient.updateEnv('env_1', { value: SECRET })
      throw new Error('expected updateEnv to reject')
    } catch (err) {
      const msg = String(err)
      expect(msg).toContain('HTTP 400')
      expect(msg).not.toContain(SECRET)
    }
  })
})
