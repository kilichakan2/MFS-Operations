/**
 * app/api/haccp/users/route.ts
 *
 * Returns all active users for HACCP selectors (reviewed by, approved by, etc.)
 * Ordered: admins first (Hakan, Ege), then by name.
 * Any logged-in HACCP role can access — needed to display selector labels.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpLookupsServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpLookupsServiceForCaller(userId)

    const result = await svc.getUsers()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/users]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
