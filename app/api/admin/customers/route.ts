/**
 * app/api/admin/customers/route.ts
 * GET — list all customers
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, active, created_at')
    .order('name', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/customers]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
