export const dynamic = 'force-dynamic'

/**
 * GET /api/cash/export?type=cash&year=2026&month=4
 * GET /api/cash/export?type=cheques&from=2026-04-01&to=2026-04-30
 * Admin only. Returns professionally structured CSV.
 *
 * Cash export: full cash book format with running balance
 *   Header → Summary → Statement (Date|Description|Customer|Category|Ref|Debit|Credit|Balance)
 *
 * Cheques export: cheque register format
 *   Header → Summary → Register (Date|Customer|Cheque No.|Driver|Amount|Notes|Status|Banked By|Banked At)
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403/400 gates + type branching stay here; the data reads and the
 * byte-identical CSV builders live in the Cash service/adapter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashService }               from '@/lib/wiring/cash'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const sp   = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'cash'
    const now  = new Date()

    // ── CASH BOOK ────────────────────────────────────────────────────────────
    if (type === 'cash') {
      const year  = parseInt(sp.get('year')  ?? '0', 10)
      const month = parseInt(sp.get('month') ?? '0', 10)
      if (!year || !month) return NextResponse.json({ error: 'year and month required' }, { status: 400 })

      const data = await cashService.readCashBookData(year, month)
      if (data === null) return NextResponse.json({ error: 'Month not found' }, { status: 404 })

      const { filename, csv } = cashService.buildCashBookCsv({
        year,
        month,
        monthRecord: data.month,
        entries: data.entries,
        generatedAt: now,
      })

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })

    // ── CHEQUE REGISTER ───────────────────────────────────────────────────────
    } else if (type === 'cheques') {
      const from = sp.get('from')
      const to   = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

      const cheques = await cashService.readChequeRegisterData(from, to)

      const { filename, csv } = cashService.buildChequeRegisterCsv({
        from,
        to,
        cheques,
        generatedAt: now,
      })

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })

    } else {
      return NextResponse.json({ error: 'type must be cash or cheques' }, { status: 400 })
    }
  } catch (err) {
    console.error('[cash/export] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
