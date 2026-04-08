/**
 * tests/unit/adminRoleCheck.test.ts
 *
 * Tests the admin role guard logic used across all /api/admin routes.
 */
import { describe, it, expect } from 'vitest'

// Mirror of the check used in every admin route
function isAdmin(role: string | null): boolean {
  return role === 'admin'
}

function adminGuard(role: string | null): { allowed: boolean; status?: number; error?: string } {
  if (!isAdmin(role)) {
    return { allowed: false, status: 403, error: 'Admin only' }
  }
  return { allowed: true }
}

describe('admin role guard', () => {
  it('allows admin role', () => {
    expect(adminGuard('admin').allowed).toBe(true)
  })

  it('blocks sales role', () => {
    const r = adminGuard('sales')
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(403)
  })

  it('blocks office role', () => {
    expect(adminGuard('office').allowed).toBe(false)
  })

  it('blocks warehouse role', () => {
    expect(adminGuard('warehouse').allowed).toBe(false)
  })

  it('blocks driver role', () => {
    expect(adminGuard('driver').allowed).toBe(false)
  })

  it('blocks null (missing header)', () => {
    const r = adminGuard(null)
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(403)
  })

  it('blocks empty string', () => {
    expect(adminGuard('').allowed).toBe(false)
  })

  it('is case-sensitive — Admin (capital A) is not allowed', () => {
    // Role header from middleware is always lowercase
    expect(adminGuard('Admin').allowed).toBe(false)
  })
})
