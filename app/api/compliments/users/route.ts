export const dynamic = 'force-dynamic'

/**
 * GET /api/compliments/users
 * Returns all active users for the compliments recipient dropdown.
 * Accessible to all roles (shared path in middleware).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('[compliments/users GET]', error.message)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  return NextResponse.json({ users: data ?? [] })
}
