/**
 * lib/orders/types.ts
 *
 * TypeScript types for the order pipeline feature.
 *
 * Mirrors the database schema created in
 * supabase/migrations/20260530_001_order_pipeline_schema.sql.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB1)
 */

// ─── Enums ─────────────────────────────────────────────────────

/** State machine for an order. Forward-only transitions. */
export type OrderState = 'placed' | 'printed' | 'completed'

/** Per-line unit of measure on an order. Distinct from products.box_size. */
export type OrderUom = 'kg' | 'unit'

/** Every action that gets recorded in order_audit_log. */
export type OrderAuditAction =
  | 'created'
  | 'edited'
  | 'printed'
  | 'reprinted'
  | 'line_added'
  | 'line_edited'
  | 'line_done'
  | 'completed'

// ─── Row shapes (mirror DB columns) ────────────────────────────

/** A row in the `orders` table. */
export interface OrderRow {
  id:             string
  reference:      string  // MFS-YYYY-NNNN
  customer_id:    string
  delivery_date:  string  // YYYY-MM-DD
  delivery_notes: string | null
  order_notes:    string | null
  state:          OrderState
  created_by:     string
  created_at:     string  // ISO timestamp
  printed_by:     string | null
  printed_at:     string | null
  completed_at:   string | null
}

/** A row in the `order_lines` table. Either product_id or ad_hoc_description is set, never both. */
export interface OrderLineRow {
  id:                  string
  order_id:            string
  line_number:         number
  product_id:          string | null
  ad_hoc_description:  string | null
  quantity:            number
  uom:                 OrderUom
  notes:               string | null
  done_at:             string | null
  done_by:             string | null
}

/** A row in the `order_audit_log` table. */
export interface OrderAuditLogRow {
  id:         string
  order_id:   string
  user_id:    string | null
  action:     OrderAuditAction
  payload:    Record<string, unknown> | null
  created_at: string
}

// ─── Convenience composites ────────────────────────────────────

/** An order with its lines. Used by the API and most UI views. */
export interface OrderWithLines extends OrderRow {
  lines: OrderLineRow[]
}

// ─── Constants / regexes ──────────────────────────────────────

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
