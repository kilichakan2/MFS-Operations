/**
 * app/api/haccp/reviews/route.ts
 *
 * GET  — weekly/monthly history + due status
 * POST — submit weekly or monthly review
 *
 * Source: MF-001 p.12-15 · HB-001 SOP 5, 9, 11 · CA-001 weekly/monthly section
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

/** Monday of the current week (UK) */
function thisWeekMonday(): string {
  const now  = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))
  const day  = now.getDay() === 0 ? 6 : now.getDay() - 1
  const mon  = new Date(now)
  mon.setDate(now.getDate() - day)
  return mon.toLocaleDateString('en-CA')
}

/** Sunday of the current week */
function thisWeekSunday(): string {
  const mon  = new Date(thisWeekMonday())
  const sun  = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return sun.toLocaleDateString('en-CA')
}

/** First/last day of current month */
function thisMonthRange(): { from: string; to: string } {
  const now = new Date()
  const tz  = 'Europe/London'
  const y   = now.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 4)
  const m   = now.toLocaleDateString('en-CA', { timeZone: tz }).slice(5, 7)
  return { from: `${y}-${m}-01`, to: `${y}-${m}-31` }
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const monday  = thisWeekMonday()
    const sunday  = thisWeekSunday()
    const { from: mFrom, to: mTo } = thisMonthRange()

    const [weekly, monthly] = await Promise.all([
      supabase
        .from('haccp_weekly_review')
        .select('id, week_ending, date, assessments, submitted_at, users!inner(name)')
        .order('submitted_at', { ascending: false })
        .limit(10),
      supabase
        .from('haccp_monthly_review')
        .select('id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, submitted_at, users!inner(name)')
        .order('submitted_at', { ascending: false })
        .limit(6),
    ])

    if (weekly.error)  return NextResponse.json({ error: weekly.error.message  }, { status: 500 })
    if (monthly.error) return NextResponse.json({ error: monthly.error.message }, { status: 500 })

    const weeklyRecords  = weekly.data  ?? []
    const monthlyRecords = monthly.data ?? []

    const weeklyDone  = weeklyRecords.some((r) => r.week_ending >= monday && r.week_ending <= sunday)
    const monthlyDone = monthlyRecords.some((r) => r.month_year >= mFrom  && r.month_year <= mTo)

    return NextResponse.json({
      weekly:       weeklyRecords,
      monthly:      monthlyRecords,
      weekly_done:  weeklyDone,
      monthly_done: monthlyDone,
    })

  } catch (err) {
    console.error('[GET /api/haccp/reviews] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const body = await req.json()
    const { type } = body

    if (type === 'weekly') {
      const { week_ending, assessments } = body
      if (!week_ending)                return NextResponse.json({ error: 'Week ending date required' }, { status: 400 })
      if (!assessments || !Array.isArray(assessments)) return NextResponse.json({ error: 'Assessments required' }, { status: 400 })

      const { error } = await supabase.from('haccp_weekly_review').insert({
        submitted_by: userId,
        week_ending,
        date:         todayUK(),
        assessments,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (type === 'monthly') {
      const { month_year, equipment_checks, facilities_checks, haccp_system_review, further_notes } = body
      if (!month_year)          return NextResponse.json({ error: 'Month/year required' }, { status: 400 })
      if (!equipment_checks)    return NextResponse.json({ error: 'Equipment checks required' }, { status: 400 })
      if (!facilities_checks)   return NextResponse.json({ error: 'Facilities checks required' }, { status: 400 })
      if (!haccp_system_review) return NextResponse.json({ error: 'HACCP system review required' }, { status: 400 })

      const { error } = await supabase.from('haccp_monthly_review').insert({
        submitted_by:      userId,
        month_year,
        date:              todayUK(),
        equipment_checks,
        facilities_checks,
        haccp_system_review,
        further_notes:     further_notes?.trim() || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid type — must be weekly or monthly' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/reviews] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
