/**
 * app/api/haccp/corrective-actions/[id]/route.ts
 *
 * PATCH — sign off a corrective action
 * Sets verified_at = now(), verified_by = admin user ID, resolved = true
 * Admin only.
 *
 * F-19 PR2: re-pointed off raw Supabase onto `haccpCorrectiveActionsService`.
 * The admin-only role gate + the `!id` param guard stay here; the update (which
 * stamps `verified_at = now()`, `resolved = true` and applies the
 * `management_verification_required` filter) moved to the service/adapter (PR1).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpCorrectiveActionsServiceForCaller } from '@/lib/wiring/haccp'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')

    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const svc = await haccpCorrectiveActionsServiceForCaller(userId)
    await svc.signOff(id, userId)

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[PATCH /api/haccp/corrective-actions/:id] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
