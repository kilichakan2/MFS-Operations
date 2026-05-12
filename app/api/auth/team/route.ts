/**
 * app/api/auth/team/route.ts
 * Returns active PIN users (warehouse, office, sales, driver) for the POS login grid.
 * Returns only id, name, role — no hashes or sensitive data.
 */

import { NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, secondary_roles')
      .in('role', ['warehouse', 'office', 'sales', 'driver'])
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('[GET /api/auth/team]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])

  } catch (err) {
    console.error(`[auth/team GET] Unhandled error:`, err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
