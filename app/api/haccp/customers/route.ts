/**
 * app/api/haccp/customers/route.ts
 * GET — active customer list for HACCP forms
 * Returns id + name only
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpLookupsService }       from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpLookupsService.getCustomers()
    return NextResponse.json(result)

  } catch (err) {
    console.error('[GET /api/haccp/customers] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
