/**
 * app/api/auth/type/route.ts
 * Returns the auth type (pin or password) for a given name.
 * No sensitive data exposed — just tells the login page which input to show.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json() as { name: string }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('role, active')
      .ilike('name', name.trim())
      .single()

    if (error || !user) {
      // Return 'pin' as default — don't reveal whether a name exists
      return NextResponse.json({ authType: 'pin' })
    }

    if (!user.active) {
      return NextResponse.json({ authType: 'pin' })
    }

    return NextResponse.json({
      authType: user.role === 'admin' ? 'password' : 'pin'
    })
  } catch {
    return NextResponse.json({ authType: 'pin' })
  }
}
