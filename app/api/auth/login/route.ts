/**
 * app/api/auth/login/route.ts
 *
 * PIN and password authentication.
 * Reads the credential and stamps last-login through the Users service
 * (@/lib/wiring/users), which composes the service-role adapter (RLS
 * bypassed) — this route never imports a vendor SDK.
 * Sets session cookie directly on the NextResponse (Next.js 15 pattern).
 * Credential verification goes through the PasswordHasher port
 * (@/lib/wiring/password); the adapter owns String() casting and the TOTAL
 * compare guard, so this route never touches bcryptjs directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { usersService }              from '@/lib/wiring/users'
import { sessionTokens }             from '@/lib/wiring/session'
import { passwordHasher }            from '@/lib/wiring/password'


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
  warehouse: '/dispatch',
  office:    '/dispatch',
  sales:     '/complaints',
  admin:     '/dashboard/admin',
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

    // ── Fetch the credential by name through the Users service ───────────────
    // Service role — RLS bypassed inside the adapter (login MUST read any
    // user's record). The service returns null on a miss and throws on a real
    // DB failure, so the old two-branch error shape collapses cleanly:
    //   - null   → unknown user → 401 (was the PGRST116 branch)
    //   - throw  → DB failure   → 500 { error: 'Database error' } (was the
    //              dbError 500 branch — kept here via an inner try/catch so the
    //              body stays 'Database error', not the outer catch's
    //              'Server error').
    let user
    try {
      user = await usersService.findCredentialByName(name)
    } catch (e) {
      console.error('[login] DB error:', e)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!user) {
      // A miss is now `null` (the live unknown-user path). Count the failed
      // attempt — the old PGRST116 branch did this; the rate limiter relies on
      // it to lock out unknown-name guessing.
      recordFailure(name)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    // ── Select correct hash ───────────────────────────────────────────────────
    // camelCase domain fields — the adapter already mapped pin_hash/password_hash.
    const hashToCheck: string | null =
      user.role === 'admin' ? user.passwordHash : user.pinHash

    if (!hashToCheck) {
      console.error(`[login] ${user.name} (${user.role}) has no hash set`)
      return NextResponse.json(
        { error: 'Account not configured — ask an admin to reset your credentials' },
        { status: 403 }
      )
    }

    // ── Credential check via the PasswordHasher port ──────────────────────────
    // compare is TOTAL — a corrupt stored hash returns false (logged inside the
    // adapter) rather than throwing, so a broken hash reads as a wrong
    // credential (401) instead of a 500. String() casting now lives in the
    // adapter.
    const valid = await passwordHasher.compare(credential, hashToCheck)

    if (!valid) {
      recordFailure(name)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // ── Clear rate limit on success ───────────────────────────────────────────
    recordSuccess(name)

    // ── Update last_login_at (non-blocking, fire and forget) ──────────────────
    // recordLogin takes a Date (the adapter calls .toISOString() internally).
    // Throws on DB failure; catch and log so a stamp failure never blocks or
    // fails the login — identical to today's non-awaited .then() behaviour.
    void usersService.recordLogin(user.id, new Date()).catch((e) => {
      console.error('[login] last_login_at update failed:', e)
    })

    // ── Multi-role: prompt picker if no chosenRole provided ───────────────────
    // camelCase domain field (already typed as readonly Role[] — no cast needed).
    const secondaryRoles = user.secondaryRoles ?? []
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
    // activeRole may be an arbitrary client-supplied string (chosenRole), so
    // compare against the role list as strings — identical runtime check to the
    // pre-PR3 code, where allRoles was string[].
    const activeRole = chosenRole ?? user.role
    if (!(allRoles as readonly string[]).includes(activeRole)) {
      return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    }

    // ── Build response and set cookie ─────────────────────────────────────────
    // response.cookies.set() is the correct Next.js 15 Route Handler pattern.
    // The deprecated cookies() from next/headers does NOT attach to the response object.
    const redirect = ROLE_ROUTES[activeRole] ?? '/dashboard/admin'
    const sessionSecondaryRoles: string[] = []  // always empty — single-role session

    const response = NextResponse.json({
      success:        true,
      role:           activeRole,
      secondaryRoles: sessionSecondaryRoles,
      name:           user.name,
      redirect,
    })

    response.cookies.set('mfs_session', await sessionTokens.issue({
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
