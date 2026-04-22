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
      temperature_c, disposition, corrective_action, verified_by, source_batch_number,
    } = body as {
      customer:              string
      customer_id?:          string
      product:               string
      return_code:           string
      return_code_notes?:    string
      temperature_c?:        number | null
      disposition:           string
      corrective_action?:    string
      verified_by:           string
      source_batch_number?:  string
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

    const { data: inserted, error } = await supabase.from('haccp_returns').insert({
      submitted_by:        userId,
      date:                todayUK(),
      time_of_return:      nowTimeUK(),
      customer:            customer.trim(),
      customer_id:         customer_id ?? null,
      product:             product.trim(),
      return_code,
      return_code_notes:   return_code_notes?.trim() || null,
      temperature_c:       temperature_c ?? null,
      disposition,
      verified_by:         verified_by.trim(),
      source_batch_number: source_batch_number?.trim() || null,
      corrective_action:   corrective_action?.trim() || null,
    })
    .select('id')
    .single()

    if (error) {
      console.error('[POST /api/haccp/product-return]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Write to haccp_corrective_actions for all returns (SOP 12 audit trail)
    let caWriteFailed = false
    if (inserted) {
      const isFoodSafety = ['RC01', 'RC02', 'RC04', 'RC05'].includes(return_code)
      const { error: caErr } = await supabase.from('haccp_corrective_actions').insert({
        actioned_by:   userId,
        source_table:  'haccp_returns',
        source_id:     inserted.id,
        ccp_ref:       'SOP12',
        deviation_description: `Product return — ${return_code}: ${
          return_code === 'RC01' && temperature_c != null
            ? `Temperature ${temperature_c}°C on return. `
            : ''
        }Customer: ${customer.trim()}. Product: ${product.trim()}.`,
        action_taken:  corrective_action?.trim() || `Disposition: ${disposition}. Authorised by: ${verified_by.trim()}.`,
        product_disposition:   disposition,
        recurrence_prevention: corrective_action?.trim() ? 'See corrective action notes' : 'Review procedures',
        management_verification_required: isFoodSafety,
      })
      if (caErr) {
        console.error('[POST /api/haccp/product-return] CA insert failed:', caErr)
        caWriteFailed = true
      }
    }

    return NextResponse.json({ ok: true, ca_write_failed: caWriteFailed })

  } catch (err) {
    console.error('[POST /api/haccp/product-return] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
