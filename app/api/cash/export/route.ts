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
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// CSV cell — quote if needed
function cell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// Build a CSV row from cells
function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(',')
}

// Blank row
const BLANK = ''

// Section separator (8 cols wide for cash, 9 for cheques)
function sep(cols: number): string {
  return Array(cols).fill('--------').join(',')
}

// Format currency
function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`
}

// Format date dd/mm/yy
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`
}

// Format datetime dd/mm/yy HH:MM
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const sp   = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'cash'
    const now  = new Date()
    const generatedAt = fmtDateTime(now.toISOString())

    // ── CASH BOOK ────────────────────────────────────────────────────────────
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
          entry_date, type, category, amount, description, reference,
          created_by_user:users!cash_entries_created_by_fkey(name),
          customer:customers(id, name)
        `)
        .eq('month_id', cashMonth.id)
        .order('entry_date')
        .order('created_at')

      const rows    = (entries ?? []) as Record<string, unknown>[]
      const opening = Number(cashMonth.opening_balance)
      const totalIn  = rows.filter(r => r.type === 'income').reduce((s, r)  => s + Number(r.amount), 0)
      const totalOut = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
      const closing  = opening + totalIn - totalOut

      const periodName = new Date(year, month - 1, 1)
        .toLocaleString('en-GB', { month: 'long', year: 'numeric' })

      // 8 columns: Date | Description | Customer | Category | Reference | Debit | Credit | Balance
      const COLS = 8

      const lines: string[] = [
        // ── Header ──────────────────────────────────────────────────────────
        row('MFS GLOBAL LTD'),
        row('Cash Book — ' + periodName),
        row('Generated:', generatedAt),
        BLANK,

        // ── Summary ─────────────────────────────────────────────────────────
        row('SUMMARY'),
        sep(COLS),
        row('Opening Balance', '', '', '', '', '', '', gbp(opening)),
        row('Total Receipts (Credit)', '', '', '', '', '', gbp(totalIn), ''),
        row('Total Payments (Debit)',  '', '', '', '', gbp(totalOut), '', ''),
        row('Closing Balance', '', '', '', '', '', '', gbp(closing)),
        sep(COLS),
        BLANK,

        // ── Statement header ─────────────────────────────────────────────────
        row('CASH BOOK STATEMENT'),
        row('Date', 'Description', 'Customer', 'Category', 'Reference', 'Debit (Out)', 'Credit (In)', 'Balance'),
        sep(COLS),

        // Opening balance row
        row('', 'Opening Balance', '', '', '', '', '', gbp(opening)),
      ]

      // Statement rows with running balance
      let balance = opening
      for (const r of rows) {
        const isIncome = r.type === 'income'
        const amount   = Number(r.amount)
        balance += isIncome ? amount : -amount

        lines.push(row(
          fmtDate(String(r.entry_date)),
          String(r.description),
          (r.customer as { name: string } | null)?.name ?? '',
          r.category ? String(r.category) : '',
          r.reference ? String(r.reference) : '',
          isIncome ? '' : gbp(amount),   // Debit = money out
          isIncome ? gbp(amount) : '',   // Credit = money in
          gbp(balance),
        ))
      }

      // Totals + closing
      lines.push(
        sep(COLS),
        row('', 'TOTALS', '', '', '', gbp(totalOut), gbp(totalIn), ''),
        sep(COLS),
        row('', 'Closing Balance', '', '', '', '', '', gbp(closing)),
        BLANK,

        // ── Footer ───────────────────────────────────────────────────────────
        row(cashMonth.is_locked ? 'Status: LOCKED' : 'Status: Open'),
        row(`Total transactions: ${rows.length}`),
        row('MFS Global Ltd · mfsops.com'),
      )

      const filename = `MFS-CashBook-${year}-${String(month).padStart(2,'0')}.csv`
      return new NextResponse(lines.join('\r\n'), {
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

      const { data: cheques } = await supabase
        .from('cheque_records')
        .select(`
          date, amount, cheque_number, notes, created_at, banked, banked_at, customer_name,
          customer:customers(name),
          driver:users!cheque_records_driver_id_fkey(name),
          logged_by_user:users!cheque_records_logged_by_fkey(name),
          banked_by_user:users!cheque_records_banked_by_fkey(name)
        `)
        .gte('date', from).lte('date', to)
        .order('date')
        .order('created_at')

      const rows    = (cheques ?? []) as Record<string, unknown>[]
      const total   = rows.reduce((s, r) => s + Number(r.amount), 0)
      const banked  = rows.filter(r => r.banked).reduce((s, r) => s + Number(r.amount), 0)
      const outstanding = total - banked

      const periodLabel = `${fmtDate(from)} to ${fmtDate(to)}`

      // 9 columns
      const COLS = 9

      const lines: string[] = [
        // ── Header ──────────────────────────────────────────────────────────
        row('MFS GLOBAL LTD'),
        row('Cheque Register — ' + periodLabel),
        row('Generated:', generatedAt),
        BLANK,

        // ── Summary ─────────────────────────────────────────────────────────
        row('SUMMARY'),
        sep(COLS),
        row('Total Cheques Received', rows.length),
        row('Total Value',            gbp(total)),
        row('Total Banked',           gbp(banked)),
        row('Outstanding (Not Banked)', gbp(outstanding)),
        sep(COLS),
        BLANK,

        // ── Register header ──────────────────────────────────────────────────
        row('CHEQUE REGISTER'),
        row('Date', 'Customer', 'Cheque No.', 'Amount', 'Driver', 'Logged By', 'Status', 'Banked By', 'Banked At'),
        sep(COLS),
      ]

      for (const r of rows) {
        const custName = (r.customer as { name: string } | null)?.name
                      ?? r.customer_name as string | null
                      ?? '—'
        lines.push(row(
          fmtDate(String(r.date)),
          custName,
          r.cheque_number ? String(r.cheque_number) : '—',
          gbp(Number(r.amount)),
          (r.driver as { name: string } | null)?.name ?? '—',
          (r.logged_by_user as { name: string } | null)?.name ?? '—',
          r.banked ? 'Banked' : 'Not Banked',
          (r.banked_by_user as { name: string } | null)?.name ?? '',
          r.banked_at ? fmtDateTime(String(r.banked_at)) : '',
        ))
      }

      lines.push(
        sep(COLS),
        row('', '', 'TOTAL', gbp(total), '', '', '', '', ''),
        row('', '', 'BANKED', gbp(banked), '', '', '', '', ''),
        row('', '', 'OUTSTANDING', gbp(outstanding), '', '', '', '', ''),
        BLANK,
        row('MFS Global Ltd · mfsops.com'),
      )

      const filename = `MFS-ChequeRegister-${from}-to-${to}.csv`
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
