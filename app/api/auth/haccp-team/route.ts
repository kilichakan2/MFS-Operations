/**
 * app/api/auth/haccp-team/route.ts
 *
 * Returns active butcher + warehouse users for the HACCP login door.
 * Returns only id, name, role, secondary_roles — no credentials.
 * Public endpoint — tablet is always on the door screen.
 *
 * F-13 PR2: re-pointed through usersService. The camelCase UserSummary rows
 * are projected back to the exact { id, name, role, secondary_roles }
 * snake_case shape app/haccp/page.tsx reads. Ordering is role-then-name
 * (orderBy keys are applied in sequence by the adapter).
 */

import { NextResponse } from 'next/server'
import { usersService } from '@/lib/wiring/users'

export async function GET() {
  try {
    const team = await usersService.listTeam(
      ['butcher', 'warehouse'],
      { activeOnly: true, orderBy: ['role', 'name'] },
    )

    return NextResponse.json(
      team.map((u) => ({
        id:              u.id,
        name:            u.name,
        role:            u.role,
        secondary_roles: u.secondaryRoles,
      })),
    )

  } catch (err) {
    console.error('[auth/haccp-team GET] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
