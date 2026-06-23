/**
 * app/api/haccp/cold-storage/route.ts
 *
 * GET  — returns all active cold storage units + today's readings
 * POST — submits readings for a session (AM or PM), plus writes a corrective
 *        action row (one per deviating reading) when any reading fails.
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon. The
 * server-side status derivation (DB-driven thresholds), validation, the persist
 * build and the per-deviation CA fan-out moved to the service (PR1,
 * byte-identical). Role gate + ?date= parsing + response key order stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksService, submitHaccpDailyCheck } from '@/lib/wiring/haccp'
import { ConflictError } from '@/lib/errors'
import type { CreateColdStorageReadingsInput } from '@/lib/domain'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
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

    const { units, readings, date } = await haccpDailyChecksService.listColdStorage(queryDate)

    return NextResponse.json({
      units,
      readings,
      date,
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

    const body  = await req.json()
    const input = body as CreateColdStorageReadingsInput
    const today = todayUK()

    // Route-edge dispatch guards that fire BEFORE the units load in the original
    // route, so their precedence (missing-fields 400 → today 400 → units-empty
    // 500) is preserved exactly. The food-safety validation itself lives in the
    // service (validateColdStorage).
    if (!input.session || !input.date || !Array.isArray(input.readings) || input.readings.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (input.date !== today) {
      return NextResponse.json({ error: "Readings may only be submitted for today's date." }, { status: 400 })
    }

    // Derive unit set + thresholds from DB, not from client (A3 + A6).
    const units = await haccpDailyChecksService.listActiveColdStorageUnits()
    if (units.length === 0) {
      return NextResponse.json({ error: 'Could not load active units' }, { status: 500 })
    }

    // hasDeviation drives the CA-payload validation branch. Building is only
    // safe once every reading references a known unit; if a reading references
    // an unknown unit, validateColdStorage returns the unit-unknown 400 first
    // (precedence preserved) and hasDeviation is never consulted.
    const unitIds = new Set(units.map((u) => u.id))
    const allUnitsKnown = input.readings.every((r) => unitIds.has(r.unit_id))
    const hasDeviation = allUnitsKnown
      ? haccpDailyChecksService.buildColdStorage({ input, userId, units }).hasDeviation
      : false

    const v = haccpDailyChecksService.validateColdStorage({ input, today, units, hasDeviation })
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const built = haccpDailyChecksService.buildColdStorage({ input, userId, units })

    let inserted
    try {
      inserted = await haccpDailyChecksService.insertColdStorageReadings(built.rows)
    } catch (e) {
      if (e instanceof ConflictError) {
        return NextResponse.json({ error: e.message }, { status: e.httpStatus })
      }
      throw e
    }

    const caRows = haccpDailyChecksService.buildColdStorageCorrectiveActions({ input, userId, inserted, units })
    const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'cold-storage')

    return NextResponse.json({
      ok:              true,
      has_deviation:   inserted.some((r) => r.temp_status !== 'pass'),
      ca_write_failed,
    })

  } catch (err) {
    console.error('[POST /api/haccp/cold-storage]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
