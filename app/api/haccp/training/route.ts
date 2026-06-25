/**
 * app/api/haccp/training/route.ts
 *
 * Actual haccp_staff_training columns:
 *   id, submitted_at, logged_by, staff_user_id, staff_name,
 *   training_type, completion_date, confirmation_items,
 *   supervisor_signed_by (uuid — unused), supervisor_signed_at,
 *   document_version, job_role, refresh_date, supervisor_name
 *
 * F-19 PR4: persistence moved behind the HaccpTraining hexagon. This route is
 * presentation only — the cookie role gate + the wall clock stay here; the
 * service owns validate/build/write. Behaviour is byte-identical to the prior
 * inline supabaseService calls.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpTrainingServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const svc = await haccpTrainingServiceForCaller(userId)
    const result = await svc.getTraining()
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/training] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')

    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const svc = await haccpTrainingServiceForCaller(userId)

    const body = await req.json()
    const { training_type } = body

    // ── Butchery & Process Room / Warehouse Operative ────────────────────────
    if (training_type === 'butchery_process_room' || training_type === 'warehouse_operative') {
      const v = svc.validateStaffTraining(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await svc.insertStaffTraining(
        svc.buildStaffTrainingPersist({ input: body, userId, now: new Date() }),
      )

      return NextResponse.json({ ok: true })
    }

    // ── Allergen Awareness ───────────────────────────────────────────────────
    // Uses haccp_allergen_training (different table + different column names)
    // certification_date, training_completed — NOT completion_date, training_type
    if (training_type === 'allergen_awareness') {
      const v = svc.validateAllergenTraining(body)
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

      await svc.insertAllergenTraining(
        svc.buildAllergenTrainingPersist({ input: body, userId }),
      )

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid training_type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/training] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
