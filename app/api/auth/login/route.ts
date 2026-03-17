/**
 * app/api/auth/login/route.ts
 *
 * PIN and password authentication.
 * Uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS.
 * Sets session cookie directly on the NextResponse (Next.js 15 pattern).
 * All credentials are explicitly cast to String() before bcrypt to prevent
 * "Illegal arguments: number, string" TypeError if type coercion occurs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import bcrypt                        from 'bcryptjs'

// Service role key — bypasses RLS. Never expose to the client.
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
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { name?: unknown; credential?: unknown } | null = null
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Explicitly cast both to string — guards against JSON number types
    // (bcrypt.compare throws "Illegal arguments: number, string" if not a string)
    const name       = String(body?.name       ?? '').trim()
    const credential = String(body?.credential ?? '').trim()

    if (!name || !credential) {
      return NextResponse.json(
        { error: 'Name and credential are required' },
        { status: 400 }
      )
    }

    // ── Fetch user by name (service role — RLS bypassed) ─────────────────────
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('id, name, role, pin_hash, password_hash, active')
      .ilike('name', name)
      .single()

    if (dbError) {
      // PGRST116 = no rows returned by .single() — treat as wrong credentials
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }
      console.error('[login] DB error:', dbError.code, dbError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    // ── Select correct hash ───────────────────────────────────────────────────
    const hashToCheck: string | null =
      user.role === 'admin' ? user.password_hash : user.pin_hash

    if (!hashToCheck) {
      console.error(`[login] ${user.name} (${user.role}) has no hash set`)
      return NextResponse.json(
        { error: 'Account not configured — ask an admin to reset your credentials' },
        { status: 403 }
      )
    }

    // ── bcrypt compare — both args explicitly string ──────────────────────────
    let valid = false
    try {
      valid = await bcrypt.compare(String(credential), String(hashToCheck))
    } catch (bcryptErr) {
      console.error('[login] bcrypt.compare threw:', bcryptErr)
      return NextResponse.json({ error: 'Authentication error' }, { status: 500 })
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // ── Update last_login_at (non-blocking, fire and forget) ──────────────────
    supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(({ error: e }) => {
        if (e) console.error('[login] last_login_at update failed:', e.message)
      })

    // ── Build response and set cookie ─────────────────────────────────────────
    // response.cookies.set() is the correct Next.js 15 Route Handler pattern.
    // The deprecated cookies() from next/headers does NOT attach to the response object.
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

    // mfs_role is NOT httpOnly — readable by client-side JS for nav rendering only.
    // Role string is not sensitive; middleware enforces actual access server-side.
    response.cookies.set('mfs_role', user.role, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })

    return response

  } catch (err) {
    // Top-level catch — nothing should reach here, but if it does we
    // still return a JSON response rather than dropping the connection.
    console.error('[login] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
