/**
 * lib/observability/log.ts
 *
 * Minimal structured logger. One JSON line per call to stdout/stderr.
 *
 * What this hides:
 *   Picks up `Caller` (userId, role, correlationId) from
 *   AsyncLocalStorage if present — call sites never pass it in.
 *   Formats a single JSON line and routes to the right console stream
 *   by level.
 *
 * When to use it:
 *   - `log.info(msg, fields?)` — structured breadcrumbs.
 *   - `log.warn(msg, fields?)` — recoverable surprises.
 *   - `log.error(msg, fields?)` — unexpected failures (the `withErrors`
 *     HOF uses this for the unknown-error path).
 *
 * When NOT to use it:
 *   - Do NOT use it for user-facing copy.
 *   - Do NOT pass secrets, JWTs, session cookies, or request body
 *     dumps in `fields` — only the documented `Caller` fields plus
 *     the developer-supplied message + structured payload land in the
 *     JSON line. The logger does NOT redact; callers are responsible.
 *
 * Design rationale (see plan section 2a): thin custom logger preferred
 * over pino/winston per ADR-0002 dependency-justification rule. Pluggable
 * sink for a future Sentry integration is intentionally NOT exposed in
 * this PR — adding it later is a small edit when the need is real.
 *
 * Output shape (one line, JSON):
 *   {"level":"error","msg":"...","ts":"2026-06-07T...","correlationId":"...","userId":"...","role":"...","error":{...}}
 *
 * Levels: info | warn | error. Routed to console.log / console.warn /
 * console.error respectively (Vercel ingests all three from stdout/stderr).
 */

import { getCaller } from './context'

export interface LogFields { [k: string]: unknown }

type Level = 'info' | 'warn' | 'error'

const sinkFor: Record<Level, (line: string) => void> = {
  info:  (line) => { console.log(line)   },
  warn:  (line) => { console.warn(line)  },
  error: (line) => { console.error(line) },
}

function emit(level: Level, msg: string, fields?: LogFields): void {
  const caller = getCaller()
  const line: Record<string, unknown> = {
    level,
    msg,
    ts: new Date().toISOString(),
  }
  if (caller) {
    line.correlationId = caller.correlationId
    if (caller.userId !== null) line.userId = caller.userId
    if (caller.role   !== null) line.role   = caller.role
  }
  if (fields) Object.assign(line, fields)

  try {
    sinkFor[level](JSON.stringify(line))
  } catch {
    // Never let the logger throw. Fall back to a primitive console call.
    sinkFor[level](`${level}: ${msg}`)
  }
}

export const log = {
  info:  (msg: string, fields?: LogFields) => emit('info',  msg, fields),
  warn:  (msg: string, fields?: LogFields) => emit('warn',  msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}
