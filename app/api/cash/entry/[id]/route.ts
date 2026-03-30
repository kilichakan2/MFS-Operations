export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id } = await params
    const body   = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const updates: Record<string, unknown> = { edited_by: userId, edited_at: new Date().toISOString() }
    if (body.amount      != null) updates.amount      = Number(body.amount)
    if (body.description != null) updates.description = String(body.description).trim()
    if (body.category    != null) updates.category    = body.category
    if (body.reference   != null) updates.reference   = body.reference
    if (body.attachment_path != null) updates.attachment_path = body.attachment_path
    if (body.attachment_name != null) updates.attachment_name = body.attachment_name

    const { data, error } = await supabase
      .from('cash_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entry: data })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id } = await params

    // Delete attachment from storage if present
    const { data: entry } = await supabase
      .from('cash_entries')
      .select('attachment_path')
      .eq('id', id)
      .single()

    if (entry?.attachment_path) {
      await supabase.storage.from('cash-attachments').remove([entry.attachment_path])
    }

    const { error } = await supabase.from('cash_entries').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
