/**
 * app/api/haccp/cold-storage/route.ts
 *
 * GET  — returns all active cold storage units + today's readings
 * POST — submits readings for a session (AM or PM)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function tempStatus(temp: number, unitType: string): 'pass' | 'amber' | 'critical' {
  if (unitType === 'freezer') {
    if (temp <= -18) return 'pass'
    if (temp <= -15) return 'amber'
    return 'critical'
  }
  if (unitType === 'room') {
    // Room ambient — CCP 3 limit ≤12°C applied here for twice-daily cold check
    if (temp <= 12) return 'pass'
    if (temp <= 15) return 'amber'
    return 'critical'
  }
  // chiller: ≤5 pass, 5-8 amber, >8 critical (CA-001)
  if (temp <= 5)  return 'pass'
  if (temp <= 8)  return 'amber'
  return 'critical'
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Accept ?date= param for historical date viewing, default to today
    const requestedDate = req.nextUrl.searchParams.get('date')
    const today         = todayUK()
    const queryDate     = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today

    const [units, readings] = await Promise.all([
      supabase.from('haccp_cold_storage_units')
        .select('id, name, unit_type, target_temp_c, max_temp_c')
        .eq('active', true)
        .order('position'),
      supabase.from('haccp_cold_storage_temps')
        .select('unit_id, session, temperature_c, temp_status, comments')
        .eq('date', queryDate),
    ])

    if (units.error) return NextResponse.json({ error: units.error.message }, { status: 500 })

    return NextResponse.json({
      units:    units.data ?? [],
      readings: readings.data ?? [],
      date:     queryDate,
    })
  } catch (err) {
    console.error('[GET /api/haccp/cold-storage]', err)
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
    const { session, date, readings, comments } = body as {
      session:  'AM' | 'PM'
      date:     string
      readings: { unit_id: string; temperature_c: number; unit_type: string }[]
      comments: string
    }

    if (!session || !date || !Array.isArray(readings) || readings.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const rows = readings.map((r) => ({
      submitted_by:              userId,
      date,
      session,
      unit_id:                   r.unit_id,
      temperature_c:             r.temperature_c,
      temp_status:               tempStatus(r.temperature_c, r.unit_type),
      comments:                  comments || null,
      corrective_action_required: tempStatus(r.temperature_c, r.unit_type) !== 'pass',
    }))

    const { error } = await supabase.from('haccp_cold_storage_temps').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const hasDeviation = rows.some((r) => r.temp_status !== 'pass')
    return NextResponse.json({ ok: true, has_deviation: hasDeviation })

  } catch (err) {
    console.error('[POST /api/haccp/cold-storage]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
