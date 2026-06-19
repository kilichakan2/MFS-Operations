export const dynamic = 'force-dynamic'

/**
 * POST /api/pricing/[id]/lines
 * Add a line to an existing agreement.
 * Body: { product_id?, product_name_override?, price, unit, notes?, position? }
 * Access: same as PATCH on the agreement (sales own only, office/admin any)
 *
 * F-15 PR2: re-pointed through `pricingService`. The adapter computes the next
 * position (max + 1). RBAC owner-read error is swallowed to a 403 to match
 * today (F-TD-24). Response byte-identical via toLineWireDto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pricingService }            from '@/lib/wiring/pricing'
import { toLineWireDto }             from '@/lib/api/pricing/dto'
import type { PriceUnit } from '@/lib/domain'

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

  // Access: sales can only add lines to own agreements. Today's pre-check
  // ignored the DB error → undefined → 403; reproduce that swallow (F-TD-24).
  const isManager = role === 'office' || role === 'admin'
  if (!isManager) {
    let owner
    try {
      owner = await pricingService.getAgreementOwner(agreementId)
    } catch {
      owner = null
    }
    if (!owner || owner.agreedBy !== userId) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
  }

  let line
  try {
    line = await pricingService.addLine(agreementId, {
      productId:           body.product_id            || null,
      productNameOverride: body.product_name_override || null,
      price:               body.price,
      unit:                (body.unit ?? 'per_kg') as PriceUnit,
      notes:               body.notes                 || null,
      position:            body.position ?? null,
    })
  } catch (err) {
    console.error('[pricing lines POST]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to add line' }, { status: 500 })
  }

  return NextResponse.json(toLineWireDto(line), { status: 201 })
}
