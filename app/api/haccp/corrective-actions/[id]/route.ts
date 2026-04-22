/**
 * app/api/haccp/corrective-actions/[id]/route.ts
 *
 * PATCH — sign off a corrective action
 * Sets verified_at = now(), verified_by = admin user ID, resolved = true
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value

    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { error } = await supabase
      .from('haccp_corrective_actions')
      .update({
        verified_by: userId,
        verified_at: new Date().toISOString(),
        resolved:    true,
      })
      .eq('id', id)
      .eq('management_verification_required', true)

    if (error) {
      console.error('[PATCH /api/haccp/corrective-actions/:id]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[PATCH /api/haccp/corrective-actions/:id] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
