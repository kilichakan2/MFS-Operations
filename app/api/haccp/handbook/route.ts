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
    const doc     = req.nextUrl.searchParams.get('doc')

    if (!section && !doc) {
      return NextResponse.json({ error: 'Missing section or doc parameter' }, { status: 400 })
    }

    let query = supabase
      .from('haccp_sop_content')
      .select('sop_ref, title, content_md, version, source_doc')
      .eq('active', true)
      .order('sop_ref')

    if (section) {
      query = query.eq('section_key', section)
    } else if (doc) {
      // Match any section that lists this doc as a source (e.g. 'HB-001/CA-001' contains 'HB-001')
      query = query.ilike('source_doc', `%${doc}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[GET /api/haccp/handbook]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ section: section ?? null, doc: doc ?? null, entries: data ?? [] })

  } catch (err) {
    console.error('[GET /api/haccp/handbook] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
