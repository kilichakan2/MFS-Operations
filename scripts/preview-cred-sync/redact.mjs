/**
 * scripts/preview-cred-sync/redact.mjs
 *
 * F-INFRA-05 — secret-safe logging for the preview cred-sync tooling.
 *
 * Why this exists (plan §12): the sync script handles four Supabase
 * credentials (anon key, service-role key, JWT secret, URL) plus two API
 * tokens (SUPABASE_ACCESS_TOKEN, VERCEL_API_TOKEN). NONE of their values may
 * ever appear in a log line. GitHub Actions masks `secrets.*` automatically,
 * but this script can also be run on a laptop where no masking exists — so the
 * script must be safe on its own (belt AND braces).
 *
 * What this hides:
 *   - `redact(value)` turns any value that must appear in a debug line into a
 *     length-only fingerprint: `"<redacted:219 chars>"`. The raw value never
 *     leaves this function.
 *   - `log.{info,warn,error}` is a thin console wrapper the script uses
 *     EXCLUSIVELY. It prints a prefixed message + an optional fields object.
 *     Callers are responsible for only passing redacted/non-secret fields —
 *     mirroring the discipline of `lib/observability/log.ts` (which also does
 *     not auto-redact), but standalone because CI tooling must not import the
 *     app's `lib/`.
 *
 * 🗣 The robot's mouth. It can announce "service-role key: <redacted:219 chars>"
 *    but is physically unable to read out the password itself.
 */

const PREFIX = '[preview-cred-sync]'

/**
 * Mask a secret to a length-only fingerprint. Never returns the raw value.
 * @param {unknown} value
 * @returns {string}
 */
export function redact(value) {
  if (value === null || value === undefined) return '<redacted:absent>'
  const str = typeof value === 'string' ? value : String(value)
  return `<redacted:${str.length} chars>`
}

/**
 * Build a SECRET-SAFE one-line suffix describing a vendor error RESPONSE, for
 * appending to a thrown Error message. Reads the response body and extracts ONLY
 * the vendor's own `error.code` / `error.message` (Vercel + Supabase both use the
 * `{"error":{"code","message"}}` shape). It NEVER reflects the request body, a
 * token, or any value we sent — only what the vendor returned. If the body is not
 * parseable JSON, it surfaces at most the first ~200 chars of the text body so a
 * plain-text error is still diagnosable. On any read failure it returns an empty
 * string (the caller already has the HTTP status).
 *
 * IMPORTANT: callers must only pass this an ERROR response. Never call it on a
 * success body — some success bodies (e.g. Supabase api-keys?reveal=true) contain
 * secrets, and this function would surface them.
 *
 * 🗣 The robot reading back the vendor's complaint slip out loud — only the slip
 *    the vendor wrote, never the password the robot handed over.
 *
 * @param {{ text?: () => Promise<string> }} res
 * @returns {Promise<string>} e.g. " (code=BAD_REQUEST: name is required)" or ""
 */
export async function describeErrorBody(res) {
  if (!res || typeof res.text !== 'function') return ''
  let raw
  try {
    raw = await res.text()
  } catch {
    return ''
  }
  if (typeof raw !== 'string' || raw.length === 0) return ''
  try {
    const parsed = JSON.parse(raw)
    const err = parsed && typeof parsed === 'object' ? parsed.error : undefined
    if (err && typeof err === 'object') {
      const code = typeof err.code === 'string' ? err.code : undefined
      const message = typeof err.message === 'string' ? err.message : undefined
      if (code !== undefined || message !== undefined) {
        return ` (code=${code ?? '?'}: ${message ?? '?'})`
      }
    }
    // Parseable JSON but not the {error:{code,message}} shape — fall through to
    // the truncated-text path rather than dumping the whole parsed object.
  } catch {
    // Not JSON — fall through to truncated text.
  }
  return ` (body: ${raw.slice(0, 200)})`
}

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} msg
 * @param {Record<string, unknown>} [fields]
 */
function emit(level, msg, fields) {
  const line =
    fields && Object.keys(fields).length > 0
      ? `${PREFIX} ${msg} ${JSON.stringify(fields)}`
      : `${PREFIX} ${msg}`
  // Route by level so CI/Vercel ingest the right stream.
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  info: (msg, fields) => emit('info', msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  warn: (msg, fields) => emit('warn', msg, fields),
  /** @param {string} msg @param {Record<string, unknown>} [fields] */
  error: (msg, fields) => emit('error', msg, fields),
}
