/**
 * app/api/haccp/corrective-actions/route.ts
 *
 * GET — list corrective actions for admin verification queue
 * Returns unresolved (management_verification_required=true, verified_at=null)
 * and recently resolved (last 20) in a single call.
 * Admin only.
 *
 * F-19 PR2: re-pointed off raw Supabase onto `haccpCorrectiveActionsService`.
 * The admin-only role gate + response shape stay here; the two joined selects
 * moved to the service/adapter (PR1, verbatim columns).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpCorrectiveActionsServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const svc = await haccpCorrectiveActionsServiceForCaller(userId)
    const { unresolved, resolved } = await svc.listVerificationQueue()

    return NextResponse.json({
      unresolved,
      resolved,
    })

  } catch (err) {
    console.error('[GET /api/haccp/corrective-actions]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
