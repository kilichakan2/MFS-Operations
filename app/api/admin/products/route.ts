/**
 * app/api/admin/products/route.ts
 * GET — list all products
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, active, created_at')
    .order('name', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/products]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
