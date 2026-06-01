/**
 * tests/integration/orders-crud.test.ts
 *
 * Integration test for the order create / read / edit endpoints.
 * Hits the running Next.js dev server with cookie-based auth.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  api,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  type TestUserSet,
} from './_setup'

describe('/api/orders integration', () => {
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

  // ── Auth gates ──────────────────────────────────────────────

  it('redirects to /login when called without cookies (middleware 307)', async () => {
    // Middleware is the first auth gate — no session cookie => 307 to /login.
    // (Route handler 401 only fires when cookies are present but the role is
    // unauthorised, see 'rejects POST from driver role' below.)
    const res = await api('/api/orders', { method: 'POST', body: {} })
    expect(res.status).toBe(307)
  })

  it('rejects POST from driver role (401)', async () => {
    const res = await api('/api/orders', {
      method: 'POST',
      role:   'driver',
      userId: users.driver.id,
      body: {
        customer_id:   customer.id,
        delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }],
      },
    })
    expect(res.status).toBe(401)
  })

  it('rejects POST from butcher role (401)', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'butcher', userId: users.butcher.id,
      body: {
        customer_id:   customer.id,
        delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }],
      },
    })
    expect(res.status).toBe(401)
  })

  // ── Validation ──────────────────────────────────────────────

  it('rejects empty body (400)', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id, body: {},
    })
    expect(res.status).toBe(400)
  })

  it('rejects missing delivery_date (400)', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: { customer_id: customer.id, lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }] },
    })
    expect(res.status).toBe(400)
  })

  it('rejects zero quantity line (400)', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 0, uom: 'kg' }],
      },
    })
    expect(res.status).toBe(400)
  })

  it('rejects unknown product_id (400)', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, uom: 'kg' }],
      },
    })
    expect(res.status).toBe(400)
  })

  // ── Happy path ──────────────────────────────────────────────

  it('creates an order with mixed catalogued + ad-hoc lines', async () => {
    const res = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id:    customer.id,
        delivery_date:  '2026-12-31',
        delivery_notes: 'before 11am',
        order_notes:    'test order',
        lines: [
          { product_id: product.id, quantity: 10.5, uom: 'kg', notes: 'extra fine' },
          { ad_hoc_description: 'mutton trim', quantity: 4, uom: 'kg' },
        ],
      },
    })
    expect(res.status).toBe(201)
    const body = res.body as { id: string; reference: string }
    expect(body.id).toBeDefined()
    expect(body.reference).toMatch(/^MFS-\d{4}-\d{4}$/)
  })

  it('reads back the created order with joined customer + creator + lines', async () => {
    const create = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 5, uom: 'kg' }],
      },
    })
    expect(create.status).toBe(201)
    const { id } = create.body as { id: string }

    const get = await api(`/api/orders/${id}`, {
      method: 'GET', role: 'office', userId: users.office.id,
    })
    expect(get.status).toBe(200)
    const order = (get.body as { order: { state: string; lines: unknown[]; customer: { name: string } } }).order
    expect(order.state).toBe('placed')
    expect(order.lines).toHaveLength(1)
    expect(order.customer.name).toBe(customer.name)
  })

  // ── State-aware edit permissions ────────────────────────────

  it('allows sales to edit a placed order', async () => {
    const create = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }],
      },
    })
    const { id } = create.body as { id: string }

    const update = await api(`/api/orders/${id}`, {
      method: 'PUT', role: 'sales', userId: users.sales.id,
      body: { order_notes: 'edited by sales' },
    })
    expect(update.status).toBe(200)
  })

  it('blocks sales from editing a printed order (403)', async () => {
    // Create + manually transition to printed via the picking-list endpoint
    const create = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }],
      },
    })
    const { id } = create.body as { id: string }

    const print = await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })
    expect(print.status).toBe(200)

    const update = await api(`/api/orders/${id}`, {
      method: 'PUT', role: 'sales', userId: users.sales.id,
      body: { order_notes: 'late edit attempt' },
    })
    expect(update.status).toBe(403)
  })

  it('allows office to edit a printed order (triggers reprint)', async () => {
    const create = await api('/api/orders', {
      method: 'POST', role: 'sales', userId: users.sales.id,
      body: {
        customer_id: customer.id, delivery_date: '2026-12-31',
        lines: [{ product_id: product.id, quantity: 1, uom: 'kg' }],
      },
    })
    const { id } = create.body as { id: string }

    await api(`/api/orders/${id}/picking-list`, {
      method: 'POST', role: 'office', userId: users.office.id,
    })

    const update = await api(`/api/orders/${id}`, {
      method: 'PUT', role: 'office', userId: users.office.id,
      body: { order_notes: 'office amendment' },
    })
    expect(update.status).toBe(200)
  })
})
