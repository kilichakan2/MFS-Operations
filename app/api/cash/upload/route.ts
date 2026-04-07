export const dynamic = 'force-dynamic'

/**
 * POST /api/cash/upload
 * Uploads a receipt or invoice to Supabase Storage (cash-attachments bucket).
 * Returns { path, name } for storage in cash_entries.
 * Signed URLs generated server-side on entry fetch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

const ALLOWED = ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
const MAX_MB  = 10

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: `File type not allowed: ${file.type}` }, { status: 400 })
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 400 })
    }

    const ext    = file.name.split('.').pop() ?? 'bin'
    const path   = `${userId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from('cash-attachments')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error('[cash/upload] storage error:', uploadErr)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    return NextResponse.json({ path, name: file.name }, { status: 201 })

  } catch (err) {
    console.error('[cash/upload] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
