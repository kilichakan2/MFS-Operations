export const dynamic = 'force-dynamic'

/**
 * GET  /api/cash/cheques?status=all|not_banked|banked&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns cheque records. Logging a cheque IS receiving it — no confirm step.
 *   The only meaningful second state is whether the cheque has been banked.
 *
 * POST /api/cash/cheques
 *   Logs a new cheque. Office + admin only.
 *   Body: { date, customer_id, amount, driver_id, cheque_number?, notes? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const sp     = req.nextUrl.searchParams
    const status = sp.get('status') ?? 'all'   // all | not_banked | banked
    const from   = sp.get('from')
    const to     = sp.get('to')

    let query = supabase
      .from('cheque_records')
      .select(`
        id, date, amount, cheque_number, notes, created_at,
        banked, banked_at, customer_name,
        customer:customers(id, name),
        driver:users!cheque_records_driver_id_fkey(id, name),
        logged_by_user:users!cheque_records_logged_by_fkey(name),
        banked_by_user:users!cheque_records_banked_by_fkey(name)
      `)
      .order('date',       { ascending: false })
      .order('created_at', { ascending: false })

    if (status === 'not_banked') query = query.eq('banked', false)
    if (status === 'banked')     query = query.eq('banked', true)
    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) {
      console.error('[cash/cheques GET] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const shaped = (data ?? []).map((r: Record<string, unknown>) => ({
      id:             r.id,
      date:           r.date,
      amount:         Number(r.amount),
      cheque_number:  r.cheque_number,
      notes:          r.notes,
      created_at:     r.created_at,
      banked:         Boolean(r.banked),
      banked_at:      r.banked_at ?? null,
      customer:       r.customer as { id: string; name: string } | null,
      customer_name:  r.customer_name as string | null,
      driver:         r.driver   as { id: string; name: string } | null,
      logged_by_name: (r.logged_by_user as { name: string } | null)?.name ?? 'Unknown',
      banked_by_name: (r.banked_by_user as { name: string } | null)?.name ?? null,
    }))

    return NextResponse.json(shaped)
  } catch (err) {
    console.error('[cash/cheques GET] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (!['office', 'admin'].includes(role ?? '')) {
      return NextResponse.json({ error: 'Office or admin only' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { date, customer_id, customer_name, amount, driver_id, cheque_number, notes } = body

    if (!date || (!customer_id && !customer_name) || !amount || !driver_id) {
      return NextResponse.json({ error: 'date, customer (id or name), amount, driver_id required' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cheque_records')
      .insert({
        date,
        customer_id:   customer_id   || null,
        customer_name: customer_name || null,
        amount:        Number(amount),
        driver_id,
        cheque_number: cheque_number?.trim() || null,
        notes:         notes?.trim()         || null,
        logged_by:     userId,
        banked:        false,
      })
      .select(`
        id, date, amount, cheque_number, notes, created_at, banked, banked_at, customer_name,
        customer:customers(id, name),
        driver:users!cheque_records_driver_id_fkey(id, name),
        logged_by_user:users!cheque_records_logged_by_fkey(name)
      `)
      .single()

    if (error) {
      console.error('[cash/cheques POST] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const r = data as Record<string, unknown>
    return NextResponse.json({
      id:             r.id,
      date:           r.date,
      amount:         Number(r.amount),
      cheque_number:  r.cheque_number,
      notes:          r.notes,
      created_at:     r.created_at,
      banked:         false,
      banked_at:      null,
      customer:       r.customer,
      customer_name:  r.customer_name as string | null,
      driver:         r.driver,
      logged_by_name: (r.logged_by_user as { name: string } | null)?.name ?? 'Unknown',
      banked_by_name: null,
    }, { status: 201 })
  } catch (err) {
    console.error('[cash/cheques POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
