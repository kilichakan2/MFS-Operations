/**
 * app/api/admin/users/route.ts
 * GET  — list all users
 * POST — create a new user (the service bcrypt-hashes the PIN or password)
 *
 * F-13 PR2: re-pointed through usersService (service-role posture, RLS still
 * bypassed — unchanged from today). The service hashes the credential and the
 * adapter writes the role-appropriate column; this route keeps the admin-role
 * guard, the field validation, and the secondary_roles 'admin' filter.
 *
 * Both GET and POST return the exact 8-field snake_case AppUser shape the admin
 * page (app/admin/page.tsx) reads — the camelCase UserSummary the service
 * returns is projected back before responding.
 */

import { NextRequest, NextResponse } from 'next/server'
import { usersService }              from '@/lib/wiring/users'
import { ConflictError }             from '@/lib/errors'
import type { Role, UserSummary }    from '@/lib/domain'

/** Project the camelCase domain user back to today's snake_case AppUser shape. */
function toAppUser(u: UserSummary) {
  return {
    id:              u.id,
    name:            u.name,
    role:            u.role,
    secondary_roles: u.secondaryRoles,
    active:          u.active,
    last_login_at:   u.lastLoginAt,
    created_at:      u.createdAt,
    email:           u.email,
  }
}

export async function GET(_req: NextRequest) {
  try {
    const users = await usersService.listAllUsers()
    return NextResponse.json(users.map(toAppUser))
  } catch (err) {
    console.error('[GET /api/admin/users]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const callerRole = req.headers.get('x-mfs-user-role')
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)

    const name            = String(body?.name       ?? '').trim()
    const role            = String(body?.role       ?? '').trim()
    const credential      = String(body?.credential ?? '').trim()
    const email           = body?.email ? String(body.email).trim() || null : null
    const secondaryRoles  = (Array.isArray(body?.secondary_roles) ? body.secondary_roles : [])
      .filter((r: unknown) => typeof r === 'string' && r !== 'admin') as Role[]

    if (!name || !role || !credential) {
      return NextResponse.json(
        { error: 'name, role, and credential are required' },
        { status: 400 }
      )
    }

    // Server-side PIN validation — belt and braces even if frontend validates
    if (role !== 'admin' && !/^\d{4}$/.test(credential)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 numeric digits (e.g. 1234)' },
        { status: 400 }
      )
    }

    if (role === 'admin' && credential.length < 6) {
      return NextResponse.json(
        { error: 'Admin password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // The service hashes the credential (via the PasswordHasher port) and the
    // adapter writes the role-appropriate column — no bcrypt, no column choice
    // in this route any more.
    const created = await usersService.createUser({
      name,
      role: role as Role,
      credential,
      secondaryRoles,
      email,
    })

    return NextResponse.json(toAppUser(created), { status: 201 })
  } catch (err) {
    // A duplicate name surfaces as ConflictError (the adapter mapped the
    // Postgres unique-violation). Return a friendly 409 — never the raw
    // Postgres code. This branch MUST precede the generic 500 handler.
    if (
      err instanceof ConflictError ||
      (err as { httpStatus?: number })?.httpStatus === 409
    ) {
      return NextResponse.json(
        { error: 'A user with that name already exists.' },
        { status: 409 }
      )
    }
    console.error('[POST /api/admin/users] Unhandled:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
