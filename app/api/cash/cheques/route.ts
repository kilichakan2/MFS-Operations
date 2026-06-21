export const dynamic = 'force-dynamic'

/**
 * GET  /api/cash/cheques?status=all|not_banked|banked&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns cheque records. Logging a cheque IS receiving it — no confirm step.
 *   The only meaningful second state is whether the cheque has been banked.
 *
 * POST /api/cash/cheques
 *   Logs a new cheque. Office + admin only.
 *   Body: { date, customer_id, amount, driver_id, cheque_number?, notes? }
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403 role gates stay here; the query/filter/insert logic and the
 * snake_case wire shaping move to the Cash service/adapter + DTO.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashServiceForCaller }      from '@/lib/wiring/cash'
import { toChequeWireDto }           from '@/lib/api/cash/dto'
import type { ChequeStatusFilter }   from '@/lib/domain'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04e: run as the authenticated caller (RLS fires).
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const sp     = req.nextUrl.searchParams
    const status = (sp.get('status') ?? 'all') as ChequeStatusFilter   // all | not_banked | banked
    const from   = sp.get('from')
    const to     = sp.get('to')

    const cheques = await cashService.listCheques({ status, from, to })
    return NextResponse.json(cheques.map(toChequeWireDto))
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

    // F-RLS-04e: run as the authenticated caller (RLS fires).
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { date, customer_id, customer_name, amount, driver_id, cheque_number, notes } = body

    // Amount validation runs on the RAW body value (before coercion) to stay
    // byte-identical to the original route: a falsy raw value (missing/empty/
    // numeric 0) trips the required-fields message; a present-but-non-positive
    // value (e.g. the string "0") trips the positive message. Coercing before
    // the check would collapse string "0" into the required branch (wrong msg).
    if (!date || (!customer_id && !customer_name) || !amount || !driver_id) {
      return NextResponse.json({ error: 'date, customer (id or name), amount, driver_id required' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    const input = {
      date,
      customerId:   customer_id   ?? null,
      customerName: customer_name ?? null,
      amount:       Number(amount),
      driverId:     driver_id,
      chequeNumber: cheque_number ?? null,
      notes:        notes ?? null,
      loggedBy:     userId,
    }

    const v = cashService.validateCheque(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const cheque = await cashService.createCheque(input)
    return NextResponse.json(toChequeWireDto(cheque), { status: 201 })
  } catch (err) {
    console.error('[cash/cheques POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
