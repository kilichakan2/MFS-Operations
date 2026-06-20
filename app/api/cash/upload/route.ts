export const dynamic = 'force-dynamic'

/**
 * POST /api/cash/upload
 * Uploads a receipt or invoice to Supabase Storage (cash-attachments bucket).
 * Returns { path, name } for storage in cash_entries.
 * Signed URLs generated server-side on entry fetch.
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401 gate + formData parse + the no-file 400 (file extraction is
 * presentation) stay here; the mime/size gates, the path build and the
 * storage upload move to the Cash service/adapter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashService }               from '@/lib/wiring/cash'

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const v = cashService.validateAndBuildUploadPath({
      userId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      now: new Date(),
    })
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

    const bytes = new Uint8Array(await file.arrayBuffer())
    await cashService.uploadAttachment(v.path, bytes, file.type)

    return NextResponse.json({ path: v.path, name: v.name }, { status: 201 })

  } catch (err) {
    console.error('[cash/upload] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
