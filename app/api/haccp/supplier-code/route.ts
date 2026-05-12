/**
 * app/api/haccp/supplier-code/route.ts
 *
 * GET ?name=Euro Quality Lambs
 * Returns supplier label_code for 58mm Sunmi label printing.
 * Falls back to first 4 chars of name if no match.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const role = req.cookies.get('mfs_role')?.value
  if (!role || !['warehouse', 'butcher', 'admin', 'driver'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data } = await supabaseService
    .from('haccp_suppliers')
    .select('label_code')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  const label_code = data?.label_code ?? name.slice(0, 4).toUpperCase()
  return NextResponse.json({ label_code })
}
