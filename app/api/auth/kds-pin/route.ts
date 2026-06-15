/**
 * app/api/auth/kds-pin/route.ts
 *
 * Butcher PIN authentication for the KDS.
 *
 * Different from the main /api/auth/login route in two important ways:
 *   1. Does NOT set cookies. The KDS device hosts multiple butchers
 *      simultaneously — cookies (one per browser) can't represent that.
 *      Instead the KDS keeps a list of signed-in butchers in localStorage
 *      and sends butcher_id explicitly on each line-Done request.
 *   2. Only butcher and warehouse roles can sign in here. Sales / office
 *      / admin use the main login route.
 *
 * Body:  { pin: string }
 * 200:   { id, name, role }
 * 401:   { error: 'No butcher matches that PIN' }
 *
 * F-13 PR2: the candidate list is now fetched through
 * usersService.listCredentialsByRoles (front desk) instead of a direct
 * Supabase query. The PIN-compare loop is business logic and stays in the
 * route — the service has no "verify pin" method by design. Only the field
 * read changes: pin_hash → pinHash (camelCase domain field).
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB5)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { usersService }             from '@/lib/wiring/users'
import { passwordHasher }           from '@/lib/wiring/password'

const KDS_ALLOWED_ROLES = ['butcher', 'warehouse'] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const pin  = String(body?.pin ?? '').trim()

    if (!pin || !/^\d{3,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 3-8 digits' }, { status: 400 })
    }

    // Pull every potential KDS user — bcrypt comparison is per-user so we
    // can't shortcut by hashing the pin first. Active butcher/warehouse
    // users are typically <10; this is cheap.
    const users = await usersService.listCredentialsByRoles(KDS_ALLOWED_ROLES, {
      activeOnly: true,
    })

    // The loop is business logic — check the PIN against every active
    // butcher/warehouse user — and stays in the route. Only the inner compare
    // swaps to the port. compare is TOTAL: a malformed hash for one user
    // returns false (logged inside the adapter) and the loop cleanly continues
    // to the next, so no per-iteration try/catch is needed.
    for (const user of users) {
      if (!user.pinHash) continue
      const match = await passwordHasher.compare(pin, user.pinHash)
      if (match) {
        return NextResponse.json({
          id:   user.id,
          name: user.name,
          role: user.role,
        })
      }
    }

    // No match — generic message, don't disclose whether the PIN format
    // is even known
    return NextResponse.json({ error: 'No butcher matches that PIN' }, { status: 401 })
  } catch (err) {
    console.error('[POST /api/auth/kds-pin]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
