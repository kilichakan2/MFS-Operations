/**
 * app/api/haccp/reviews/route.ts
 *
 * GET  — weekly/monthly history + due status
 * POST — submit weekly or monthly review
 *
 * Source: MF-001 p.12-15 · HB-001 SOP 5, 9, 11 · CA-001 weekly/monthly section
 *
 * F-19 PR6 (Cluster D re-point): the route no longer touches Supabase directly —
 * it delegates to `haccpReviewsService` (wired in lib/wiring/haccp.ts). The
 * timezone/wall-clock helpers stay at the route edge and the computed date
 * windows are passed IN (the service is deterministic, never calls `new Date()`).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReviewsService }       from '@/lib/wiring/haccp'

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

    const result = await haccpReviewsService.getReviews({ monday, sunday, mFrom, mTo })
    return NextResponse.json(result)

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
      const valid = haccpReviewsService.validateWeekly(body)
      if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

      const persist  = haccpReviewsService.buildWeeklyPersist({ input: body, userId, today: todayUK() })
      const inserted = await haccpReviewsService.insertWeeklyReview(persist)

      // Write CA rows for every problem item (best-effort — never throws)
      const caRows = haccpReviewsService.buildWeeklyCorrectiveActions({
        input: body, userId, reviewId: inserted.id, weekEnding: body.week_ending,
      })
      if (caRows.length > 0) await haccpReviewsService.insertCorrectiveActions(caRows)

      return NextResponse.json({ ok: true, problems: caRows.length })
    }

    if (type === 'monthly') {
      const valid = haccpReviewsService.validateMonthly(body)
      if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

      const persist  = haccpReviewsService.buildMonthlyPersist({ input: body, userId, today: todayUK() })
      const inserted = await haccpReviewsService.insertMonthlyReview(persist)

      // Write CA rows for problematic system review items (best-effort — never throws)
      const caRows = haccpReviewsService.buildMonthlySystemCorrectiveActions({
        input: body, userId, reviewId: inserted.id, monthYear: body.month_year,
      })
      if (caRows.length > 0) await haccpReviewsService.insertCorrectiveActions(caRows)

      return NextResponse.json({ ok: true, problems: caRows.length })
    }

    return NextResponse.json({ error: 'Invalid type — must be weekly or monthly' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/reviews] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
