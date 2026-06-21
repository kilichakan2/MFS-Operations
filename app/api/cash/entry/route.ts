export const dynamic = 'force-dynamic'

/**
 * POST /api/cash/entry
 *   Adds a cash entry. The validation cascade (missing fields, type, amount,
 *   month-not-found, locked, office-current-month, entry-date-in-month) lives
 *   in cashService.validateEntry, byte-identical to the old route.
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401 + invalid-JSON gates stay here. F-TD-28 DEFERRED: the office
 * current-month check stays on local-server time — `now: new Date()`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashServiceForCaller }      from '@/lib/wiring/cash'
import { toEntryCreateWireDto }      from '@/lib/api/cash/dto'
import type { CashEntryType }        from '@/lib/domain'

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04e: table read + insert run as the authenticated caller (RLS fires).
    // validateEntry stays a pure in-process check (incl. its F-TD-28 new Date()).
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { month_id, entry_date, type, category, amount, description, reference, attachment_path, attachment_name, customer_id } = body

    // Amount validation runs on the RAW body value (before coercion) to stay
    // byte-identical to the original route: a falsy raw value (missing/empty/
    // numeric 0) trips the required-fields message; a present-but-non-positive
    // value (e.g. the string "0") trips the positive message. Coercing before
    // the check would collapse string "0" into the required branch (wrong msg).
    if (!month_id || !entry_date || !type || !amount || !description) {
      return NextResponse.json({ error: 'month_id, entry_date, type, amount, description required' }, { status: 400 })
    }
    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'type must be income or expense' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    const input = {
      monthId:        month_id,
      entryDate:      entry_date,
      type:           type as CashEntryType,
      category:       category ?? null,
      amount:         Number(amount),
      description:    description,
      reference:      reference ?? null,
      attachmentPath: attachment_path ?? null,
      attachmentName: attachment_name ?? null,
      customerId:     customer_id ?? null,
      createdBy:      userId,
    }

    const month = await cashService.findMonthById(month_id)
    const v = cashService.validateEntry({ input, month, role, now: new Date() })
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const entry = await cashService.createEntry(input)
    return NextResponse.json({ entry: toEntryCreateWireDto(entry) }, { status: 201 })
  } catch (err) {
    console.error('[cash/entry POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
