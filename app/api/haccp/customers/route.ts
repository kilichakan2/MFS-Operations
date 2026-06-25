/**
 * app/api/haccp/customers/route.ts
 * GET — active customer list for HACCP forms
 * Returns id + name only
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

    const result = await svc.getCustomers()
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/customers] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
