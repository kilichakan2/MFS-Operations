export const dynamic = 'force-dynamic'

/**
 * PATCH  /api/cash/entry/[id] → admin only. Edits an entry's mutable fields.
 * DELETE /api/cash/entry/[id] → admin only. Removes the attachment then the row.
 *
 * F-16 PR2: re-pointed off raw Supabase onto cashService. Header parsing +
 * the 401/403 gates + invalid-JSON gate stay here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cashService }               from '@/lib/wiring/cash'
import { toEntryEditWireDto }        from '@/lib/api/cash/dto'
import type { UpdateEntryInput }     from '@/lib/domain'

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

    const patch: {
      -readonly [K in keyof UpdateEntryInput]: UpdateEntryInput[K]
    } = { editedBy: userId }
    if (body.amount      != null) patch.amount      = Number(body.amount)
    if (body.description != null) patch.description = String(body.description).trim()
    if (body.category    != null) patch.category    = body.category
    if (body.reference   != null) patch.reference   = body.reference
    if (body.attachment_path != null) patch.attachmentPath = body.attachment_path
    if (body.attachment_name != null) patch.attachmentName = body.attachment_name

    const e = await cashService.updateEntry(id, patch)
    // Missing id → null (adapter .maybeSingle). Today's .single set an error
    // → accidental 500 on an unreachable path; PR2 returns an explicit 404
    // (Gate-2 ruling D2, plan §15.6).
    if (!e) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    return NextResponse.json({ entry: toEntryEditWireDto(e) })
  } catch (err) {
    console.error('[cash/entry/[id] PATCH] error:', err)
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
    await cashService.deleteEntry(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cash/entry/[id] DELETE] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
