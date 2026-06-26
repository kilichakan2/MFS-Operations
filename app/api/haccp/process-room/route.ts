/**
 * app/api/haccp/process-room/route.ts
 *
 * GET  — today's temperature readings + diary phase completions
 * POST — submit temperature session OR a diary phase
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon.
 * Validation, the persist build and the CA fan-out moved to the service (PR1,
 * byte-identical). The diary CA rows carry `null` disposition + `null`
 * recurrence (preserved inside `buildDailyDiaryCorrectiveActions`). Role gate +
 * ?date= parsing + type dispatch + response key order stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
import { ConflictError } from '@/lib/errors'
import type {
  CreateProcessingTempInput,
  CreateDailyDiaryInput,
} from '@/lib/domain'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const today       = todayUK()
    const requested   = req.nextUrl.searchParams.get('date')
    const queryDate   = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today

    const { date, temps, diary } = await svc.listProcessRoom(queryDate)

    return NextResponse.json({
      date,
      temps,
      diary,
    })

  } catch (err) {
    console.error('[GET /api/haccp/process-room]', err)
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
    const { type } = body as { type: 'temps' | 'diary' }
    const today = todayUK()

    if (type === 'temps') {
      const input = body as CreateProcessingTempInput

      const v = dc.validateProcessingTemp({ input, today })
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      const built = dc.buildProcessingTemp({ input, userId })

      let id: string
      try {
        ;({ id } = await dc.insertProcessingTemp(built))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      const caRows = dc.buildProcessingTempCorrectiveActions({ input, userId, sourceId: id })
      const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'process-room-temps')

      return NextResponse.json({
        ok:              true,
        has_deviation:   !built.within_limits,
        ca_write_failed,
      })
    }

    if (type === 'diary') {
      const input = body as CreateDailyDiaryInput

      const v = dc.validateDailyDiary({ input, today })
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      let id: string
      try {
        ;({ id } = await dc.insertDailyDiary(
          dc.buildDailyDiary({ input, userId }),
        ))
      } catch (e) {
        if (e instanceof ConflictError) {
          return NextResponse.json({ error: e.message }, { status: e.httpStatus })
        }
        throw e
      }

      const caRows = dc.buildDailyDiaryCorrectiveActions({ input, userId, sourceId: id })
      const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'process-room-diary')

      return NextResponse.json({ ok: true, ca_write_failed })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/process-room]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
