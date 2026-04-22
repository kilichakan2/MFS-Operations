/**
 * app/api/haccp/customers/route.ts
 * GET — active customer list for HACCP forms
 * Returns id + name only
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
      .from('customers')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('[GET /api/haccp/customers]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ customers: data ?? [] })

  } catch (err) {
    console.error('[GET /api/haccp/customers] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
