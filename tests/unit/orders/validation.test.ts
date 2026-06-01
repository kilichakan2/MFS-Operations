/**
 * tests/unit/orders/validation.test.ts
 *
 * Unit tests for lib/orders/validation.ts — request body validation
 * for the order create/edit API endpoints.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB2)
 */

import { describe, it, expect } from 'vitest'
import {
  validateOrderLine,
  validateCreateOrderRequest,
  validateUpdateOrderRequest,
  normaliseCreateOrder,
  type CreateOrderRequest,
} from '../../../lib/orders/validation'

const VALID_UUID    = '11111111-2222-3333-4444-555555555555'
const ANOTHER_UUID  = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const validCataloguedLine = {
  product_id: VALID_UUID,
  quantity:   10.5,
  uom:        'kg' as const,
}

const validAdHocLine = {
  ad_hoc_description: 'Mutton trim',
  quantity:           4,
  uom:                'kg' as const,
}

// ── validateOrderLine ────────────────────────────────────────────────────────

describe('validateOrderLine', () => {
  it('accepts a catalogued line', () => {
    expect(validateOrderLine(validCataloguedLine)).toEqual({ valid: true })
  })

  it('accepts an ad-hoc line', () => {
    expect(validateOrderLine(validAdHocLine)).toEqual({ valid: true })
  })

  it('rejects a line with both product_id and ad_hoc_description', () => {
    const result = validateOrderLine({
      product_id:         VALID_UUID,
      ad_hoc_description: 'shouldnt have both',
      quantity:           1,
      uom:                'kg',
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/cannot have both/)
  })

  it('rejects a line with neither product_id nor ad_hoc_description', () => {
    const result = validateOrderLine({ quantity: 1, uom: 'kg' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/must have either/)
  })

  it('rejects a line with empty-string ad_hoc_description and no product_id', () => {
    const result = validateOrderLine({ ad_hoc_description: '   ', quantity: 1, uom: 'kg' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/must have either/)
  })

  it('rejects zero or negative quantity', () => {
    expect(validateOrderLine({ ...validCataloguedLine, quantity: 0 }).valid).toBe(false)
    expect(validateOrderLine({ ...validCataloguedLine, quantity: -5 }).valid).toBe(false)
  })

  it('rejects non-numeric quantity', () => {
    expect(validateOrderLine({ ...validCataloguedLine, quantity: '10' as unknown as number }).valid).toBe(false)
    expect(validateOrderLine({ ...validCataloguedLine, quantity: NaN }).valid).toBe(false)
    expect(validateOrderLine({ ...validCataloguedLine, quantity: Infinity }).valid).toBe(false)
  })

  it('rejects invalid uom', () => {
    expect(validateOrderLine({ ...validCataloguedLine, uom: 'pcs' as 'kg' | 'unit' }).valid).toBe(false)
    expect(validateOrderLine({ ...validCataloguedLine, uom: '' as 'kg' | 'unit' }).valid).toBe(false)
  })

  it('rejects non-UUID product_id', () => {
    const result = validateOrderLine({ product_id: 'not-a-uuid', quantity: 1, uom: 'kg' })
    expect(result.valid).toBe(false)
    // Falls through to the "must have either" branch since the bad UUID
    // counts as not-set-as-product
    if (!result.valid) expect(result.error).toMatch(/must have either/)
  })

  it('rejects null and primitive line values', () => {
    expect(validateOrderLine(null).valid).toBe(false)
    expect(validateOrderLine('string').valid).toBe(false)
    expect(validateOrderLine(42).valid).toBe(false)
  })

  it('includes the line index in error messages (1-indexed)', () => {
    const result = validateOrderLine({ quantity: 1, uom: 'kg' }, 4)
    if (!result.valid) expect(result.error).toMatch(/^Line 5:/)
  })
})

// ── validateCreateOrderRequest ───────────────────────────────────────────────

describe('validateCreateOrderRequest', () => {
  const validBody: CreateOrderRequest = {
    customer_id:   VALID_UUID,
    delivery_date: '2026-05-31',
    lines:         [validCataloguedLine],
  }

  it('accepts a minimal valid order', () => {
    expect(validateCreateOrderRequest(validBody)).toEqual({ valid: true })
  })

  it('accepts an order with multiple lines (mix of catalogued + ad-hoc)', () => {
    expect(validateCreateOrderRequest({
      ...validBody,
      lines: [validCataloguedLine, validAdHocLine, validCataloguedLine],
    })).toEqual({ valid: true })
  })

  it('rejects missing customer_id', () => {
    const { customer_id: _, ...withoutCustomer } = validBody
    const result = validateCreateOrderRequest(withoutCustomer)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/customer_id/)
  })

  it('rejects malformed customer_id', () => {
    expect(validateCreateOrderRequest({ ...validBody, customer_id: 'not-uuid' }).valid).toBe(false)
    expect(validateCreateOrderRequest({ ...validBody, customer_id: 123 as unknown as string }).valid).toBe(false)
  })

  it('rejects missing delivery_date', () => {
    const { delivery_date: _, ...withoutDate } = validBody
    expect(validateCreateOrderRequest(withoutDate).valid).toBe(false)
  })

  it('rejects malformed delivery_date', () => {
    expect(validateCreateOrderRequest({ ...validBody, delivery_date: '31/05/2026' }).valid).toBe(false)  // wrong format
    expect(validateCreateOrderRequest({ ...validBody, delivery_date: '2026-13-01' }).valid).toBe(false)  // invalid month
    expect(validateCreateOrderRequest({ ...validBody, delivery_date: '2026-02-30' }).valid).toBe(false)  // invalid day
    expect(validateCreateOrderRequest({ ...validBody, delivery_date: '' }).valid).toBe(false)
  })

  it('rejects empty lines array', () => {
    const result = validateCreateOrderRequest({ ...validBody, lines: [] })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/at least one line/)
  })

  it('rejects missing lines field', () => {
    const { lines: _, ...withoutLines } = validBody
    expect(validateCreateOrderRequest(withoutLines).valid).toBe(false)
  })

  it('rejects null and primitive bodies', () => {
    expect(validateCreateOrderRequest(null).valid).toBe(false)
    expect(validateCreateOrderRequest(undefined).valid).toBe(false)
    expect(validateCreateOrderRequest('a string').valid).toBe(false)
    expect(validateCreateOrderRequest(42).valid).toBe(false)
  })

  it('surfaces line-level errors', () => {
    const result = validateCreateOrderRequest({
      ...validBody,
      lines: [validCataloguedLine, { quantity: -1, uom: 'kg' }],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/Line 2/)
  })
})

// ── validateUpdateOrderRequest ───────────────────────────────────────────────

describe('validateUpdateOrderRequest', () => {
  it('accepts empty body (no-op update)', () => {
    expect(validateUpdateOrderRequest({})).toEqual({ valid: true })
  })

  it('accepts a delivery_date only update', () => {
    expect(validateUpdateOrderRequest({ delivery_date: '2026-06-01' })).toEqual({ valid: true })
  })

  it('accepts a notes only update', () => {
    expect(validateUpdateOrderRequest({ order_notes: 'new note' })).toEqual({ valid: true })
  })

  it('accepts a lines only update', () => {
    expect(validateUpdateOrderRequest({ lines: [validCataloguedLine] })).toEqual({ valid: true })
  })

  it('rejects malformed delivery_date when provided', () => {
    expect(validateUpdateOrderRequest({ delivery_date: 'bad' }).valid).toBe(false)
  })

  it('rejects empty lines array when provided', () => {
    expect(validateUpdateOrderRequest({ lines: [] }).valid).toBe(false)
  })

  it('rejects null body', () => {
    expect(validateUpdateOrderRequest(null).valid).toBe(false)
  })
})

// ── normaliseCreateOrder ─────────────────────────────────────────────────────

describe('normaliseCreateOrder', () => {
  it('trims string fields and converts empty strings to null', () => {
    const result = normaliseCreateOrder({
      customer_id:    VALID_UUID,
      delivery_date:  '2026-05-31',
      delivery_notes: '  needs to arrive before 11am  ',
      order_notes:    '',
      lines: [{ product_id: ANOTHER_UUID, quantity: 5, uom: 'kg', notes: '  extra trim  ' }],
    })
    expect(result.delivery_notes).toBe('needs to arrive before 11am')
    expect(result.order_notes).toBeNull()
    expect(result.lines[0].notes).toBe('extra trim')
  })

  it('assigns 1-indexed line_number', () => {
    const result = normaliseCreateOrder({
      customer_id:   VALID_UUID,
      delivery_date: '2026-05-31',
      lines: [validCataloguedLine, validAdHocLine, validCataloguedLine],
    })
    expect(result.lines.map(l => l.line_number)).toEqual([1, 2, 3])
  })

  it('sets ad_hoc_description to null when product_id is present', () => {
    const result = normaliseCreateOrder({
      customer_id:   VALID_UUID,
      delivery_date: '2026-05-31',
      lines: [{ product_id: ANOTHER_UUID, ad_hoc_description: 'should be cleared', quantity: 5, uom: 'kg' }],
    })
    expect(result.lines[0].product_id).toBe(ANOTHER_UUID)
    expect(result.lines[0].ad_hoc_description).toBeNull()
  })

  it('preserves ad_hoc_description when product_id is absent', () => {
    const result = normaliseCreateOrder({
      customer_id:   VALID_UUID,
      delivery_date: '2026-05-31',
      lines: [{ ad_hoc_description: 'one-off cut', quantity: 5, uom: 'unit' }],
    })
    expect(result.lines[0].product_id).toBeNull()
    expect(result.lines[0].ad_hoc_description).toBe('one-off cut')
  })
})
