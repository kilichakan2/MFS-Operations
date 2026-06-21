export const dynamic = 'force-dynamic'

/**
 * GET /api/screen2/all
 *
 * Returns ALL complaints (open + resolved), newest first.
 * Each complaint includes its full notes thread.
 * Used by the AllComplaintsTab on /complaints.
 *
 * Does NOT filter by user — all complaints visible to all authenticated users.
 */

import { NextRequest, NextResponse } from 'next/server'
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'
import { toComplaintListItemWireDto } from '@/lib/api/complaints/dto'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
    const complaintsService = await complaintsServiceForCaller(userId)

    const complaints = await complaintsService.listAllWithNotes()

    // Translate to the wire shape, then prettify category at the edge (the
    // domain carries the RAW enum; the underscore->space transform is a route
    // concern — G1). Bare array, NOT a { complaints } wrapper.
    const result = complaints.map(c => {
      const dto = toComplaintListItemWireDto(c)
      return { ...dto, category: dto.category.replace(/_/g, ' ') }
    })

    return NextResponse.json(result)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/all] error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
