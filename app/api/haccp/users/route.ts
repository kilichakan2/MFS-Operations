/**
 * app/api/haccp/users/route.ts
 *
 * Returns all active users for HACCP selectors (reviewed by, approved by, etc.)
 * Ordered: admins first (Hakan, Ege), then by name.
 * Any logged-in HACCP role can access — needed to display selector labels.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sort: admins first, then by name — ensures Hakan & Ege appear at top
    const users = (data ?? []).sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (b.role === 'admin' && a.role !== 'admin') return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ users })
  } catch (err) {
    console.error('[GET /api/haccp/users]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
