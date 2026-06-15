/**
 * scripts/preview-cred-sync/vercel-env-client.mjs
 *
 * F-INFRA-05 — injected I/O client for the Vercel REST API.
 *
 * The ONLY place Vercel REST API HTTP calls live. A thin wrapper over an
 * injected `fetch` (fake fetch in unit tests → zero real network). Owns env-var
 * list/create/update/delete and the redeploy. Never logs a secret value, never
 * puts the api token in an error message (plan §7, §8, §9, §12).
 *
 * Endpoints confirmed against the live Vercel REST API docs (plan §7):
 *   - list   GET    /v9/projects/{projectId}/env?gitBranch=&teamId=
 *   - create POST   /v10/projects/{projectId}/env?teamId=
 *   - update PATCH  /v10/projects/{projectId}/env/{envId}?teamId=
 *   - delete DELETE /v9/projects/{projectId}/env/{envId}?teamId=
 *   - deploy POST   /v13/deployments?forceNew=1&teamId=
 *
 * 🗣 The robot's other hand — the one that writes the sticky-note passwords into
 *    Vercel and asks it to rebuild the preview.
 */

import { describeErrorBody } from './redact.mjs'

const BASE = 'https://api.vercel.com'

/**
 * @param {{ apiToken: string, projectId: string, projectName: string, teamId: string, fetchImpl?: typeof fetch }} opts
 */
export function createVercelEnvClient({ apiToken, projectId, projectName, teamId, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch

  /**
   * @param {string} pathname
   * @param {Record<string, string>} [extraQuery]
   * @returns {string}
   */
  function url(pathname, extraQuery = {}) {
    const u = new URL(`${BASE}${pathname}`)
    u.searchParams.set('teamId', teamId)
    for (const [k, v] of Object.entries(extraQuery)) u.searchParams.set(k, v)
    return u.toString()
  }

  /**
   * @param {string} fullUrl
   * @param {RequestInit} init
   * @param {string} label
   * @param {{ safeBody?: boolean }} [opts]
   *   safeBody — opt-in to appending the RESPONSE's error.code/message to the
   *   thrown error. ONLY pass true for calls whose REQUEST body carries NO secret
   *   (deploy, list, delete). createEnv/updateEnv POST/PATCH a raw Supabase
   *   credential, so they must stay status-only: if Vercel ever echoes the
   *   rejected value back in its error, surfacing it would leak the secret into
   *   the CI log — the exact thing redact.mjs exists to prevent.
   * @returns {Promise<any>}
   */
  async function request(fullUrl, init, label, { safeBody = false } = {}) {
    const res = await doFetch(fullUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      // Status + label always. The vendor error.code/message detail is appended
      // ONLY for non-secret-bearing calls (safeBody) — never the token, never the
      // request body, never a value we sent.
      const detail = safeBody ? await describeErrorBody(res) : ''
      throw new Error(`Vercel API ${label} failed: HTTP ${res.status}${detail}`)
    }
    return res.json()
  }

  return {
    /**
     * List the branch-scoped Preview env vars (id + key only needed).
     * @param {string} gitBranch
     * @returns {Promise<Array<{ id: string, key: string }>>}
     */
    async listBranchEnv(gitBranch) {
      const data = await request(
        url(`/v9/projects/${projectId}/env`, { gitBranch, decrypt: 'false' }),
        { method: 'GET' },
        'listBranchEnv',
        { safeBody: true }, // GET — no secret in the request body.
      )
      const envs = Array.isArray(data?.envs) ? data.envs : Array.isArray(data) ? data : []
      return envs.map((e) => ({ id: e.id, key: e.key }))
    },

    /**
     * Create a new branch-scoped Preview env var.
     * @param {{ key: string, value: string, type: 'encrypted', target: ['preview'], gitBranch: string }} envWrite
     * @returns {Promise<any>}
     */
    async createEnv(envWrite) {
      return request(
        url(`/v10/projects/${projectId}/env`),
        { method: 'POST', body: JSON.stringify(envWrite) },
        'createEnv',
      )
    },

    /**
     * Update an existing env var's value by its id (idempotent path).
     * @param {string} envId
     * @param {{ value: string }} patch
     * @returns {Promise<any>}
     */
    async updateEnv(envId, patch) {
      return request(
        url(`/v10/projects/${projectId}/env/${envId}`),
        { method: 'PATCH', body: JSON.stringify(patch) },
        'updateEnv',
      )
    },

    /**
     * Delete a branch-scoped env var (cleanup path).
     * @param {string} envId
     * @returns {Promise<any>}
     */
    async deleteEnv(envId) {
      return request(
        url(`/v9/projects/${projectId}/env/${envId}`),
        { method: 'DELETE' },
        'deleteEnv',
        { safeBody: true }, // DELETE by id — no secret in the request body.
      )
    },

    /**
     * Trigger a fresh Preview deployment for the PR's git branch (the redeploy
     * after the vars are in place — plan §9). `forceNew=1` so Vercel does not
     * dedupe against the previous (credential-less) build.
     * @param {{ gitBranch: string, repoId?: number }} opts
     * @returns {Promise<any>}
     */
    async createDeployment({ gitBranch, repoId }) {
      const body = {
        // Vercel /v13/deployments REQUIRES a top-level `name` = the project NAME
        // (e.g. "mfs-operations"), NOT the prj_ id. Omitting it (or sending the
        // id) → HTTP 400. Confirmed against the live Vercel deploy 400 (F-INFRA-05
        // ANVIL run on PR #39) and the REST docs.
        name: projectName,
        gitSource: {
          type: 'github',
          ref: gitBranch,
          // Vercel requires a numeric repoId for github gitSources; the caller
          // always supplies it (pinned constant or env override).
          ...(repoId !== undefined ? { repoId } : {}),
        },
      }
      return request(
        url('/v13/deployments', { forceNew: '1' }),
        { method: 'POST', body: JSON.stringify(body) },
        'createDeployment',
        // The deploy body is only name + gitSource (project name, branch ref,
        // numeric repoId) — all non-secret public identifiers — so the vendor
        // error detail is safe to surface. This is the call the F-INFRA-05 ANVIL
        // 400 came from, and the detail is what made it undiagnosable.
        { safeBody: true },
      )
    },
  }
}
