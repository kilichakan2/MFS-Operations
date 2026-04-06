export const dynamic = 'force-dynamic'

/**
 * POST /api/pricing/[id]/lines
 * Add a line to an existing agreement.
 * Body: { product_id?, product_name_override?, price, unit, notes?, position? }
 * Access: same as PATCH on the agreement (sales own only, office/admin any)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agreementId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  let body: {
    product_id?:            string
    product_name_override?: string
    price:                  number
    unit?:                  'per_kg' | 'per_box'
    notes?:                 string
    position?:              number
  } | null = null
  try { body = await req.json() } catch { /**/ }

  if (!body?.price || body.price <= 0) {
    return NextResponse.json({ error: 'price required and must be > 0' }, { status: 400 })
  }
  if (!body.product_id && !body.product_name_override?.trim()) {
    return NextResponse.json({ error: 'product_id or product_name_override required' }, { status: 400 })
  }

  // Access: sales can only add lines to own agreements
  const isManager = role === 'office' || role === 'admin'
  if (!isManager) {
    const { data: own } = await supabase
      .from('price_agreements')
      .select('agreed_by')
      .eq('id', agreementId)
      .single()
    if (!own || own.agreed_by !== userId) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
  }

  // Get max position for this agreement
  const { data: existing } = await supabase
    .from('price_agreement_lines')
    .select('position')
    .eq('agreement_id', agreementId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = body.position ?? ((existing?.[0]?.position ?? -1) + 1)

  const { data: line, error } = await supabase
    .from('price_agreement_lines')
    .insert({
      agreement_id:          agreementId,
      product_id:            body.product_id            || null,
      product_name_override: body.product_name_override || null,
      price:                 body.price,
      unit:                  body.unit ?? 'per_kg',
      notes:                 body.notes                 || null,
      position:              nextPosition,
    })
    .select(`
      id, product_id, product_name_override, price, unit, notes, position,
      product:products!price_agreement_lines_product_id_fkey(id, name, box_size, code)
    `)
    .single()

  if (error || !line) {
    console.error('[pricing lines POST]', error?.message)
    return NextResponse.json({ error: 'Failed to add line' }, { status: 500 })
  }

  const p = line.product as { id: string; name: string; box_size: string | null; code: string | null } | null
  return NextResponse.json({
    id:                    line.id,
    product_id:            line.product_id,
    product_name_override: line.product_name_override,
    product_name:          p?.name ?? line.product_name_override ?? 'Unknown',
    box_size:              p?.box_size ?? null,
    code:                  p?.code     ?? null,
    price:                 Number(line.price),
    unit:                  line.unit,
    notes:                 line.notes,
    position:              line.position,
    is_freetext:           !line.product_id,
  }, { status: 201 })
}

