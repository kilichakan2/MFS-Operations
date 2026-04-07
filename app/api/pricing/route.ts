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
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

const ALLOWED_ROLES = ['sales', 'office', 'admin']

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('price_agreements')
    .select(`
      id, reference_number, status, valid_from, valid_until, notes, created_at, updated_at,
      customer_id,
      prospect_name,
      customer:customers!price_agreements_customer_id_fkey(id, name),
      rep:users!price_agreements_agreed_by_fkey(id, name),
      price_agreement_lines(id, product_id, product_name_override, price, unit, notes, position,
        product:products!price_agreement_lines_product_id_fkey(id, name, box_size, code)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[pricing GET]', error.message)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  const agreements = (data ?? []).map(a => ({
    id:               a.id,
    reference_number: a.reference_number,
    status:           a.status,
    is_expired:       a.status === 'active' && a.valid_until != null && a.valid_until < today,
    valid_from:       a.valid_from,
    valid_until:      a.valid_until,
    notes:            a.notes,
    created_at:       a.created_at,
    updated_at:       a.updated_at,
    customer_id:      a.customer_id,
    customer_name:    (a.customer as {id:string;name:string}|null)?.name ?? a.prospect_name ?? 'Unknown',
    is_prospect:      !a.customer_id,
    rep_id:           (a.rep as {id:string;name:string}|null)?.id   ?? null,
    rep_name:         (a.rep as {id:string;name:string}|null)?.name ?? 'Unknown',
    lines:            ((a.price_agreement_lines ?? []) as PriceLine[])
                        .sort((x, y) => x.position - y.position)
                        .map(l => shapeLineToMap(l)),
  }))

  return NextResponse.json({ agreements })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

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

  // Create agreement
  const { data: agreement, error: aErr } = await supabase
    .from('price_agreements')
    .insert({
      customer_id:   body.customer_id   || null,
      prospect_name: body.prospect_name || null,
      agreed_by:     userId,
      valid_from:    body.valid_from,
      valid_until:   body.valid_until   || null,
      notes:         body.notes         || null,
      status:        'draft',
    })
    .select('id, reference_number')
    .single()

  if (aErr || !agreement) {
    console.error('[pricing POST] agreement insert:', aErr?.message)
    return NextResponse.json({ error: 'Failed to create agreement' }, { status: 500 })
  }

  // Insert lines if provided
  if (body.lines?.length) {
    const validLines = body.lines.filter(l => {
      if (!l.price || l.price <= 0) return false
      if (!l.product_id && !l.product_name_override?.trim()) return false
      return true
    })

    if (validLines.length) {
      const { error: lErr } = await supabase
        .from('price_agreement_lines')
        .insert(validLines.map((l, i) => ({
          agreement_id:          agreement.id,
          product_id:            l.product_id            || null,
          product_name_override: l.product_name_override || null,
          price:                 l.price,
          unit:                  l.unit ?? 'per_kg',
          notes:                 l.notes                 || null,
          position:              l.position ?? i,
        })))

      if (lErr) {
        console.error('[pricing POST] lines insert:', lErr.message)
        // Agreement created — return it even if lines fail
      }
    }
  }

  console.log(`[pricing POST] created ${agreement.reference_number} by user ${userId}`)
  return NextResponse.json({ id: agreement.id, reference_number: agreement.reference_number }, { status: 201 })
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface PriceLine {
  id: string
  product_id: string | null
  product_name_override: string | null
  price: number
  unit: string
  notes: string | null
  position: number
  product: { id: string; name: string; box_size: string | null; code: string | null } | null
}

interface RawLine {
  product_id?:            string
  product_name_override?: string
  price:                  number
  unit?:                  'per_kg' | 'per_box'
  notes?:                 string
  position?:              number
}

function shapeLineToMap(l: PriceLine) {
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

