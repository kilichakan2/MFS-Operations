export const dynamic = 'force-dynamic'

/**
 * PATCH /api/cash/cheques/[id]
 *   { action: 'confirm' }                     → office + admin, confirms receipt
 *   { action: 'edit', ...fields }              → admin only, edits fields
 *
 * DELETE /api/cash/cheques/[id]               → admin only
 */

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

    const { id } = await params
    const body   = await req.json().catch(() => null)
    if (!body)   return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    if (body.action === 'confirm') {
      // Office + admin can confirm
      if (!['office', 'admin'].includes(role ?? '')) {
        return NextResponse.json({ error: 'Office or admin only' }, { status: 403 })
      }
      const { data, error } = await supabase
        .from('cheque_records')
        .update({ confirmed_by: userId, confirmed_at: new Date().toISOString() })
        .eq('id', id)
        .is('confirmed_by', null) // idempotency — only confirm once
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data)  return NextResponse.json({ error: 'Already confirmed or not found' }, { status: 404 })
      return NextResponse.json({ ok: true, confirmed_at: (data as Record<string,unknown>).confirmed_at })

    } else if (body.action === 'edit') {
      // Admin only
      if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

      const updates: Record<string, unknown> = {}
      if (body.date          != null) updates.date          = body.date
      if (body.customer_id   != null) updates.customer_id   = body.customer_id
      if (body.amount        != null) updates.amount        = Number(body.amount)
      if (body.driver_id     != null) updates.driver_id     = body.driver_id
      if (body.cheque_number != null) updates.cheque_number = body.cheque_number || null
      if (body.notes         != null) updates.notes         = body.notes || null

      const { data, error } = await supabase
        .from('cheque_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, record: data })

    } else {
      return NextResponse.json({ error: 'action must be confirm or edit' }, { status: 400 })
    }
  } catch (err) {
    console.error('[cash/cheques/[id] PATCH] error:', err)
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
    const { error } = await supabase.from('cheque_records').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
