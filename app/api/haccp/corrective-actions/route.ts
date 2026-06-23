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
import { haccpCorrectiveActionsService } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const { unresolved, resolved } = await haccpCorrectiveActionsService.listVerificationQueue()

    return NextResponse.json({
      unresolved,
      resolved,
    })

  } catch (err) {
    console.error('[GET /api/haccp/corrective-actions]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
