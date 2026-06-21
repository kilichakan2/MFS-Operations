export const dynamic = 'force-dynamic'

/**
 * GET /api/screen2/open
 * Returns ALL OPEN complaints (any user), newest first, with logger name.
 * Uses raw fetch() to the Supabase REST API (avoids cold-start client issues).
 */

import { NextRequest, NextResponse } from 'next/server'
import { complaintsService }         from '@/lib/wiring/complaints'
import { toOpenComplaintWireDto }    from '@/lib/api/complaints/dto'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const open = await complaintsService.listOpen()

    // Translate to the wire shape, then prettify category at the edge (RAW enum
    // in the domain; underscore->space is a route concern — G1). Bare array.
    const complaints = open.map((c) => {
      const dto = toOpenComplaintWireDto(c)
      return { ...dto, category: dto.category.replace(/_/g, ' ') }
    })

    return NextResponse.json(complaints)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/open] Unhandled error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
