/**
 * app/api/auth/haccp-team/route.ts
 *
 * Returns active butcher + warehouse users for the HACCP login door.
 * Returns only id, name, role — no credentials or sensitive data.
 * Public endpoint — tablet is always on the door screen.
 */

import { NextResponse }    from 'next/server'
import { supabaseService } from '@/lib/supabase'

const supabase = supabaseService

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role')
      .in('role', ['butcher', 'warehouse'])
      .eq('active', true)
      .order('role', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.error('[GET /api/auth/haccp-team]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])

  } catch (err) {
    console.error('[auth/haccp-team GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
