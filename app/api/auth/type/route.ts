/**
 * app/api/auth/type/route.ts
 * Returns the auth type (pin or password) for a given name.
 * No sensitive data exposed — just tells the login page which input to show.
 *
 * F-13 PR2: re-pointed through usersService (front desk) instead of hitting
 * Supabase directly. `authTypeForName` bakes in the non-enumeration posture
 * (returns 'pin' for an unknown/inactive name). The outer try/catch STAYS so
 * a DB failure (which the service throws on) still yields { authType: 'pin' },
 * byte-identical to today's behaviour.
 */

import { NextRequest, NextResponse } from 'next/server'
import { usersService }              from '@/lib/wiring/users'

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json() as { name: string }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const authType = await usersService.authTypeForName(name.trim())

    return NextResponse.json({ authType })
  } catch {
    // Never reveal whether a name exists or a lookup failed — always 'pin'.
    return NextResponse.json({ authType: 'pin' })
  }
}
