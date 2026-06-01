/**
 * tests/integration/picking-list.test.ts
 *
 * Integration test for /api/orders/[id]/picking-list.
 * Verifies the state transition (placed → printed) is atomic with
 * the HTML render, reprints emit a second print event, and
 * completed orders cannot be reprinted.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  api, setupTestUsers, setupTestCustomer, getTestProduct, cleanupTestData,
  getServiceClient,
  type TestUserSet,
} from './_setup'

describe('/api/orders/[id]/picking-list integration', () => {
  let users:    TestUserSet
  let customer: { id: string; name: string }
  let product:  { id: string; name: string; code: string | null }

  beforeAll(async () => {
    users    = await setupTestUsers()
    customer = await setupTestCustomer()
    product  = await getTestProduct()
    await cleanupTestData()
  }, 30_000)

  afterAll(async () => { await cleanupTestData() }, 30_000)

  async function createPlacedOrder(): Promise<string> {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 5, uom: 'kg' }],
      },
    })
    return (res.body as { id: string }).id
  }

  // ── Auth ────────────────────────────────────────────────────

  it('rejects POST without cookies (401)', async () => {
    const id = await createPlacedOrder()
    const res = await api(`/api/orders/${id}/picking-list`, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('rejects POST from sales role — only office/warehouse/admin can print (401)', async () => {
    const id = await createPlacedOrder()
    const res = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'sales', userId: users.sales.id,
    })
    expect(res.status).toBe(401)
  })

  // ── First print: state transition + HTML render ─────────────

  it('returns HTML and transitions placed → printed', async () => {
    const id = await createPlacedOrder()
    const res = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    expect(res.status).toBe(200)
    expect(res.raw).toMatch(/^<!DOCTYPE html>/i)
    expect(res.raw).toMatch(/PICKING FORM/)

    // Verify DB state
    const supa = getServiceClient()
    const { data } = await supa.from('orders').select('state, printed_at, printed_by').eq('id', id).single()
    expect(data?.state).toBe('printed')
    expect(data?.printed_at).toBeTruthy()
    expect(data?.printed_by).toBe(users.office.id)
  })

  it('first print emits a "printed" audit row', async () => {
    const id = await createPlacedOrder()
    await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    const supa = getServiceClient()
    const { data } = await supa.from('order_audit_log').select('action').eq('order_id', id)
    const actions = (data ?? []).map(r => r.action)
    expect(actions).toContain('created')
    expect(actions).toContain('line_added')
    expect(actions).toContain('printed')
  })

  // ── Reprint: stays printed but emits "reprinted" ────────────

  it('second print on a printed order emits "reprinted"', async () => {
    const id = await createPlacedOrder()
    await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    // small delay so audit timestamps are distinguishable
    await new Promise(r => setTimeout(r, 50))
    const reprint = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    expect(reprint.status).toBe(200)

    const supa = getServiceClient()
    const { data } = await supa.from('order_audit_log').select('action').eq('order_id', id)
    const actions = (data ?? []).map(r => r.action)
    expect(actions.filter(a => a === 'printed')).toHaveLength(1)
    expect(actions.filter(a => a === 'reprinted')).toHaveLength(1)
  })

  // ── Completed order cannot be reprinted ─────────────────────

  it('rejects reprint of a completed order (403)', async () => {
    const id = await createPlacedOrder()
    // Walk through to completed: print, mark all lines done, complete
    await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })

    // Move to completed via service client (mimics the line-done flow)
    const supa = getServiceClient()
    const { data: lines } = await supa.from('order_lines').select('id').eq('order_id', id)
    for (const line of lines ?? []) {
      await supa.from('order_lines').update({
        done_at: new Date().toISOString(),
        done_by: users.butcher.id,
      }).eq('id', line.id)
    }
    await supa.from('orders').update({
      state: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', id)

    const reprint = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    expect(reprint.status).toBe(403)
  })

  // ── GET is read-only (no state change) ──────────────────────

  it('GET does not change state', async () => {
    const id = await createPlacedOrder()
    const res = await api(`/api/orders/${id}/picking-list`, {
      method: 'GET', role: 'office', userId: users.office.id,
    })
    expect(res.status).toBe(200)

    const supa = getServiceClient()
    const { data } = await supa.from('orders').select('state').eq('id', id).single()
    expect(data?.state).toBe('placed')
  })

  // ── Reference appears in the rendered HTML ──────────────────

  it('includes the order reference in the rendered HTML', async () => {
    const id = await createPlacedOrder()
    const supa = getServiceClient()
    const { data: order } = await supa.from('orders').select('reference').eq('id', id).single()

    const res = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    expect(res.raw).toContain(order!.reference)
  })
})
