/**
 * app/api/auth/login/route.ts
 * Handles PIN and password authentication.
 * Verifies bcrypt hash against Supabase users table.
 * Sets session cookie on the NextResponse directly (Next.js 15 compatible).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import bcrypt                        from 'bcryptjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROLE_ROUTES: Record<string, string> = {
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/screen2',
  admin:     '/screen4',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    if (!body || !body.name?.trim() || !body.credential?.trim()) {
      return NextResponse.json(
        { error: 'Name and credential required' },
        { status: 400 }
      )
    }

    const { name, credential } = body as { name: string; credential: string }

    // Fetch user — case-insensitive name match
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('id, name, role, pin_hash, password_hash, active')
      .ilike('name', name.trim())
      .single()

    if (dbError) {
      // PGRST116 = 0 rows returned from .single() — normal "not found" case
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }
      console.error('[login] Supabase error:', dbError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const hashToCheck = user.role === 'admin' ? user.password_hash : user.pin_hash

    if (!hashToCheck) {
      console.error(`[login] User ${user.name} has no hash for role ${user.role}`)
      return NextResponse.json({ error: 'Account not configured — contact admin' }, { status: 403 })
    }

    let valid = false
    try {
      valid = await bcrypt.compare(credential, hashToCheck)
    } catch (bcryptErr) {
      console.error('[login] bcrypt.compare failed:', bcryptErr)
      return NextResponse.json({ error: 'Authentication error' }, { status: 500 })
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Fire-and-forget last_login_at update (non-blocking)
    supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(({ error: e }) => {
        if (e) console.error('[login] last_login_at update failed:', e.message)
      })

    // ── Set cookie directly on the response object ─────────────────────────
    // Using response.cookies.set() is the correct pattern for Next.js 15
    // Route Handlers. The next/headers cookies() mutation approach can fail
    // to attach to the response when the response is created as a separate object.
    const redirect = ROLE_ROUTES[user.role] ?? '/screen4'

    const response = NextResponse.json({
      success:  true,
      role:     user.role,
      name:     user.name,
      redirect,
    })

    response.cookies.set('mfs_session', JSON.stringify({
      userId: user.id,
      name:   user.name,
      role:   user.role,
    }), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,   // 30 days
      path:     '/',
    })

    return response

  } catch (err) {
    console.error('[login] Unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
