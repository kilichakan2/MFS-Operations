export const dynamic = 'force-dynamic'

/**
 * GET /api/detail/discrepancy
 *
 * F-21: re-pointed off the raw PostgREST fetch onto the owned
 * DiscrepanciesRepository port (service-role singleton in
 * lib/wiring/discrepancies.ts). The route is now thin: guard → id → repo →
 * null→404 → field mapping. It imports ZERO adapters and ZERO vendor SDKs.
 *
 * Byte-identity: the response is the same 12-key object as before. The
 * presentation transforms STAY HERE (reason underscore→space; the
 * `?? 'Unknown'` / `?? ''` / `?? null` fallbacks). The ONE accepted deviation
 * (R4): on a DB-read failure the body is now `{ error: 'Server error' }`
 * instead of the old raw-fetch `{ error: 'DB error' }` — status stays 500, and
 * no client reads the 500 body. This matches every other re-pointed route's 500.
 *
 * Auth: middleware enforces admin role via the /api/detail prefix; the handler
 * verifies x-mfs-user-id is present (preserved verbatim).
 */

import { NextRequest, NextResponse } from 'next/server'
import { discrepanciesRepository } from '@/lib/wiring/discrepancies'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const d = await discrepanciesRepository.findDetailById(id)
    if (d === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      id:         d.id,
      createdAt:  d.createdAt,
      status:     d.status,
      reason:     String(d.reason ?? '').replace(/_/g, ' '),
      orderedQty: d.orderedQty,
      sentQty:    d.sentQty,
      unit:       d.unit ?? '',
      note:       d.note ?? null,
      customer:   d.customerName ?? 'Unknown',
      product:    d.productName  ?? 'Unknown',
      category:   d.productCategory ?? null,
      loggedBy:   d.loggedByName ?? 'Unknown',
    })
  } catch (err) {
    console.error('[detail/discrepancy]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
