/**
 * lib/domain/orderReference.ts
 *
 * Pure domain helpers for the Orders bounded context: MFS-YYYY-NNNN
 * reference parsing/formatting and the application-layer state-transition
 * guard. Relocated from the retired legacy orders wire-types module (F-TD-12).
 *
 * Pure TypeScript — no framework, no vendor imports. Domain-layer rule.
 */
import type { OrderState } from './Order'

/** Regex matching the MFS-YYYY-NNNN order reference format. */
export const ORDER_REFERENCE_REGEX = /^MFS-(\d{4})-(\d{4})$/

/**
 * Parses an MFS-YYYY-NNNN reference into its year and sequence parts.
 * Returns null if the input doesn't match the format.
 */
export function parseOrderReference(reference: string): { year: number; sequence: number } | null {
  const match = ORDER_REFERENCE_REGEX.exec(reference)
  if (!match) return null
  return {
    year:     parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  }
}

/**
 * Formats a year + sequence pair into an MFS-YYYY-NNNN reference.
 * Sequences over 9999 produce a longer string (still parseable, just wider).
 */
export function formatOrderReference(year: number, sequence: number): string {
  return `MFS-${year}-${sequence.toString().padStart(4, '0')}`
}

/**
 * Whether a state transition is permitted at the application layer.
 * The database also enforces this via CHECK constraints — this is for
 * pre-validation in API routes so we can return clear 400 errors.
 */
export function isValidStateTransition(from: OrderState, to: OrderState): boolean {
  if (from === to) return false  // no-op transitions are not transitions
  if (from === 'placed'    && to === 'printed')   return true
  if (from === 'printed'   && to === 'completed') return true
  return false  // all other transitions (including backward) are forbidden
}
