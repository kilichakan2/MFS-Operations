export const dynamic = 'force-dynamic'

/**
 * GET /api/detail/visit?id=<uuid>
 *
 * One visit by id with its customer name + logger name resolved.
 *
 * F-18 PR2: re-pointed onto visitsService.findDetailById + toVisitDetailWireDto.
 * The dto carries the RAW enums; the underscore->space prettify on
 * visitType/outcome is applied HERE at the route edge (spread re-assigns in
 * place so key ORDER is preserved). Wire output is byte-identical (camelCase).
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'
import { toVisitDetailWireDto } from '@/lib/api/visits/dto'
import { ServiceError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    let d
    try {
      d = await visitsService.findDetailById(id)
    } catch (err) {
      // R3: preserve the exact DB-failure 500 body the route emitted today.
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      throw err
    }

    if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const dto = toVisitDetailWireDto(d)
    // Route-edge prettify (enums carried RAW by the dto). Spread re-assigns
    // visitType/outcome in place so key ORDER is unchanged. String(... ?? '')
    // reproduces today's null->'' coercion exactly.
    return NextResponse.json({
      ...dto,
      visitType: String(dto.visitType ?? '').replace(/_/g, ' '),
      outcome:   String(dto.outcome ?? '').replace(/_/g, ' '),
    })
  } catch (err) {
    console.error('[detail/visit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
