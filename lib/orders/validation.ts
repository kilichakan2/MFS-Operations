/**
 * lib/orders/validation.ts
 *
 * Pure validation for order create + edit requests. Lives outside the
 * route handler so it can be unit-tested without mocking Next.js, and
 * so the same logic can be reused by client-side form pre-validation
 * (no round-trip needed for obvious errors).
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

import type { OrderUom } from './types'

// ─── Request body shapes ───────────────────────────────────────

/** Shape posted to POST /api/orders to create a new order. */
export interface CreateOrderRequest {
  customer_id:    string
  delivery_date:  string  // YYYY-MM-DD
  delivery_notes?: string | null
  order_notes?:   string | null
  lines: CreateOrderLineRequest[]
}

export interface CreateOrderLineRequest {
  product_id?:           string | null
  ad_hoc_description?:   string | null
  quantity:              number
  uom:                   OrderUom
  notes?:                string | null
}

/** Shape posted to PUT /api/orders/[id] to edit an existing placed order. */
export interface UpdateOrderRequest {
  delivery_date?:  string
  delivery_notes?: string | null
  order_notes?:    string | null
  lines?:          CreateOrderLineRequest[]
}

// ─── Validation result type ───────────────────────────────────

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string }

// ─── Helpers ──────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function isYmdDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isValidUom(value: unknown): value is OrderUom {
  return value === 'kg' || value === 'unit'
}

/** Trims a value to a string; returns null if not a string or empty after trim. */
function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

// ─── Line validation ──────────────────────────────────────────

export function validateOrderLine(line: unknown, indexForError = 0): ValidationResult {
  if (!line || typeof line !== 'object') {
    return { valid: false, error: `Line ${indexForError + 1}: not an object` }
  }

  const l = line as Record<string, unknown>

  // product_id XOR ad_hoc_description — same rule as the DB CHECK constraint
  const hasProduct = isUuid(l.product_id)
  const hasAdHoc   = typeof l.ad_hoc_description === 'string' && l.ad_hoc_description.trim().length > 0

  if (hasProduct && hasAdHoc) {
    return { valid: false, error: `Line ${indexForError + 1}: cannot have both product_id and ad_hoc_description` }
  }
  if (!hasProduct && !hasAdHoc) {
    return { valid: false, error: `Line ${indexForError + 1}: must have either product_id or ad_hoc_description` }
  }

  if (!isPositiveNumber(l.quantity)) {
    return { valid: false, error: `Line ${indexForError + 1}: quantity must be a positive number` }
  }

  if (!isValidUom(l.uom)) {
    return { valid: false, error: `Line ${indexForError + 1}: uom must be 'kg' or 'unit'` }
  }

  return { valid: true }
}

// ─── Create-order validation ──────────────────────────────────

export function validateCreateOrderRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' }
  }

  const b = body as Record<string, unknown>

  if (!isUuid(b.customer_id)) {
    return { valid: false, error: 'customer_id must be a UUID' }
  }

  if (!isYmdDate(b.delivery_date)) {
    return { valid: false, error: 'delivery_date must be a valid YYYY-MM-DD date' }
  }

  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return { valid: false, error: 'Order must have at least one line' }
  }

  for (let i = 0; i < b.lines.length; i++) {
    const result = validateOrderLine(b.lines[i], i)
    if (!result.valid) return result
  }

  return { valid: true }
}

// ─── Edit-order validation ────────────────────────────────────

export function validateUpdateOrderRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' }
  }

  const b = body as Record<string, unknown>

  if (b.delivery_date !== undefined && !isYmdDate(b.delivery_date)) {
    return { valid: false, error: 'delivery_date must be a valid YYYY-MM-DD date' }
  }

  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines) || b.lines.length === 0) {
      return { valid: false, error: 'Order must have at least one line' }
    }
    for (let i = 0; i < b.lines.length; i++) {
      const result = validateOrderLine(b.lines[i], i)
      if (!result.valid) return result
    }
  }

  return { valid: true }
}

// ─── Normalisation ────────────────────────────────────────────

/**
 * Normalises a validated request body — trims strings, coerces null/undefined.
 * Assumes validation already passed. Returns a clean object ready for the DB.
 */
export function normaliseCreateOrder(body: CreateOrderRequest) {
  return {
    customer_id:    body.customer_id,
    delivery_date:  body.delivery_date,
    delivery_notes: nullableTrim(body.delivery_notes),
    order_notes:    nullableTrim(body.order_notes),
    lines: body.lines.map((line, i) => ({
      line_number:         i + 1,
      product_id:          line.product_id ?? null,
      ad_hoc_description:  line.product_id ? null : (line.ad_hoc_description ?? null),
      quantity:            line.quantity,
      uom:                 line.uom,
      notes:               nullableTrim(line.notes),
    })),
  }
}
