/**
 * app/api/haccp/product-return/route.ts
 *
 * GET  — today's return records
 * POST — submit a new product return record
 *
 * Source: MF-001 p.10 · HB-001 SOP 12 · CA-001 Table 5
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()

    const { data, error } = await supabase
      .from('haccp_returns')
      .select(`
        id, date, time_of_return, customer, product,
        temperature_c, return_code, return_code_notes,
        disposition, corrective_action, verified_by, submitted_at,
        users!inner(name)
      `)
      .eq('date', today)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('[GET /api/haccp/product-return]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ date: today, returns: data ?? [] })

  } catch (err) {
    console.error('[GET /api/haccp/product-return] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const {
      customer, customer_id, product, return_code, return_code_notes,
      temperature_c, disposition, corrective_action, verified_by,
    } = body as {
      customer:           string
      customer_id?:       string
      product:            string
      return_code:        string
      return_code_notes?: string
      temperature_c?:     number | null
      disposition:        string
      corrective_action?: string
      verified_by:        string
    }

    if (!customer?.trim())    return NextResponse.json({ error: 'Customer is required' },             { status: 400 })
    if (!product?.trim())     return NextResponse.json({ error: 'Product description is required' },  { status: 400 })
    if (!return_code)         return NextResponse.json({ error: 'Select a return reason code' },      { status: 400 })
    if (!disposition)         return NextResponse.json({ error: 'Select a disposition' },             { status: 400 })
    if (!verified_by?.trim()) return NextResponse.json({ error: 'Verified by is required' },          { status: 400 })
    if (return_code === 'RC08' && !return_code_notes?.trim())
      return NextResponse.json({ error: 'Please specify the reason for RC08 Other' }, { status: 400 })
    if (return_code === 'RC01' && (temperature_c == null || isNaN(temperature_c)))
      return NextResponse.json({ error: 'Temperature is required for temperature complaints' }, { status: 400 })

    const { error } = await supabase.from('haccp_returns').insert({
      submitted_by:      userId,
      date:              todayUK(),
      time_of_return:    nowTimeUK(),
      customer:          customer.trim(),
      customer_id:       customer_id ?? null,
      product:           product.trim(),
      return_code,
      return_code_notes: return_code_notes?.trim() || null,
      temperature_c:     temperature_c ?? null,
      disposition,
      verified_by:       verified_by.trim(),
      corrective_action: corrective_action?.trim() || null,
    })

    if (error) {
      console.error('[POST /api/haccp/product-return]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[POST /api/haccp/product-return] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
