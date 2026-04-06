export const dynamic = 'force-dynamic'

/**
 * PATCH  /api/pricing/lines/[lineId]  — edit a line
 * DELETE /api/pricing/lines/[lineId]  — remove a line
 * Access: sales own agreements only; office/admin any
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Params = { params: Promise<{ lineId: string }> }

async function checkAccess(lineId: string, userId: string, role: string): Promise<boolean> {
  const isManager = role === 'office' || role === 'admin'
  if (isManager) return true

  // Sales: verify line belongs to an agreement owned by this user
  const { data } = await supabase
    .from('price_agreement_lines')
    .select('agreement_id, price_agreements!inner(agreed_by)')
    .eq('id', lineId)
    .single()

  if (!data) return false
  const agreement = data.price_agreements as { agreed_by: string } | null
  return agreement?.agreed_by === userId
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const allowed = await checkAccess(lineId, userId, role)
  if (!allowed) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  let body: Record<string, unknown> | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (body.price !== undefined && (typeof body.price !== 'number' || body.price <= 0)) {
    return NextResponse.json({ error: 'price must be > 0' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const f of ['product_id', 'product_name_override', 'price', 'unit', 'notes', 'position']) {
    if (f in body) patch[f] = body[f] === '' ? null : body[f]
  }

  const { data, error } = await supabase
    .from('price_agreement_lines')
    .update(patch)
    .eq('id', lineId)
    .select(`
      id, product_id, product_name_override, price, unit, notes, position,
      product:products!price_agreement_lines_product_id_fkey(id, name, box_size, code)
    `)
    .single()

  if (error || !data) {
    console.error('[pricing lines PATCH]', error?.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  const p = data.product as { id: string; name: string; box_size: string | null; code: string | null } | null
  return NextResponse.json({
    id:                    data.id,
    product_id:            data.product_id,
    product_name_override: data.product_name_override,
    product_name:          p?.name ?? data.product_name_override ?? 'Unknown',
    box_size:              p?.box_size ?? null,
    code:                  p?.code     ?? null,
    price:                 Number(data.price),
    unit:                  data.unit,
    notes:                 data.notes,
    position:              data.position,
    is_freetext:           !data.product_id,
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const allowed = await checkAccess(lineId, userId, role)
  if (!allowed) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { error } = await supabase
    .from('price_agreement_lines')
    .delete()
    .eq('id', lineId)

  if (error) {
    console.error('[pricing lines DELETE]', error.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}

