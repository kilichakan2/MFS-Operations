/**
 * app/api/haccp/product-return/route.ts
 *
 * GET  — today's return records
 * POST — submit a new product return record
 *
 * Source: MF-001 p.10 · HB-001 SOP 12 · CA-001 Table 5
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon. SOP-12
 * audit trail preserved — `buildReturnCorrectiveActions` always returns exactly
 * one CA row on every POST (not just deviations). Role gate + London-day helpers
 * + response key order stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
import type { CreateReturnInput } from '@/lib/domain'

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
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const today = todayUK()
    const returns = await svc.listReturns()

    return NextResponse.json({ date: today, returns })

  } catch (err) {
    console.error('[GET /api/haccp/product-return] Unhandled:', err)
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
    const input = body as CreateReturnInput

    const v = dc.validateReturn(input)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const { id } = await dc.insertReturn(
      dc.buildReturn({ input, userId, today: todayUK(), nowTime: nowTimeUK() }),
    )

    // SOP 12: a CA row on EVERY return (audit trail), not just deviations.
    const caRows = dc.buildReturnCorrectiveActions({ input, userId, sourceId: id })
    const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'product-return')

    return NextResponse.json({ ok: true, ca_write_failed })

  } catch (err) {
    console.error('[POST /api/haccp/product-return] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
