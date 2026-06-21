export const dynamic = 'force-dynamic'

/**
 * GET /api/compliments/users
 * Returns all active users for the compliments recipient dropdown.
 * Accessible to all roles (shared path in middleware).
 */

import { NextRequest, NextResponse } from 'next/server'
import { complimentsService }        from '@/lib/wiring/compliments'
import { toRecipientWireDto }        from '@/lib/api/compliments/dto'
import { ServiceError }              from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const recipients = await complimentsService.listActiveRecipients()
    return NextResponse.json({ users: recipients.map(toRecipientWireDto) })

  } catch (err) {
    if (err instanceof ServiceError) {
      console.error('[compliments/users GET]', err.message)
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
    }
    console.error(`[compliments/users GET] Unhandled error:`, err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
