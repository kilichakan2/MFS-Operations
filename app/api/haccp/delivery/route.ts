/**
 * app/api/haccp/delivery/route.ts
 *
 * GET  — today's deliveries + supplier list + next delivery number
 * POST — submit a new delivery record
 *        delivery_number assigned server-side (COUNT today + 1)
 *        batch_number recomputed server-side with delivery_number appended
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

function tempStatus(temp: number, category: string): 'pass' | 'urgent' | 'fail' {
  switch (category) {
    case 'red_meat':   return temp <= 5.0  ? 'pass' : temp <= 8.0   ? 'urgent' : 'fail'
    case 'offal':      return temp <= 3.0  ? 'pass' : 'fail'
    case 'mince_prep': return temp <= 4.0  ? 'pass' : 'fail'
    case 'frozen':     return temp <= -18.0 ? 'pass' : temp <= -15.0 ? 'urgent' : 'fail'
    default:           return 'fail'
  }
}

// Build batch number — same logic as client side
// Format: DDMM-COUNTRYCODE-SLAUGHTERSITE-N
function buildBatchNumber(
  date: string,
  countryCode: string,
  slaughterSite: string,
  deliveryNumber: number,
): string {
  const d   = new Date(date + 'T00:00:00')
  const dd  = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}-${countryCode}-${slaughterSite}-${deliveryNumber}`
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
        .select(`
          id, date, time_of_delivery, supplier, product, product_category,
          temperature_c, temp_status, covered_contaminated, contamination_notes, notes,
          country_of_origin, slaughter_site, cut_site, batch_number, delivery_number,
          submitted_at, users!inner(name)
        `)
        .eq('date', today)
        .order('delivery_number', { ascending: true }),
      supabase
        .from('haccp_suppliers')
        .select('id, name')
        .eq('active', true)
        .order('position'),
    ])

    if (deliveries.error) return NextResponse.json({ error: deliveries.error.message }, { status: 500 })
    if (suppliers.error)  return NextResponse.json({ error: suppliers.error.message  }, { status: 500 })

    const todayDeliveries = deliveries.data ?? []
    const nextNumber      = todayDeliveries.length + 1

    return NextResponse.json({
      date:         today,
      deliveries:   todayDeliveries,
      suppliers:    suppliers.data ?? [],
      next_number:  nextNumber,  // preview for the form
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
      country_of_origin, slaughter_site, cut_site,
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
      cut_site?:            string
    }

    if (!supplier?.trim())       return NextResponse.json({ error: 'Supplier is required' },           { status: 400 })
    if (!product?.trim())        return NextResponse.json({ error: 'Product description is required' }, { status: 400 })
    if (!product_category)       return NextResponse.json({ error: 'Select a product category' },       { status: 400 })
    if (temperature_c == null || isNaN(temperature_c))
      return NextResponse.json({ error: 'Temperature is required' }, { status: 400 })
    if (!covered_contaminated)
      return NextResponse.json({ error: 'Covered / contaminated field is required' }, { status: 400 })

    const today  = todayUK()
    const status = tempStatus(temperature_c, product_category)
    const corrective_action_required = status !== 'pass' || covered_contaminated !== 'no'

    // Count today's deliveries to assign sequential delivery_number
    const { count, error: countErr } = await supabase
      .from('haccp_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('date', today)

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    const deliveryNumber = (count ?? 0) + 1

    // Compute batch number server-side — includes delivery number
    const batchNumber =
      country_of_origin && slaughter_site?.trim()
        ? buildBatchNumber(today, country_of_origin.trim(), slaughter_site.trim(), deliveryNumber)
        : null

    const { error } = await supabase.from('haccp_deliveries').insert({
      submitted_by:             userId,
      date:                     today,
      time_of_delivery:         nowTimeUK(),
      supplier:                 supplier.trim(),
      product:                  product.trim(),
      product_category,
      temperature_c,
      temp_status:              status,
      covered_contaminated,
      contamination_notes:      contamination_notes?.trim() || null,
      corrective_action_required,
      notes:                    notes?.trim() || null,
      country_of_origin:        country_of_origin?.trim() || null,
      slaughter_site:           slaughter_site?.trim() || null,
      cut_site:                 cut_site?.trim() || null,
      delivery_number:          deliveryNumber,
      batch_number:             batchNumber,
    })

    if (error) {
      console.error('[POST /api/haccp/delivery]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      temp_status: status,
      corrective_action_required,
      delivery_number: deliveryNumber,
      batch_number:    batchNumber,
    })

  } catch (err) {
    console.error('[POST /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
