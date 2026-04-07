/**
 * app/api/admin/products/route.ts
 * GET — list all products
 */

import { NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, code, box_size, active, created_at')
    .order('name', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/products]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
