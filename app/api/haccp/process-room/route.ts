/**
 * app/api/haccp/process-room/route.ts
 *
 * GET  — today's temperature readings + diary phase completions
 * POST — submit temperature session OR a diary phase
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()

    const [temps, diary] = await Promise.all([
      supabase
        .from('haccp_processing_temps')
        .select('session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, submitted_at')
        .eq('date', today)
        .order('submitted_at'),
      supabase
        .from('haccp_daily_diary')
        .select('phase, check_results, issues, what_did_you_do, submitted_at')
        .eq('date', today)
        .order('submitted_at'),
    ])

    if (temps.error) return NextResponse.json({ error: temps.error.message }, { status: 500 })
    if (diary.error) return NextResponse.json({ error: diary.error.message }, { status: 500 })

    return NextResponse.json({
      date:  today,
      temps: temps.data ?? [],
      diary: diary.data ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/process-room]', err)
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
    const { type } = body as { type: 'temps' | 'diary' }

    if (type === 'temps') {
      const { session, date, product_temp_c, room_temp_c } = body as {
        session:       'AM' | 'PM'
        date:          string
        product_temp_c: number
        room_temp_c:    number
      }

      if (!session || !date || product_temp_c == null || room_temp_c == null) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      const productPass = product_temp_c <= 4.0
      const roomPass    = room_temp_c    <= 12.0
      const bothPass    = productPass && roomPass

      const { error } = await supabase.from('haccp_processing_temps').insert({
        submitted_by:              userId,
        date,
        session,
        product_temp_c,
        room_temp_c,
        product_within_limit:      productPass,
        room_within_limit:         roomPass,
        within_limits:             bothPass,
        corrective_action_required: !bothPass,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, has_deviation: !bothPass })
    }

    if (type === 'diary') {
      const { phase, date, check_results, issues, what_did_you_do } = body as {
        phase:            'opening' | 'operational' | 'closing'
        date:             string
        check_results:    Record<string, boolean>
        issues:           boolean
        what_did_you_do?: string
      }

      if (!phase || !date || !check_results) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      if (issues && !what_did_you_do?.trim()) {
        return NextResponse.json({ error: 'Please describe what was done about the issue' }, { status: 400 })
      }

      const { error } = await supabase.from('haccp_daily_diary').insert({
        submitted_by:   userId,
        date,
        phase,
        check_results,
        issues,
        what_did_you_do: what_did_you_do?.trim() || null,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/process-room]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
