export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { month_id, entry_date, type, category, amount, description, reference, attachment_path, attachment_name, customer_id } = body

    if (!month_id || !entry_date || !type || !amount || !description) {
      return NextResponse.json({ error: 'month_id, entry_date, type, amount, description required' }, { status: 400 })
    }
    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'type must be income or expense' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }

    // Fetch month to check permissions
    const { data: cashMonth } = await supabase
      .from('cash_months')
      .select('id, year, month, is_locked')
      .eq('id', month_id)
      .single()

    if (!cashMonth) return NextResponse.json({ error: 'Month not found' }, { status: 404 })

    // Locked months: nobody can add
    if (cashMonth.is_locked) {
      return NextResponse.json({ error: 'This month is locked' }, { status: 403 })
    }

    // Office users can only add to the current calendar month
    if (role !== 'admin') {
      const now = new Date()
      const currentYear  = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      if (cashMonth.year !== currentYear || cashMonth.month !== currentMonth) {
        return NextResponse.json({ error: 'Office users can only add entries to the current month' }, { status: 403 })
      }
    }

    // Validate entry_date is within the month
    const entryDate = new Date(entry_date)
    if (entryDate.getFullYear() !== cashMonth.year || entryDate.getMonth() + 1 !== cashMonth.month) {
      return NextResponse.json({ error: 'entry_date must be within the month' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cash_entries')
      .insert({
        month_id,
        entry_date,
        type,
        category: type === 'expense' ? (category ?? null) : null,
        amount:   Number(amount),
        description: String(description).trim(),
        reference:   reference  ? String(reference).trim() : null,
        attachment_path: attachment_path ?? null,
        attachment_name: attachment_name ?? null,
        customer_id: (type === 'income' && customer_id) ? customer_id : null,
        created_by: userId,
      })
      .select(`
        id, month_id, entry_date, type, category, amount,
        description, reference, attachment_path, attachment_name, created_at, customer_id,
        created_by_user:users!cash_entries_created_by_fkey(name),
        customer:customers(id, name)
      `)
      .single()

    if (error) {
      console.error('[cash/entry POST] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const e = data as Record<string, unknown>
    return NextResponse.json({
      entry: {
        ...e,
        created_by_name: (e.created_by_user as { name: string } | null)?.name ?? 'Unknown',
      customer_name:   (e.customer as { name: string } | null)?.name ?? null,
        signed_url: null,
      }
    }, { status: 201 })
  } catch (err) {
    console.error('[cash/entry POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
