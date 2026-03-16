/**
 * app/api/auth/login/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles PIN and password authentication.
 * Verifies bcrypt hash against Supabase users table.
 * Returns a session cookie with role and user ID on success.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import bcrypt                        from 'bcryptjs'
import { cookies }                   from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Role → redirect destination
const ROLE_ROUTES: Record<string, string> = {
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/screen2',
  admin:     '/screen4',
}

export async function POST(req: NextRequest) {
  try {
    const { name, credential } = await req.json() as {
      name:       string   // user's display name (used to look up the record)
      credential: string   // plain PIN or password
    }

    if (!name?.trim() || !credential?.trim()) {
      return NextResponse.json({ error: 'Name and credential required' }, { status: 400 })
    }

    // Fetch user by name — case-insensitive
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, role, pin_hash, password_hash, active')
      .ilike('name', name.trim())
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    // Determine which hash to verify against
    const hashToCheck = user.role === 'admin' ? user.password_hash : user.pin_hash

    if (!hashToCheck) {
      return NextResponse.json({ error: 'Account not configured' }, { status: 403 })
    }

    const valid = await bcrypt.compare(credential, hashToCheck)

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set('mfs_session', JSON.stringify({
      userId: user.id,
      name:   user.name,
      role:   user.role,
    }), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,  // 30 days — persistent session
      path:     '/',
    })

    return NextResponse.json({
      success:  true,
      role:     user.role,
      name:     user.name,
      redirect: ROLE_ROUTES[user.role] ?? '/screen4',
    })

  } catch (err) {
    console.error('[/api/auth/login]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
