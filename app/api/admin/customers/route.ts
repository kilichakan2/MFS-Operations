/**
 * app/api/admin/customers/route.ts
 * GET — list all customers
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

    const { data, error } = await supabase
      .from('customers')
      .select('id, name, postcode, lat, lng, active, created_at')
      .order('name', { ascending: true })

    if (error) {
      console.error('[GET /api/admin/customers]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)

  } catch (err) {
    console.error(`[admin/customers GET] Unhandled error:`, err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
