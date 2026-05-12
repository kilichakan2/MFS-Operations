/**
 * app/api/routes/users/route.ts
 *
 * GET — Returns active driver and sales users for the route planner
 *       assignee dropdown.
 *
 * Why not /api/admin/users?
 *   /api/admin/* is restricted to admin role in middleware.
 *   The route planner (/routes) is accessible to all roles, so a
 *   warehouse or office user building a route would get a 307 redirect
 *   when their page tried to fetch /api/admin/users. This endpoint
 *   lives under /api/routes/* which is in SHARED_API_PATHS — all
 *   authenticated users can call it.
 *
 * Returns only: id, name, role (no hashes, no sensitive data).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, secondary_roles')
      .or('role.in.(driver,sales),secondary_roles.cs.{driver},secondary_roles.cs.{sales}')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('[/api/routes/users] Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = data ?? []
    console.log(`[/api/routes/users] ${users.length} assignable users`)

    return NextResponse.json({ users })

  } catch (err) {
    console.error('[/api/routes/users] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
