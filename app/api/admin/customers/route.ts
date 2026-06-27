/**
 * app/api/admin/customers/route.ts
 * GET — list all customers
 *
 * F-20 PR1: re-pointed onto customersService.listAll() (the Customers admin
 * service over the CustomersRepository port) — no raw supabaseService query in
 * app code any more. The x-mfs-user-role admin guard is PRESERVED byte-identical
 * (no requireRole swap on this route in PR1 — only geocode-all's guard changes).
 *
 * Response shape is BYTE-IDENTICAL to before: an array of the seven snake_case
 * presentation fields (id, name, postcode, lat, lng, active, created_at). The
 * service returns the richer CustomerAdminView; this route maps each row back to
 * the exact six+id projection by hand (the toAppUser pattern) so the extra owned
 * fields (geocoded_at, is_approximate_location) never leak onto the screen.
 */

import { NextRequest, NextResponse } from 'next/server'
import { customersServiceForCaller } from '@/lib/wiring/customers'
import { requireRole }               from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import type { CustomerAdminView }    from '@/lib/domain'

/** Project the admin view back to today's exact 7-field customer-list shape. */
function toListRow(c: CustomerAdminView) {
  return {
    id:         c.id,
    name:       c.name,
    postcode:   c.postcode,
    lat:        c.lat,
    lng:        c.lng,
    active:     c.active,
    created_at: c.created_at,
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = requireRole(req, ['admin'])

    // F-RLS-04i: read through the per-caller authenticated client (RLS fires).
    // Rollback = swap `customersServiceForCaller(caller.userId)` → `customersService`.
    const customersService = await customersServiceForCaller(caller.userId!)

    const customers = await customersService.listAll()
    return NextResponse.json(customers.map(toListRow))

  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error(`[admin/customers GET] Unhandled error:`, err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
