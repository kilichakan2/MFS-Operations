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
import bcrypt                        from 'bcryptjs'
import { supabaseService }           from '@/lib/supabase'

// Service role key — bypasses RLS. Never expose to the client.
const supabase = supabaseService


// ── In-memory rate limiter ────────────────────────────────────────────────────
// Limits login attempts per username. Per-instance only — on Vercel each
// serverless invocation may be a fresh instance so this is a best-effort
// defence against low-volume targeted attacks, not a distributed rate limit.
// For a fully distributed rate limit, use Vercel KV or Upstash Redis.

interface AttemptRecord { count: number; lockedUntil: number }
const loginAttempts = new Map<string, AttemptRecord>()

const MAX_ATTEMPTS    = 5          // attempts before lockout
const LOCKOUT_MS      = 15 * 60 * 1000   // 15 minutes

function checkRateLimit(name: string): { allowed: boolean; retryAfterSec?: number } {
  const now    = Date.now()
  const record = loginAttempts.get(name.toLowerCase())

  if (!record) return { allowed: true }

  if (record.lockedUntil > now) {
    const retryAfterSec = Math.ceil((record.lockedUntil - now) / 1000)
    return { allowed: false, retryAfterSec }
  }

  // Lock expired — reset
  if (record.lockedUntil > 0 && record.lockedUntil <= now) {
    loginAttempts.delete(name.toLowerCase())
    return { allowed: true }
  }

  return { allowed: true }
}

function recordFailure(name: string): void {
  const now    = Date.now()
  const key    = name.toLowerCase()
  const record = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 }

  record.count++
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS
    console.log(`[login] Rate limit: '${name}' locked for ${LOCKOUT_MS / 60000}m after ${record.count} failures`)
  }
  loginAttempts.set(key, record)
}

function recordSuccess(name: string): void {
  loginAttempts.delete(name.toLowerCase())
}

const ROLE_ROUTES: Record<string, string> = {
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/complaints',
  admin:     '/screen4',
  driver:    '/driver',
}

export async function POST(req: NextRequest) {
  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { name?: unknown; credential?: unknown; chosenRole?: unknown } | null = null
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Explicitly cast both to string — guards against JSON number types
    // (bcrypt.compare throws "Illegal arguments: number, string" if not a string)
    const name        = String(body?.name       ?? '').trim()
    const credential  = String(body?.credential ?? '').trim()
    const chosenRole  = body?.chosenRole ? String(body.chosenRole).trim() : null

    if (!name || !credential) {
      return NextResponse.json(
        { error: 'Name and credential are required' },
        { status: 400 }
      )
    }

    // ── Rate limit check ──────────────────────────────────────────────────────
    const rl = checkRateLimit(name)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil((rl.retryAfterSec ?? 900) / 60)} minutes.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec ?? 900) },
        }
      )
    }

    // ── Fetch user by name (service role — RLS bypassed) ─────────────────────
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('id, name, role, secondary_roles, pin_hash, password_hash, active')
      .ilike('name', name)
      .single()

    if (dbError) {
      // PGRST116 = no rows returned by .single() — treat as wrong credentials
      if (dbError.code === 'PGRST116') {
        recordFailure(name)
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
      recordFailure(name)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // ── Clear rate limit on success ───────────────────────────────────────────
    recordSuccess(name)

    // ── Update last_login_at (non-blocking, fire and forget) ──────────────────
    supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(({ error: e }) => {
        if (e) console.error('[login] last_login_at update failed:', e.message)
      })

    // ── Multi-role: prompt picker if no chosenRole provided ───────────────────
    const secondaryRoles: string[] = (user.secondary_roles as string[] | null) ?? []
    const allRoles = [user.role, ...secondaryRoles]

    if (secondaryRoles.length > 0 && !chosenRole) {
      // PIN verified — return role options, no session set yet
      return NextResponse.json({
        requiresRolePicker: true,
        roles: allRoles,
        name:  user.name,
      })
    }

    // ── Validate chosenRole if provided ───────────────────────────────────────
    const activeRole = chosenRole ?? user.role
    if (!allRoles.includes(activeRole)) {
      return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    }

    // ── Build response and set cookie ─────────────────────────────────────────
    // response.cookies.set() is the correct Next.js 15 Route Handler pattern.
    // The deprecated cookies() from next/headers does NOT attach to the response object.
    const redirect = ROLE_ROUTES[activeRole] ?? '/screen4'
    const sessionSecondaryRoles: string[] = []  // always empty — single-role session

    const response = NextResponse.json({
      success:        true,
      role:           activeRole,
      secondaryRoles: sessionSecondaryRoles,
      name:           user.name,
      redirect,
    })

    response.cookies.set('mfs_session', JSON.stringify({
      userId:         user.id,
      name:           user.name,
      role:           activeRole,
      secondaryRoles: sessionSecondaryRoles,
    }), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })

    response.cookies.set('mfs_role', activeRole, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })

    // mfs_secondary_roles — expired after role picker (single-role session)
    // maxAge: 0 explicitly deletes the cookie in all browsers/PWA contexts
    response.cookies.set('mfs_secondary_roles', '', {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   0,
      path:     '/',
    })

    // mfs_user_id is NOT httpOnly — readable by client-side JS for ownership checks
    // (e.g. pricing page: can this user edit their own agreement?).
    // Not sensitive — user ID is not a credential.
    response.cookies.set('mfs_user_id', user.id, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30,
      path:     '/',
    })

    // mfs_name is NOT httpOnly — first name for display only (HACCP welcome screen etc.)
    response.cookies.set('mfs_name', user.name, {
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
