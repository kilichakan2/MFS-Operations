export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'
import { toComplaintDetailWireDto }  from '@/lib/api/complaints/dto'
import { ServiceError }              from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
    const complaintsService = await complaintsServiceForCaller(userId)

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    let detail
    try {
      detail = await complaintsService.findDetailById(id)
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      throw err
    }
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Translate, then prettify BOTH category and received_via at the edge (G1).
    // The spread-override keeps the DTO's insertion order intact (overriding an
    // existing key does not move it).
    const dto = toComplaintDetailWireDto(detail)
    return NextResponse.json({
      ...dto,
      category:    dto.category.replace(/_/g, ' '),
      receivedVia: dto.receivedVia.replace(/_/g, ' '),
    })
  } catch (err) {
    console.error('[detail/complaint]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
