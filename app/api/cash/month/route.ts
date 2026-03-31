export const dynamic = 'force-dynamic'

/**
 * GET  /api/cash/month?year=2026&month=4
 *   Returns the month record + entries with signed attachment URLs.
 *   If month doesn't exist: returns { exists: false, isFirst, suggestedOpening }
 *
 * POST /api/cash/month
 *   Creates a month record. Admin only.
 *   First-ever month: body must include opening_balance.
 *   Subsequent months: opening_balance auto-computed from previous month's closing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function closingBalance(opening: number, entries: { type: string; amount: number }[]) {
  return entries.reduce(
    (bal, e) => bal + (e.type === 'income' ? Number(e.amount) : -Number(e.amount)),
    Number(opening)
  )
}

async function getSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage
    .from('cash-attachments')
    .createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const sp    = req.nextUrl.searchParams
    const year  = parseInt(sp.get('year')  ?? '0', 10)
    const month = parseInt(sp.get('month') ?? '0', 10)

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year and month required' }, { status: 400 })
    }

    // Fetch the month record
    const { data: monthRow } = await supabase
      .from('cash_months')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .single()

    if (!monthRow) {
      // Doesn't exist yet — compute suggested opening from previous month
      const { data: prevRows } = await supabase
        .from('cash_months')
        .select('id, year, month, opening_balance')
        .order('year',  { ascending: false })
        .order('month', { ascending: false })
        .limit(1)

      if (!prevRows || prevRows.length === 0) {
        return NextResponse.json({ exists: false, isFirst: true, suggestedOpening: null })
      }

      const prev = prevRows[0]
      const { data: prevEntries } = await supabase
        .from('cash_entries')
        .select('type, amount')
        .eq('month_id', prev.id)

      const suggestedOpening = closingBalance(prev.opening_balance, prevEntries ?? [])
      return NextResponse.json({ exists: false, isFirst: false, suggestedOpening })
    }

    // Fetch entries for this month
    const { data: entries, error: entriesErr } = await supabase
      .from('cash_entries')
      .select(`
        id, month_id, entry_date, type, category, amount,
        description, reference, attachment_path, attachment_name,
        created_at, edited_at, customer_id,
        created_by_user:users!cash_entries_created_by_fkey(name),
        edited_by_user:users!cash_entries_edited_by_fkey(name),
        customer:customers(id, name)
      `)
      .eq('month_id', monthRow.id)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (entriesErr) {
      console.error('[cash/month GET] entries error:', entriesErr)
      return NextResponse.json({ error: entriesErr.message }, { status: 500 })
    }

    // Generate signed URLs for attachments
    const entriesWithUrls = await Promise.all(
      (entries ?? []).map(async (e: Record<string, unknown>) => ({
        ...e,
        signed_url: e.attachment_path ? await getSignedUrl(e.attachment_path as string) : null,
        created_by_name: (e.created_by_user as { name: string } | null)?.name ?? 'Unknown',
        edited_by_name:  (e.edited_by_user  as { name: string } | null)?.name ?? null,
        customer_name:   (e.customer as { name: string } | null)?.name ?? null,
      }))
    )

    const totalIncome  = entriesWithUrls.filter(e => e.type === 'income').reduce((s, e)  => s + Number(e.amount), 0)
    const totalExpense = entriesWithUrls.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)
    const closing      = Number(monthRow.opening_balance) + totalIncome - totalExpense

    return NextResponse.json({
      exists:  true,
      month:   monthRow,
      entries: entriesWithUrls,
      summary: {
        opening:       Number(monthRow.opening_balance),
        total_income:  totalIncome,
        total_expense: totalExpense,
        closing,
      },
    })
  } catch (err) {
    console.error('[cash/month GET] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const year  = parseInt(body?.year  ?? '0', 10)
    const month = parseInt(body?.month ?? '0', 10)

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year and month required' }, { status: 400 })
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('cash_months')
      .select('id')
      .eq('year', year)
      .eq('month', month)
      .single()

    if (existing) return NextResponse.json({ error: 'Month already exists' }, { status: 409 })

    // Check if this is the first ever month
    const { data: anyMonth } = await supabase
      .from('cash_months')
      .select('id, year, month, opening_balance')
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
      .limit(1)

    let openingBalance: number

    if (!anyMonth || anyMonth.length === 0) {
      // First ever month — admin must supply opening_balance
      if (body?.opening_balance == null || isNaN(Number(body.opening_balance))) {
        return NextResponse.json({ error: 'opening_balance required for first month' }, { status: 400 })
      }
      openingBalance = Number(body.opening_balance)
    } else {
      // Auto-compute from previous month closing
      const prev = anyMonth[0]
      const { data: prevEntries } = await supabase
        .from('cash_entries')
        .select('type, amount')
        .eq('month_id', prev.id)
      openingBalance = closingBalance(prev.opening_balance, prevEntries ?? [])
    }

    const { data: created, error: createErr } = await supabase
      .from('cash_months')
      .insert({ year, month, opening_balance: openingBalance, created_by: userId })
      .select()
      .single()

    if (createErr) {
      console.error('[cash/month POST] error:', createErr)
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }

    return NextResponse.json({ month: created, summary: { opening: openingBalance, total_income: 0, total_expense: 0, closing: openingBalance } }, { status: 201 })
  } catch (err) {
    console.error('[cash/month POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
