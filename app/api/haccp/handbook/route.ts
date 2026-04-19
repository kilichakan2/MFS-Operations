/**
 * app/api/haccp/handbook/route.ts
 *
 * GET /api/haccp/handbook?section=cold_storage
 * Returns SOP content from haccp_sop_content for a given section key.
 * Single source of truth — content lives in DB, not hardcoded.
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

    const section = req.nextUrl.searchParams.get('section')
    if (!section) {
      return NextResponse.json({ error: 'Missing section parameter' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('haccp_sop_content')
      .select('sop_ref, title, content_md, version, source_doc')
      .eq('section_key', section)
      .eq('active', true)
      .order('sop_ref')

    if (error) {
      console.error('[GET /api/haccp/handbook]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ section, entries: data ?? [] })

  } catch (err) {
    console.error('[GET /api/haccp/handbook] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
