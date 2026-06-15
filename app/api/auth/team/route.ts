/**
 * app/api/auth/team/route.ts
 * Returns active PIN users (warehouse, office, sales, driver) for the POS login grid.
 * Returns only id, name, role, secondary_roles — no hashes or sensitive data.
 *
 * F-13 PR2: re-pointed through usersService. The service returns camelCase
 * UserSummary objects; the login grid (app/login/page.tsx) reads the DB's
 * snake_case keys, so each row is projected back to the exact
 * { id, name, role, secondary_roles } shape this route has always returned
 * (extra UserSummary fields are dropped; secondaryRoles → secondary_roles).
 */

import { NextResponse }  from 'next/server'
import { usersService }  from '@/lib/wiring/users'

export async function GET() {
  try {
    const team = await usersService.listTeam(
      ['warehouse', 'office', 'sales', 'driver'],
      { activeOnly: true, orderBy: ['name'] },
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
    console.error(`[auth/team GET] Unhandled error:`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
