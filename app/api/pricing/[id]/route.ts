export const dynamic = 'force-dynamic'

/**
 * GET    /api/pricing/[id]   — fetch single agreement with lines
 * PATCH  /api/pricing/[id]   — update header fields or status
 *   Body: { status?, valid_from?, valid_until?, notes?, customer_id?, prospect_name? }
 *   Access: sales can only edit own agreements; office/admin can edit any
 *   Status validation: only 'draft'|'active'|'cancelled' accepted (expired is computed)
 * DELETE /api/pricing/[id]   — delete agreement
 *   Access: admin can delete any; sales/office can delete own drafts only
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ROLES  = ['sales', 'office', 'admin']
const VALID_STATUSES = ['draft', 'active', 'cancelled'] as const

type Params = { params: Promise<{ id: string }> }

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('price_agreements')
    .select(`
      id, reference_number, status, valid_from, valid_until, notes, created_at, updated_at,
      customer_id, prospect_name,
      customer:customers!price_agreements_customer_id_fkey(id, name),
      rep:users!price_agreements_agreed_by_fkey(id, name),
      price_agreement_lines(
        id, product_id, product_name_override, price, unit, notes, position,
        product:products!price_agreement_lines_product_id_fkey(id, name, box_size, code)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const today = new Date().toISOString().split('T')[0]
  const rep = data.rep as { id: string; name: string } | null

  return NextResponse.json({
    id:               data.id,
    reference_number: data.reference_number,
    status:           data.status,
    is_expired:       data.status === 'active' && data.valid_until != null && data.valid_until < today,
    valid_from:       data.valid_from,
    valid_until:      data.valid_until,
    notes:            data.notes,
    created_at:       data.created_at,
    updated_at:       data.updated_at,
    customer_id:      data.customer_id,
    customer_name:    (data.customer as { id: string; name: string } | null)?.name ?? data.prospect_name ?? 'Unknown',
    is_prospect:      !data.customer_id,
    rep_id:           rep?.id   ?? null,
    rep_name:         rep?.name ?? 'Unknown',
    lines:            ((data.price_agreement_lines ?? []) as PriceLine[])
                        .sort((a, b) => a.position - b.position)
                        .map(shapeLine),
  })
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  let body: Record<string, unknown> | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Validate status if provided — cannot set to 'expired' via API
  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Access control: sales can only edit their own agreements
  const isAdmin   = role === 'admin'
  const isManager = role === 'office' || isAdmin

  if (!isManager) {
    const { data: own } = await supabase
      .from('price_agreements')
      .select('agreed_by')
      .eq('id', id)
      .single()
    if (!own || own.agreed_by !== userId) {
      return NextResponse.json({ error: 'Not authorised to edit this agreement' }, { status: 403 })
    }
  }

  const patch: Record<string, unknown> = {}
  for (const f of ['status', 'valid_from', 'valid_until', 'notes', 'customer_id', 'prospect_name']) {
    if (f in body) patch[f] = body[f] === '' ? null : body[f]
  }

  const { data, error } = await supabase
    .from('price_agreements')
    .update(patch)
    .eq('id', id)
    .select('id, reference_number, status, updated_at')
    .single()

  if (error || !data) {
    console.error('[pricing PATCH]', error?.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  console.log(`[pricing PATCH] ${data.reference_number} → ${data.status}`)
  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // Fetch agreement to check ownership + status
  const { data: agreement } = await supabase
    .from('price_agreements')
    .select('id, status, agreed_by, reference_number')
    .eq('id', id)
    .single()

  if (!agreement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = role === 'admin'
  const isOwner = agreement.agreed_by === userId

  // Non-admins can only delete own drafts
  if (!isAdmin && (!isOwner || agreement.status !== 'draft')) {
    return NextResponse.json(
      { error: 'Only admins can delete active/cancelled agreements, or agreements not owned by you' },
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('price_agreements')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[pricing DELETE]', error.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  console.log(`[pricing DELETE] ${agreement.reference_number} deleted by ${userId}`)
  return NextResponse.json({ deleted: true })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PriceLine {
  id: string; product_id: string | null; product_name_override: string | null
  price: number; unit: string; notes: string | null; position: number
  product: { id: string; name: string; box_size: string | null; code: string | null } | null
}

function shapeLine(l: PriceLine) {
  return {
    id:                    l.id,
    product_id:            l.product_id,
    product_name_override: l.product_name_override,
    product_name:          l.product?.name ?? l.product_name_override ?? 'Unknown',
    box_size:              l.product?.box_size ?? null,
    code:                  l.product?.code     ?? null,
    price:                 Number(l.price),
    unit:                  l.unit,
    notes:                 l.notes,
    position:              l.position,
    is_freetext:           !l.product_id,
  }
}

