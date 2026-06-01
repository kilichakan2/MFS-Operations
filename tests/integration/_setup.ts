/**
 * tests/integration/_setup.ts
 *
 * Shared setup for the integration test suite. Each test file:
 *   - Imports getServiceClient() to talk to Supabase directly
 *   - Imports api() to call Next.js API routes with cookie-based auth
 *   - Imports cleanupTestData() to remove rows it created
 *
 * Run with the Next.js dev server already running locally:
 *   npm run dev          (in one terminal)
 *   npm run test:integration  (in another)
 *
 * Required env (typically in .env.test.local):
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key-for-local-supabase>
 *   INTEGRATION_BASE_URL=http://localhost:3000
 *
 * Tests are designed for a Supabase local container or a staging
 * project — NEVER for production. The cleanup helper deletes ALL
 * rows with `customer_id` matching the test fixtures, so running
 * against production would damage real data.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'http://localhost:54321'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BASE_URL      = process.env.INTEGRATION_BASE_URL      ?? 'http://localhost:3000'

if (!SERVICE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY must be set for integration tests. ' +
    'Put it in .env.test.local — never commit a real production key.'
  )
}

// Production-safety guard
if (SUPABASE_URL.includes('uqgecljspgtevoylwkep')) {
  throw new Error(
    '⛔ Integration tests must NOT run against the production project. ' +
    'Point NEXT_PUBLIC_SUPABASE_URL at localhost or a staging project.'
  )
}

export const TEST_PREFIX = 'ANVIL-TEST-'

export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface TestUserSet {
  admin:     { id: string; name: string }
  sales:     { id: string; name: string }
  office:    { id: string; name: string }
  warehouse: { id: string; name: string }
  butcher:   { id: string; name: string }
  driver:    { id: string; name: string }
}

/**
 * Ensure one user of each role exists with a known name prefix.
 * Returns user IDs by role for use in tests.
 */
export async function setupTestUsers(): Promise<TestUserSet> {
  const supa = getServiceClient()
  const roles = ['admin', 'sales', 'office', 'warehouse', 'butcher', 'driver'] as const
  const out: Partial<TestUserSet> = {}

  for (const role of roles) {
    const name = `${TEST_PREFIX}${role}`
    const { data: existing } = await supa
      .from('users')
      .select('id, name')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      out[role] = { id: existing.id, name: existing.name }
    } else {
      const { data, error } = await supa
        .from('users')
        .insert({ name, role, active: true })
        .select('id, name')
        .single()
      if (error) throw new Error(`Failed to create test user ${name}: ${error.message}`)
      out[role] = { id: data.id, name: data.name }
    }
  }

  return out as TestUserSet
}

/**
 * Create a known test customer.
 */
export async function setupTestCustomer(): Promise<{ id: string; name: string }> {
  const supa = getServiceClient()
  const name = `${TEST_PREFIX}customer`
  const { data: existing } = await supa
    .from('customers').select('id, name').eq('name', name).maybeSingle()
  if (existing) return existing

  const { data, error } = await supa
    .from('customers')
    .insert({ name, active: true, postcode: 'XX1 1XX' })
    .select('id, name')
    .single()
  if (error) throw new Error(`Failed to create test customer: ${error.message}`)
  return data
}

/**
 * Fetch the first active product for use in test order lines.
 */
export async function getTestProduct(): Promise<{ id: string; name: string; code: string | null }> {
  const supa = getServiceClient()
  const { data, error } = await supa
    .from('products')
    .select('id, name, code')
    .eq('active', true)
    .limit(1)
    .single()
  if (error || !data) throw new Error('No active products available for test')
  return data
}

/**
 * Call a Next.js API route with cookie-based auth. Returns the
 * response (status + parsed JSON if any).
 */
export async function api(
  path:    string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    role?:   string                    // sets mfs_role cookie
    userId?: string                    // sets mfs_user_id cookie
    body?:   unknown
  } = {},
): Promise<{ status: number; body: unknown; raw: string }> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  // Cookie string
  const cookieParts: string[] = []
  if (opts.role)   cookieParts.push(`mfs_role=${opts.role}`)
  if (opts.userId) cookieParts.push(`mfs_user_id=${opts.userId}`)
  if (cookieParts.length) headers.Cookie = cookieParts.join('; ')

  const res = await fetch(`${BASE_URL}${path}`, {
    method:  opts.method ?? 'GET',
    headers,
    body:    opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  const raw = await res.text()
  let body: unknown
  try { body = JSON.parse(raw) } catch { body = raw }
  return { status: res.status, body, raw }
}

/**
 * Delete all orders + lines + audit rows created by tests. Uses
 * the test customer + test users so it only ever removes ANVIL
 * fixtures, never real data.
 */
export async function cleanupTestData(): Promise<void> {
  const supa = getServiceClient()
  const cust = await supa.from('customers').select('id').eq('name', `${TEST_PREFIX}customer`).maybeSingle()
  if (cust.data) {
    await supa.from('orders').delete().eq('customer_id', cust.data.id)
  }
}
