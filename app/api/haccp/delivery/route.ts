/**
 * app/api/haccp/delivery/route.ts
 *
 * GET  — today's deliveries + supplier list
 * POST — submit a new delivery record
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

// Temperature pass/fail logic per product category (CA-001 V1.1)
// Red meat: ≤5°C pass · 5–8°C conditional accept (urgent) · >8°C reject
// Frozen:   ≤-18°C pass · -15 to -18°C conditional (refreeze immediately) · >-15°C reject
function tempStatus(temp: number, category: string): 'pass' | 'urgent' | 'fail' {
  switch (category) {
    case 'red_meat':    return temp <= 5.0 ? 'pass' : temp <= 8.0 ? 'urgent' : 'fail'
    case 'offal':       return temp <= 3.0 ? 'pass' : 'fail'
    case 'mince_prep':  return temp <= 4.0 ? 'pass' : 'fail'
    case 'frozen':      return temp <= -18.0 ? 'pass' : temp <= -15.0 ? 'urgent' : 'fail'
    default:            return 'fail'
  }
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()

    const [deliveries, suppliers] = await Promise.all([
      supabase
        .from('haccp_deliveries')
        .select('id, date, time_of_delivery, supplier, product, product_category, temperature_c, temp_status, covered_contaminated, contamination_notes, notes, country_of_origin, slaughter_site, batch_number, submitted_at, users!inner(name)')
        .eq('date', today)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('haccp_suppliers')
        .select('id, name')
        .eq('active', true)
        .order('position'),
    ])

    if (deliveries.error) return NextResponse.json({ error: deliveries.error.message }, { status: 500 })
    if (suppliers.error)  return NextResponse.json({ error: suppliers.error.message  }, { status: 500 })

    return NextResponse.json({
      date:       today,
      deliveries: deliveries.data ?? [],
      suppliers:  suppliers.data  ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/delivery] Unhandled:', err)
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
      supplier, product, product_category, temperature_c,
      covered_contaminated, contamination_notes, notes,
      country_of_origin, slaughter_site, batch_number,
    } = body as {
      supplier:             string
      product:              string
      product_category:     string
      temperature_c:        number
      covered_contaminated: string
      contamination_notes?: string
      notes?:               string
      country_of_origin?:   string
      slaughter_site?:      string
      batch_number?:        string
    }

    if (!supplier?.trim())          return NextResponse.json({ error: 'Supplier is required' },          { status: 400 })
    if (!product?.trim())           return NextResponse.json({ error: 'Product description is required' },{ status: 400 })
    if (!product_category)          return NextResponse.json({ error: 'Select a product category' },      { status: 400 })
    if (temperature_c == null || isNaN(temperature_c)) return NextResponse.json({ error: 'Temperature is required' }, { status: 400 })
    if (!covered_contaminated)      return NextResponse.json({ error: 'Covered / contaminated field is required' }, { status: 400 })

    const status = tempStatus(temperature_c, product_category)
    const corrective_action_required = status !== 'pass' || covered_contaminated !== 'no'

    const { error } = await supabase.from('haccp_deliveries').insert({
      submitted_by:           userId,
      date:                   todayUK(),
      time_of_delivery:       nowTimeUK(),
      supplier:               supplier.trim(),
      product:                product.trim(),
      product_category,
      temperature_c,
      temp_status:            status,
      covered_contaminated,
      contamination_notes:    contamination_notes?.trim() || null,
      corrective_action_required,
      notes:                  notes?.trim() || null,
      country_of_origin:      country_of_origin?.trim() || null,
      slaughter_site:         slaughter_site?.trim() || null,
      batch_number:           batch_number?.trim() || null,
    })

    if (error) {
      console.error('[POST /api/haccp/delivery]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, temp_status: status, corrective_action_required })

  } catch (err) {
    console.error('[POST /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
