export const dynamic = 'force-dynamic'

/**
 * POST /api/pricing/[id]/lines/replace
 *
 * Atomically replaces ALL lines on an agreement in a single Postgres
 * transaction. Either all old lines are deleted and all new lines are
 * inserted, or nothing changes. Prevents partial-save data loss.
 *
 * Body: { lines: LineInput[] }
 * Access: sales own agreements only; office/admin any.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

type Params = { params: Promise<{ id: string }> }

interface LineInput {
  product_id?:             string | null
  product_name_override?:  string | null
  price:                   number
  unit:                    'per_kg' | 'per_box'
  notes?:                  string | null
  position:                number
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agreementId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''

  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  let body: { lines: LineInput[] } | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body || !Array.isArray(body.lines)) {
    return NextResponse.json({ error: 'lines array required' }, { status: 400 })
  }

  // Validate each line
  for (let i = 0; i < body.lines.length; i++) {
    const l = body.lines[i]
    if (!l.price || l.price <= 0) {
      return NextResponse.json({ error: `Line ${i + 1}: price must be > 0` }, { status: 400 })
    }
    if (!l.product_id && !l.product_name_override?.trim()) {
      return NextResponse.json({ error: `Line ${i + 1}: product_id or product_name_override required` }, { status: 400 })
    }
  }

  // Access control: sales can only edit their own agreements
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

  // Build new lines array for the RPC
  const newLines = body.lines.map((l, i) => ({
    agreement_id:          agreementId,
    product_id:            l.product_id            || null,
    product_name_override: l.product_name_override || null,
    price:                 l.price,
    unit:                  l.unit ?? 'per_kg',
    notes:                 l.notes                 || null,
    position:              l.position ?? i,
  }))

  // Single atomic Postgres call — delete old lines + insert new lines in one transaction
  const { error } = await supabase.rpc('replace_agreement_lines', {
    p_agreement_id: agreementId,
    p_lines:        newLines,
  })

  if (error) {
    console.error('[pricing lines replace]', error.message)
    return NextResponse.json({ error: 'Failed to replace lines' }, { status: 500 })
  }

  return NextResponse.json({ replaced: true, count: body.lines.length })
}
