/**
 * app/api/admin/products/[id]/route.ts
 * PATCH — toggle active on a product
 *
 * F-20 PR2: re-pointed onto productsService.setActive() (the Products admin
 * service over the ProductsRepository port) — no raw supabaseService query in
 * app code any more. The x-mfs-user-role admin guard is PRESERVED byte-identical.
 *
 * Response shape is BYTE-IDENTICAL to before: a single row of the FIVE-key
 * SUBSET (id, name, category, active, created_at) — NO code, NO box_size,
 * matching today's PATCH `.select('id, name, category, active, created_at')`.
 *
 * The ONE sanctioned behaviour change (the PR1 typed-null→404 convention): a
 * PATCH on a missing id now returns 404 { error: 'Product not found' }. Today's
 * `.single()` on no-match yields a PostgREST error → 500; the service's
 * `setActive` returns null on no-match and the route maps null → 404.
 */

import { NextRequest, NextResponse } from 'next/server'
import { productsService }           from '@/lib/wiring/products'
import type { ProductAdminView }     from '@/lib/domain'

/** Project the admin view back to today's exact 5-field PATCH-row shape. */
function toRow(p: ProductAdminView) {
  return {
    id:         p.id,
    name:       p.name,
    category:   p.category,
    active:     p.active,
    created_at: p.created_at,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id }     = await params
    const { active } = await req.json() as { active: boolean }

    const updated = await productsService.setActive(id, active)
    if (updated === null) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    return NextResponse.json(toRow(updated))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
