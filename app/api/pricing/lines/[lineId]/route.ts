export const dynamic = 'force-dynamic'

/**
 * PATCH  /api/pricing/lines/[lineId]  — edit a line
 * DELETE /api/pricing/lines/[lineId]  — remove a line
 * Access: sales own agreements only; office/admin any
 *
 * F-15 PR2: re-pointed through `pricingService`. RBAC walks the line →
 * agreement owner via getLineOwner; a DB error there is swallowed to a denial
 * (→ 403) to match today (F-TD-24). Responses byte-identical via toLineWireDto.
 *
 * F-RLS-04d: runs under the per-caller authenticated client so RLS fires.
 * Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
 * The owner check lives in `checkAccess`, so the per-caller service is built
 * ONCE per handler (after the 401 check) and threaded into `checkAccess` AND
 * reused for the mutation — one token per request, never two (R-BIZ-3).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pricingServiceForCaller }   from '@/lib/wiring/pricing'
import { toLineWireDto }             from '@/lib/api/pricing/dto'
import type { PricingService } from '@/lib/services'
import type { UpdateLineInput, PriceUnit } from '@/lib/domain'

type Params = { params: Promise<{ lineId: string }> }

async function checkAccess(
  svc: PricingService,
  lineId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  const isManager = role === 'office' || role === 'admin'
  if (isManager) return true

  // Sales: verify the line belongs to an agreement owned by this user. Today
  // a DB error here was ignored (`const { data }`) → false; reproduce that.
  let owner
  try {
    owner = await svc.getLineOwner(lineId)
  } catch {
    owner = null
  }
  return owner !== null && owner.agreedBy === userId
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // F-RLS-04d: build the per-caller authenticated service ONCE (RLS fires) and
  // reuse it for the owner check AND the mutation — one token per request.
  // Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
  const pricingService = await pricingServiceForCaller(userId)

  const allowed = await checkAccess(pricingService, lineId, userId, role)
  if (!allowed) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  let body: Record<string, unknown> | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (body.price !== undefined && (typeof body.price !== 'number' || body.price <= 0)) {
    return NextResponse.json({ error: 'price must be > 0' }, { status: 400 })
  }

  // Build the patch from the present fields, keeping the '' → null
  // normalisation in the route (matches today's field loop).
  const patch: {
    productId?: string | null
    productNameOverride?: string | null
    price?: number
    unit?: PriceUnit
    notes?: string | null
    position?: number
  } = {}
  const norm = (v: unknown) => (v === '' ? null : v)
  if ('product_id' in body)            patch.productId           = norm(body.product_id) as string | null
  if ('product_name_override' in body) patch.productNameOverride = norm(body.product_name_override) as string | null
  if ('price' in body)                 patch.price               = norm(body.price) as number
  if ('unit' in body)                  patch.unit                = norm(body.unit) as PriceUnit
  if ('notes' in body)                 patch.notes               = norm(body.notes) as string | null
  if ('position' in body)              patch.position            = norm(body.position) as number

  let line
  try {
    line = await pricingService.updateLine(lineId, patch as UpdateLineInput)
  } catch (err) {
    console.error('[pricing lines PATCH]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  if (!line) {
    console.error('[pricing lines PATCH]', undefined)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(toLineWireDto(line))
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // F-RLS-04d: build the per-caller authenticated service ONCE (RLS fires) and
  // reuse it for the owner check AND the mutation — one token per request.
  // Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
  const pricingService = await pricingServiceForCaller(userId)

  const allowed = await checkAccess(pricingService, lineId, userId, role)
  if (!allowed) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  try {
    await pricingService.deleteLine(lineId)
  } catch (err) {
    console.error('[pricing lines DELETE]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
