/**
 * app/api/haccp/corrective-actions/route.ts
 *
 * GET — list corrective actions for admin verification queue
 * Returns unresolved (management_verification_required=true, verified_at=null)
 * and recently resolved (last 20) in a single call.
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const [unresolved, resolved] = await Promise.all([
      supabase
        .from('haccp_corrective_actions')
        .select('id, submitted_at, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, source_table, management_verification_required, users!actioned_by(name)')
        .eq('management_verification_required', true)
        .is('verified_at', null)
        .order('submitted_at', { ascending: false }),

      supabase
        .from('haccp_corrective_actions')
        .select('id, submitted_at, verified_at, ccp_ref, deviation_description, action_taken, source_table, users!actioned_by(name), verifier:users!verified_by(name)')
        .eq('management_verification_required', true)
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(20),
    ])

    if (unresolved.error) return NextResponse.json({ error: unresolved.error.message }, { status: 500 })
    if (resolved.error)   return NextResponse.json({ error: resolved.error.message   }, { status: 500 })

    return NextResponse.json({
      unresolved: unresolved.data ?? [],
      resolved:   resolved.data   ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/corrective-actions]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
