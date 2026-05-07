/**
 * app/api/haccp/documents/route.ts
 * Returns the full document control register from haccp_documents.
 * Single source of truth — supersedes the paper register (MFS_Document_Control_Register_V1_0.docx).
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
      .from('haccp_documents')
      .select('doc_ref, title, version, category, register_type, description, purpose, linked_docs, status, updated_at, review_due, owner')
      .order('category')
      .order('doc_ref')

    if (error) {
      console.error('[GET /api/haccp/documents]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[GET /api/haccp/documents] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
