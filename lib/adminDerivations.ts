/**
 * lib/adminDerivations.ts
 *
 * Pure derivation helpers used by the /api/admin/* endpoints landed in
 * Item 5a.1 PR B C2. Two server-side derivations cover schema gaps the
 * Gate 2 column-gap amendment surfaced:
 *
 *   - deriveAtRiskReason: the `visits` table carries no stored
 *     `reason` column. The amendment column gets computed from the
 *     visit's `outcome` plus the elapsed-hours signal — same data
 *     the dashboard's at-risk card already exposes.
 *
 *   - deriveCommitmentStatus: the `visits` table carries no
 *     `commitment_due` column. The amendment's `due_date` column
 *     gets dropped, but the status enum survives via the same
 *     hoursAgo > 24 threshold the dashboard already uses for the
 *     red overdue pill on its Commitments card.
 *
 * Both functions are pure data — kept in lib/ so the /api/admin/*
 * routes consume one canonical implementation and the unit fixtures
 * exercise the real function (not an inline mirror).
 */

export type AtRiskOutcome = 'at_risk' | 'lost'

/**
 * Compose a human-readable at-risk classification from the visit's
 * outcome + the elapsed-hours signal. Plain English so the admin
 * page can render the string directly without per-row translation.
 */
export function deriveAtRiskReason(outcome: AtRiskOutcome, hoursAgo: number): string {
  const stem = outcome === 'lost' ? 'Lost' : 'At risk'
  return `${stem} — last visit ${hoursAgo}h ago`
}

export type CommitmentStatus = 'pending' | 'overdue'

/**
 * The visits table has no commitment_due column today, so we can't
 * compare a real due_date against now. As a pragmatic substitute we
 * mirror the dashboard's existing overdue threshold (hoursAgo > 24)
 * — same red pill, same semantics, just surfaced as an enum string
 * for the admin list page.
 */
export function deriveCommitmentStatus(hoursAgo: number): CommitmentStatus {
  return hoursAgo > 24 ? 'overdue' : 'pending'
}
