/**
 * app/api/admin/products/route.ts
 * GET — list all products
 *
 * F-20 PR2: re-pointed onto productsService.listAll() (the Products admin
 * service over the ProductsRepository port) — no raw supabaseService query in
 * app code any more. The x-mfs-user-role admin guard is PRESERVED byte-identical.
 *
 * Response shape is BYTE-IDENTICAL to before: a BARE array (NOT {rows}) of the
 * seven presentation fields (id, name, category, code, box_size, active,
 * created_at). The service returns the richer ProductAdminView; this route maps
 * each row back to the exact 7-key wire shape by hand (the toListRow pattern),
 * mapping the domain field `boxSize` to the wire key `box_size`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { productsServiceForCaller }  from '@/lib/wiring/products'
import { requireRole }               from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import type { ProductAdminView }     from '@/lib/domain'

/** Project the admin view back to today's exact 7-field product-list shape. */
function toListRow(p: ProductAdminView) {
  return {
    id:         p.id,
    name:       p.name,
    category:   p.category,
    code:       p.code,
    box_size:   p.boxSize,
    active:     p.active,
    created_at: p.created_at,
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = requireRole(req, ['admin'])

    // F-RLS-04i: read through the per-caller authenticated client (RLS fires).
    // Rollback = swap `productsServiceForCaller(caller.userId)` → `productsService`.
    const productsService = await productsServiceForCaller(caller.userId!)

    const products = await productsService.listAll()
    return NextResponse.json(products.map(toListRow))

  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error(`[admin/products GET] Unhandled error:`, err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
