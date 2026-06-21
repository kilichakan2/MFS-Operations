export const dynamic = 'force-dynamic'

/**
 * GET  /api/cash/month?year=2026&month=4
 *   Returns the month record + entries with signed attachment URLs.
 *   If month doesn't exist: returns { exists: false, isFirst, suggestedOpening }
 *
 * POST /api/cash/month
 *   Creates a month record. Admin only.
 *   First-ever month: body must include opening_balance.
 *   Subsequent months: opening_balance auto-computed from previous month's closing.
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403/400 gates + the first-month opening_balance 400 stay here; the
 * data reads, the month-summary math and the duplicate-month conflict move to
 * the Cash service/adapter + DTO.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashServiceForCaller }      from '@/lib/wiring/cash'
import { ConflictError }             from '@/lib/errors'
import {
  toMonthWireDto,
  toSummaryWireDto,
  toEntryListWireDto,
} from '@/lib/api/cash/dto'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04e: table reads run as the authenticated caller (RLS fires); the
    // signed-URL mint inside listEntriesForMonth uses the storage port, which
    // stays master-key inside this per-caller service.
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const sp    = req.nextUrl.searchParams
    const year  = parseInt(sp.get('year')  ?? '0', 10)
    const month = parseInt(sp.get('month') ?? '0', 10)

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year and month required' }, { status: 400 })
    }

    const monthRecord = await cashService.findMonth(year, month)

    if (!monthRecord) {
      // Doesn't exist yet — probe the previous month for the suggested opening.
      const probe = await cashService.probeMonth()
      return NextResponse.json({
        exists: false,
        isFirst: probe.isFirst,
        suggestedOpening: probe.suggestedOpening,
      })
    }

    const entries = await cashService.listEntriesForMonth(monthRecord.id)
    const summary = cashService.monthSummary(monthRecord.openingBalance, entries)

    return NextResponse.json({
      exists:  true,
      month:   toMonthWireDto(monthRecord),
      entries: entries.map(toEntryListWireDto),
      summary: toSummaryWireDto(summary),
    })
  } catch (err) {
    console.error('[cash/month GET] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    // F-RLS-04e: run as the authenticated caller (RLS fires).
    // Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
    const cashService = await cashServiceForCaller(userId)

    const body = await req.json().catch(() => null)
    const year  = parseInt(body?.year  ?? '0', 10)
    const month = parseInt(body?.month ?? '0', 10)

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year and month required' }, { status: 400 })
    }

    // First-ever month: admin must supply opening_balance (carry-forward #1).
    // probeMonth().isFirst ⇔ today's "no prior month exists".
    const probe = await cashService.probeMonth()
    if (probe.isFirst && (body?.opening_balance == null || isNaN(Number(body.opening_balance)))) {
      return NextResponse.json({ error: 'opening_balance required for first month' }, { status: 400 })
    }

    try {
      const { month: created, summary } = await cashService.createMonth({
        year,
        month,
        createdBy: userId,
        openingBalance: body?.opening_balance == null ? null : Number(body.opening_balance),
      })
      return NextResponse.json(
        { month: toMonthWireDto(created), summary: toSummaryWireDto(summary) },
        { status: 201 },
      )
    } catch (e) {
      // Duplicate (year,month) surfaces from the UNIQUE constraint via the
      // adapter (PG 23505 → ConflictError), closing today's check-then-insert
      // race with the same 409 wire result (carry-forward #2).
      if (e instanceof ConflictError) {
        return NextResponse.json({ error: 'Month already exists' }, { status: 409 })
      }
      throw e
    }
  } catch (err) {
    console.error('[cash/month POST] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
