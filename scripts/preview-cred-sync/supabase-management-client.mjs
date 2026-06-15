/**
 * scripts/preview-cred-sync/supabase-management-client.mjs
 *
 * F-INFRA-05 — injected I/O client for the Supabase Management API.
 *
 * The ONLY place Supabase Management API HTTP calls live. A thin wrapper over a
 * `fetch` implementation that is injected (so unit tests pass a fake fetch and
 * make zero real network calls). Returns plain mapped objects in the app's own
 * shape; vendor response fields never leak past this boundary. Never logs a
 * secret value, and never puts the access token in an error message (plan §7,
 * §12).
 *
 * 🗣 One of the robot's two hands — the one that phones Supabase's settings desk.
 *    Endpoints confirmed against the live Management API docs (plan §7).
 */

import { describeErrorBody } from './redact.mjs'

const BASE = 'https://api.supabase.com'

/**
 * @param {{ accessToken: string, fetchImpl?: typeof fetch }} opts
 */
export function createSupabaseManagementClient({ accessToken, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch

  /**
   * @param {string} path
   * @returns {Promise<any>}
   */
  async function get(path) {
    const res = await doFetch(`${BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      // SECRET-SAFE diagnostics: path + status + ONLY the RESPONSE's
      // error.code/message (never the token, never any value we sent). This runs
      // exclusively on a non-OK response, so the secret-bearing SUCCESS body of
      // api-keys?reveal=true is never read here; describeErrorBody also extracts
      // specific fields rather than dumping the body.
      throw new Error(`Supabase Management API ${path} failed: HTTP ${res.status}${await describeErrorBody(res)}`)
    }
    return res.json()
  }

  return {
    /**
     * List all preview branches of the parent project.
     * GET /v1/projects/{parentRef}/branches
     * @param {string} parentRef
     * @returns {Promise<Array<{ name: string, project_ref: string, status?: string, preview_project_status?: string }>>}
     */
    async listBranches(parentRef) {
      const branches = await get(`/v1/projects/${parentRef}/branches`)
      return Array.isArray(branches) ? branches : []
    },

    /**
     * Reveal a branch's anon + service-role API keys.
     * GET /v1/projects/{branchRef}/api-keys?reveal=true
     * @param {string} branchRef
     * @returns {Promise<{ anonKey: string, serviceRoleKey: string }>}
     */
    async getApiKeys(branchRef) {
      const keys = await get(`/v1/projects/${branchRef}/api-keys?reveal=true`)
      const list = Array.isArray(keys) ? keys : []
      const find = (name) => list.find((k) => k && k.name === name)
      const anon = find('anon')
      const service = find('service_role')
      return {
        anonKey: anon?.api_key ?? anon?.apiKey ?? '',
        serviceRoleKey: service?.api_key ?? service?.apiKey ?? '',
      }
    },

    /**
     * Fetch the branch's symmetric JWT secret, if the Management API still
     * returns one. Under the asymmetric-signing-key migration this may be
     * absent — in that case return null (do NOT throw): the caller logs a loud
     * warning and continues with the 3-key path (plan §10).
     * GET /v1/projects/{branchRef}/config/auth
     * @param {string} branchRef
     * @returns {Promise<string | null>}
     */
    async getJwtSecret(branchRef) {
      const cfg = await get(`/v1/projects/${branchRef}/config/auth`)
      const secret = cfg?.jwt_secret ?? cfg?.jwtSecret ?? null
      return typeof secret === 'string' && secret.length > 0 ? secret : null
    },
  }
}
