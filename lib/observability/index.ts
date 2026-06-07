/**
 * lib/observability/index.ts
 *
 * Barrel for the observability module. Note: `setSink` (the
 * pluggable-sink seam inside log.ts) is intentionally NOT exported —
 * exposing it is deferred to the unit that adds the first non-`console`
 * sink (likely Sentry). YAGNI + ADR-0002 depth rule.
 */

export { type Caller, type Role, makeCaller } from './Caller'
export { getCaller, runWithCaller }           from './context'
export { withRequestContext }                 from './withRequestContext'
export { log, type LogFields }                from './log'
