/**
 * app/api/haccp/supplier-code/route.ts
 *
 * GET ?name=Euro Quality Lambs
 * Returns supplier label_code for 58mm Sunmi label printing.
 * Falls back to first 4 chars of name if no match.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpSuppliersServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  const role   = req.headers.get('x-mfs-user-role')
  const userId = req.headers.get('x-mfs-user-id')
  if (!role || !userId || !['warehouse', 'butcher', 'admin', 'driver'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const svc = await haccpSuppliersServiceForCaller(userId)
  const result = await svc.getLabelCode(name)
  return NextResponse.json(result)
}
