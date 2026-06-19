export const dynamic = 'force-dynamic'

/**
 * GET  /api/pricing  — list all agreements (sales/office/admin)
 *   Sales see all but only edit their own.
 *   Returns computed `is_expired` boolean (valid_until < today).
 *
 * POST /api/pricing  — create new agreement + lines
 *   Body: {
 *     customer_id?:   string
 *     prospect_name?: string
 *     valid_from:     string (date)
 *     valid_until?:   string (date)
 *     notes?:         string
 *     lines: [{
 *       product_id?:            string
 *       product_name_override?: string
 *       price:                  number
 *       unit:                   'per_kg' | 'per_box'
 *       notes?:                 string
 *       position?:              number
 *     }]
 *   }
 *
 * F-15 PR2: re-pointed through `pricingService`. No direct @supabase import.
 * The adapter owns is_expired, the line sort, the invalid-line filter, the
 * 'draft' status literal and the header-survives-line-failure semantics; the
 * route only translates body→input and domain→snake_case via the dto helper.
 *
 * F-RLS-04d: each handler runs under the per-caller authenticated client so RLS
 * fires. Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pricingServiceForCaller }   from '@/lib/wiring/pricing'
import { toAgreementWireDto }        from '@/lib/api/pricing/dto'
import type { CreateLineInput, PriceUnit } from '@/lib/domain'

const ALLOWED_ROLES = ['sales', 'office', 'admin']

interface RawLine {
  product_id?:            string
  product_name_override?: string
  price:                  number
  unit?:                  'per_kg' | 'per_box'
  notes?:                 string
  position?:              number
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // F-RLS-04d: run under the per-caller authenticated client (RLS fires).
  // Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
  const pricingService = await pricingServiceForCaller(userId)

  let agreements
  try {
    agreements = await pricingService.listAgreements({})
  } catch (err) {
    console.error('[pricing GET]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  return NextResponse.json({ agreements: agreements.map(toAgreementWireDto) })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // F-RLS-04d: run under the per-caller authenticated client (RLS fires).
  // Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
  const pricingService = await pricingServiceForCaller(userId)

  let body: {
    customer_id?:   string
    prospect_name?: string
    valid_from:     string
    valid_until?:   string
    notes?:         string
    lines?:         RawLine[]
  } | null = null
  try { body = await req.json() } catch { /**/ }

  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  if (!body.customer_id && !body.prospect_name?.trim()) {
    return NextResponse.json({ error: 'customer_id or prospect_name required' }, { status: 400 })
  }
  if (!body.valid_from) {
    return NextResponse.json({ error: 'valid_from required' }, { status: 400 })
  }

  // Translate body → CreateAgreementInput (camelCase). The adapter filters
  // invalid lines, sets status 'draft' and keeps the header even if lines fail.
  const lines: CreateLineInput[] = (body.lines ?? []).map(l => ({
    productId:           l.product_id            || null,
    productNameOverride: l.product_name_override || null,
    price:               l.price,
    unit:                (l.unit ?? 'per_kg') as PriceUnit,
    notes:               l.notes                 || null,
    position:            l.position ?? null,
  }))

  let created
  try {
    created = await pricingService.createAgreement({
      customerId:   body.customer_id   || null,
      prospectName: body.prospect_name || null,
      agreedBy:     userId,
      validFrom:    body.valid_from,
      validUntil:   body.valid_until   || null,
      notes:        body.notes         || null,
      lines,
    })
  } catch (err) {
    console.error('[pricing POST] agreement insert:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create agreement' }, { status: 500 })
  }

  console.log(`[pricing POST] created ${created.referenceNumber} by user ${userId}`)
  return NextResponse.json({ id: created.id, reference_number: created.referenceNumber }, { status: 201 })
}
