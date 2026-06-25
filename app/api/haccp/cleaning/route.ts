/**
 * app/api/haccp/cleaning/route.ts
 *
 * GET  — today's cleaning log entries
 * POST — submit a new cleaning event
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon
 * (`haccpDailyChecksService` + `submitHaccpDailyCheck`) from `lib/wiring/haccp`.
 * The role-cookie gate + London-day helpers + response key order stay here;
 * validation, the persist build and the CA build moved to the service (PR1,
 * byte-identical). Behaviour is unchanged.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
import type { CreateCleaningInput } from '@/lib/domain'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const today = todayUK()
    const entries = await svc.listCleaning()

    return NextResponse.json({
      date:    today,
      entries,
    })

  } catch (err) {
    console.error('[GET /api/haccp/cleaning] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const dc     = await haccpDailyChecksServiceForCaller(userId)
    const submit = await submitHaccpDailyCheckForCaller(userId)

    const body = await req.json()
    const input = body as CreateCleaningInput

    const v = dc.validateCleaning(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const { id } = await dc.insertCleaning(
      dc.buildCleaning({ input, userId, today: todayUK(), nowTime: nowTimeUK() }),
    )

    const caRows = dc.buildCleaningCorrectiveActions({ input, userId, sourceId: id })
    const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'cleaning')

    return NextResponse.json({ ok: true, ca_write_failed })

  } catch (err) {
    console.error('[POST /api/haccp/cleaning] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
