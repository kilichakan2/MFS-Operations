/**
 * app/api/admin/customers/route.ts
 * GET — list all customers
 */

import { NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, postcode, lat, lng, active, created_at')
    .order('name', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/customers]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
