/**
 * tests/unit/adminDerivations.test.ts
 *
 * Item 5a.1 PR B C2 — pure-data assertions for the at-risk reason
 * and commitment status derivation helpers exported from
 * lib/adminDerivations.ts. These are real-impl tests (not inline
 * mirrors) — the /api/admin/at-risk and /api/admin/commitments
 * route handlers consume the exact same exports.
 */

import { describe, it, expect } from 'vitest'
import {
  deriveAtRiskReason,
  deriveCommitmentStatus,
} from '@/lib/adminDerivations'

describe('deriveAtRiskReason', () => {
  it('at_risk + hours formats as "At risk — last visit Xh ago"', () => {
    expect(deriveAtRiskReason('at_risk', 54)).toBe('At risk — last visit 54h ago')
  })

  it('lost + hours formats as "Lost — last visit Xh ago"', () => {
    expect(deriveAtRiskReason('lost', 72)).toBe('Lost — last visit 72h ago')
  })

  it('zero hours renders honestly (no fudge to "just now")', () => {
    expect(deriveAtRiskReason('at_risk', 0)).toBe('At risk — last visit 0h ago')
  })

  it('large hours render without truncation', () => {
    expect(deriveAtRiskReason('lost', 720)).toBe('Lost — last visit 720h ago')
  })
})

describe('deriveCommitmentStatus', () => {
  it('hoursAgo > 24 → overdue (mirrors dashboard red pill threshold)', () => {
    expect(deriveCommitmentStatus(25)).toBe('overdue')
    expect(deriveCommitmentStatus(100)).toBe('overdue')
  })

  it('hoursAgo <= 24 → pending', () => {
    expect(deriveCommitmentStatus(24)).toBe('pending')
    expect(deriveCommitmentStatus(12)).toBe('pending')
    expect(deriveCommitmentStatus(0)).toBe('pending')
  })

  it('exactly 24 is pending (the dashboard uses strict >24, not >=24)', () => {
    expect(deriveCommitmentStatus(24)).toBe('pending')
  })
})
