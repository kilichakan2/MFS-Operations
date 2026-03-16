/**
 * app/api/auth/team/route.ts
 * Returns active PIN users (warehouse, office, sales) for the POS login grid.
 * Returns only id, name, role — no hashes or sensitive data.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .in('role', ['warehouse', 'office', 'sales'])
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('[GET /api/auth/team]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
