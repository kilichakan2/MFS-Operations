/**
 * app/api/admin/users/[id]/route.ts
 * PATCH  — toggle active / reset credential
 * DELETE — permanently remove a user
 *
 * F-RLS-04b: re-pointed onto usersServiceForCaller(caller.userId) — reaches the
 * DB as the Postgres `authenticated` role so the users_update / users_delete
 * RLS policies (admin-only) are EVALUATED. Auth is now via requireRole(req,
 * ['admin']) (replacing the hand-rolled x-mfs-user-role check); its thrown
 * 401/403 are mapped here so the manual try/catch never turns them into a 500.
 *
 * Rollback parachute: swap `await usersServiceForCaller(caller.userId!)` back
 * to the `usersService` service-role singleton (still exported from wiring).
 *
 * NOTE (R-MF-1, latent bug preserved deliberately): today this route uses
 * .single() on the UPDATE, which errors on a zero-row match and therefore
 * returns 500 for a non-existent id. The service returns null instead. To
 * keep behaviour byte-identical, null is mapped to the SAME 500 here. The
 * "should be a 404" fix is deferred — see docs/plans/BACKLOG.md (F-TD-20).
 * Under RLS this still only bites non-admins (already 403'd at the route);
 * an admin can update any row.
 */

import { NextRequest, NextResponse }         from 'next/server'
import { usersServiceForCaller }             from '@/lib/wiring/users'
import { requireRole }                       from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import type { Role, UpdateUserInput, UserSummary } from '@/lib/domain'

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = requireRole(req, ['admin'])
    const usersService = await usersServiceForCaller(caller.userId!)

    const { id }  = await params
    const body    = await req.json() as {
      active?:          boolean
      credential?:      string
      role?:            string
      email?:           string | null
      secondary_roles?: string[]
    }

    const patch: { -readonly [K in keyof UpdateUserInput]: UpdateUserInput[K] } = {}

    if (body.active !== undefined) {
      patch.active = body.active
    }

    if (body.email !== undefined) {
      patch.email = body.email?.trim() || null
    }

    if (body.secondary_roles !== undefined) {
      patch.secondaryRoles = body.secondary_roles
        .filter((r: string) => r !== 'admin') as Role[]
    }

    if (body.credential && body.role) {
      // The service hashes the plaintext; the adapter writes the role-matching
      // column and clears the other (no stale credential remains).
      patch.credential = { plaintext: body.credential, role: body.role as Role }
    }

    const updated = await usersService.updateUser(id, patch)

    // R-MF-1: null (no matching id) maps to the SAME 500 today's .single()
    // produced. Do NOT change this to 404 — that is a behaviour change.
    if (updated === null) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 })
    }

    return NextResponse.json(toAppUser(updated))
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = requireRole(req, ['admin'])
    const usersService = await usersServiceForCaller(caller.userId!)

    const { id } = await params

    await usersService.deleteUser(id)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
