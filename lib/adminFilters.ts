/**
 * lib/adminFilters.ts
 *
 * Single source of truth for the server-side query-param validators
 * used by the /api/admin/* endpoints landed in Item 5a.1 PR B C2-C7.
 * Mirrors the canonical type aliases in app/visits/page.tsx:76-77
 * (`VisitType`, `Outcome`) — those are page-private enum unions that
 * the visits log form uses for client-side validation. The same
 * enums need to be checked server-side when the /api/admin/visits
 * endpoint reads ?type= and ?outcome= URL params, so the values
 * are mirrored here as runtime Sets.
 *
 * Drift risk: if a new visit_type or outcome value is added to the
 * DB schema, both this file and app/visits/page.tsx must be updated.
 * Documented here so a future grep on either VisitType or Outcome
 * surfaces both sites.
 */

export const VISIT_TYPES = new Set<string>([
  'routine',
  'new_pitch',
  'complaint_followup',
  'delivery_issue',
])

export const OUTCOMES = new Set<string>([
  'positive',
  'neutral',
  'at_risk',
  'lost',
])

/**
 * Lower-case hex UUID format. Matches RFC 4122 surface; doesn't
 * enforce version digits. Good enough for "did the URL param come
 * from a real UUID source" gate — Supabase will still reject
 * structurally-valid-but-non-existent ids.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Pure validation helpers exported for unit testing. Each returns
 * `true` when the input is acceptable (including the absent case,
 * which is always valid — the route lets the absence default the
 * filter to "all").
 */
export function isValidRepId(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  return UUID_RE.test(raw)
}

export function isValidVisitType(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  return VISIT_TYPES.has(raw)
}

export function isValidOutcome(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true
  return OUTCOMES.has(raw)
}
