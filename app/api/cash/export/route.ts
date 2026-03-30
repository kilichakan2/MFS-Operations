export const dynamic = 'force-dynamic'

/**
 * GET /api/cash/export?type=cash&year=2026&month=4
 * GET /api/cash/export?type=cheques&from=2026-04-01&to=2026-04-30
 * Admin only. Returns CSV.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(c => {
    const s = String(c ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')
}

function fmt(amount: number) {
  return `£${amount.toFixed(2)}`
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const sp   = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'cash'

    if (type === 'cash') {
      const year  = parseInt(sp.get('year')  ?? '0', 10)
      const month = parseInt(sp.get('month') ?? '0', 10)
      if (!year || !month) return NextResponse.json({ error: 'year and month required' }, { status: 400 })

      const { data: cashMonth } = await supabase
        .from('cash_months')
        .select('id, opening_balance, is_locked')
        .eq('year', year).eq('month', month).single()

      if (!cashMonth) return NextResponse.json({ error: 'Month not found' }, { status: 404 })

      const { data: entries } = await supabase
        .from('cash_entries')
        .select(`
          entry_date, type, category, amount, description, reference, created_at,
          created_by_user:users!cash_entries_created_by_fkey(name)
        `)
        .eq('month_id', cashMonth.id)
        .order('entry_date').order('created_at')

      const rows = (entries ?? []) as Record<string, unknown>[]
      const totalIn  = rows.filter(r => r.type === 'income').reduce((s, r)  => s + Number(r.amount), 0)
      const totalOut = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
      const closing  = Number(cashMonth.opening_balance) + totalIn - totalOut

      const monthName = new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

      const lines: string[] = [
        `MFS Global Ltd — Cash Reconciliation — ${monthName}`,
        '',
        csvRow(['Opening Balance', fmt(Number(cashMonth.opening_balance))]),
        csvRow(['Total Income',    fmt(totalIn)]),
        csvRow(['Total Expense',   fmt(totalOut)]),
        csvRow(['Closing Balance', fmt(closing)]),
        '',
        csvRow(['Date', 'Type', 'Category', 'Amount', 'Description', 'Reference', 'Logged By', 'Logged At']),
        ...rows.map(r => csvRow([
          String(r.entry_date),
          String(r.type),
          r.category ? String(r.category) : '',
          r.type === 'income' ? fmt(Number(r.amount)) : `-${fmt(Number(r.amount))}`,
          String(r.description),
          r.reference ? String(r.reference) : '',
          (r.created_by_user as { name: string } | null)?.name ?? '',
          String(r.created_at).slice(0, 16).replace('T', ' '),
        ])),
      ]

      const filename = `MFS-Cash-${year}-${String(month).padStart(2, '0')}.csv`
      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })

    } else if (type === 'cheques') {
      const from = sp.get('from')
      const to   = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

      let q = supabase
        .from('cheque_records')
        .select(`
          date, amount, cheque_number, notes, created_at, confirmed_at,
          customer:customers(name),
          driver:users!cheque_records_driver_id_fkey(name),
          logged_by_user:users!cheque_records_logged_by_fkey(name),
          confirmed_by_user:users!cheque_records_confirmed_by_fkey(name)
        `)
        .gte('date', from).lte('date', to)
        .order('date').order('created_at')

      const { data: cheques } = await q
      const rows = (cheques ?? []) as Record<string, unknown>[]

      const total = rows.reduce((s, r) => s + Number(r.amount), 0)

      const lines: string[] = [
        `MFS Global Ltd — Cheque Records — ${from} to ${to}`,
        '',
        csvRow(['Total Cheques', rows.length, 'Total Value', fmt(total)]),
        '',
        csvRow(['Date', 'Customer', 'Amount', 'Cheque No.', 'Driver', 'Notes', 'Logged By', 'Status', 'Confirmed By', 'Confirmed At']),
        ...rows.map(r => csvRow([
          String(r.date),
          (r.customer as { name: string } | null)?.name ?? '',
          fmt(Number(r.amount)),
          r.cheque_number ? String(r.cheque_number) : '',
          (r.driver as { name: string } | null)?.name ?? '',
          r.notes ? String(r.notes) : '',
          (r.logged_by_user    as { name: string } | null)?.name ?? '',
          r.confirmed_at ? 'Confirmed' : 'Unconfirmed',
          (r.confirmed_by_user as { name: string } | null)?.name ?? '',
          r.confirmed_at ? String(r.confirmed_at).slice(0, 16).replace('T', ' ') : '',
        ])),
      ]

      const filename = `MFS-Cheques-${from}-to-${to}.csv`
      return new NextResponse(lines.join('\r\n'), {
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
