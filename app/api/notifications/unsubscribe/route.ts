/**
 * app/api/notifications/unsubscribe/route.ts
 *
 * DELETE /api/notifications/unsubscribe
 * Removes a push subscription for the current user.
 *
 * Body: { endpoint }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function DELETE(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[DELETE /api/notifications/unsubscribe]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
