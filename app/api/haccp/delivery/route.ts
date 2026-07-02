/**
 * app/api/haccp/delivery/route.ts
 *
 * GET  — today's deliveries + supplier list + next delivery number
 * POST — submit a new delivery record
 *        delivery_number assigned server-side (COUNT today + 1)
 *        batch_number: DDMM-CC-N (ISO alpha-2 from born_in)
 *
 * F-19 PR2: re-pointed off raw Supabase onto the daily-checks hexagon. The
 * range read (incl. week windows + next_number), supplier resolution,
 * validation, batch/temp derivation, the persist build and the CA build moved
 * to the service (PR1, byte-identical). Role gate + ?range= parsing + response
 * key order stay here.
 *
 * W2: an allergen-only delivery (temp pass, covered_contaminated:'no',
 * allergens_identified:true on a meat/poultry category) writes the delivery row
 * with corrective_action_required:true but ZERO CA rows — the gate lives INSIDE
 * `buildDeliveryCorrectiveActions`. This route adds NO allergen-CA logic of its
 * own.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller } from '@/lib/wiring/haccp'
import { ConflictError } from '@/lib/errors'
import type { CreateDeliveryInput, DeliveryRange } from '@/lib/domain'

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpDailyChecksServiceForCaller(userId)

    const range = (req.nextUrl.searchParams.get('range') ?? 'today') as DeliveryRange

    const result = await svc.listDeliveries(range)

    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const dc     = await haccpDailyChecksServiceForCaller(userId)
    const submit = await submitHaccpDailyCheckForCaller(userId)

    const body  = await req.json()
    const input = body as CreateDeliveryInput
    const today = todayUK()

    // Supplier resolution (C2): look up the active supplier when an id is given.
    const supplier = input.supplier_id
      ? await dc.findSupplierForDelivery(input.supplier_id)
      : null

    // Bands are DB-driven — load the CCP-1 thresholds fresh and thread them
    // through grade/build (mirrors the process-room flow). Empty = 500, never a
    // hardcoded fallback (that would resurrect the poultry ≤8°C drift).
    const thresholds = await dc.listGoodsInThresholds()
    if (thresholds.length === 0) {
      return NextResponse.json({ error: 'Could not load thresholds' }, { status: 500 })
    }

    const tempStatus = dc.deliveryTempStatus(input.temperature_c, input.product_category, thresholds)

    const v = dc.validateDelivery({ input, supplier, tempStatus })
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const resolvedSupplierId   = supplier ? supplier.id : null
    const resolvedSupplierName = supplier ? supplier.name : input.supplier_name!.trim()

    const deliveryNumber = (await dc.countDeliveriesOn(today)) + 1

    const built = dc.buildDelivery({
      input,
      userId,
      today,
      nowTime: nowTimeUK(),
      resolvedSupplierId,
      resolvedSupplierName,
      deliveryNumber,
      thresholds,
    })

    let id: string
    try {
      ;({ id } = await dc.insertDelivery(built.persist))
    } catch (e) {
      if (e instanceof ConflictError) {
        return NextResponse.json({ error: e.message }, { status: e.httpStatus })
      }
      throw e
    }

    // W2: the allergen-only gate lives INSIDE buildDeliveryCorrectiveActions —
    // this route adds NO allergen-CA logic of its own.
    const caRows = dc.buildDeliveryCorrectiveActions({
      input,
      userId,
      sourceId: id,
      tempStatus: built.tempStatus,
    })
    const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'delivery')

    return NextResponse.json({
      ok:                         true,
      temp_status:                built.tempStatus,
      corrective_action_required: built.persist.corrective_action_required,
      delivery_number:            deliveryNumber,
      batch_number:               built.persist.batch_number,
      ca_write_failed,
    })

  } catch (err) {
    console.error('[POST /api/haccp/delivery] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
