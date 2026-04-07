export const dynamic = 'force-dynamic'

/**
 * GET  /api/screen3/visit/notes?visit_id=<uuid>
 *   Load all notes for a visit.
 *   Sales: own visits only (verified by joining visits.user_id).
 *   Admin/office: any visit.
 *
 * POST /api/screen3/visit/notes
 *   Body: { visit_id: string; body: string }
 *   Add a note. Sales: own visits only. Admin/office: any visit.
 *
 * PATCH /api/screen3/visit/notes
 *   Body: { id: string; body: string }
 *   Edit a note. Author only (note.user_id must match caller).
 *   Admin/office: any note.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ─── GET — load notes for a visit ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const visitId = req.nextUrl.searchParams.get('visit_id')
  if (!visitId) return NextResponse.json({ error: 'visit_id required' }, { status: 400 })

  const isManager = role === 'admin' || role === 'office'

  // For sales: verify this visit belongs to them before returning notes
  if (!isManager) {
    const { data: visit, error: vErr } = await supabase
      .from('visits')
      .select('id')
      .eq('id', visitId)
      .eq('user_id', userId)
      .maybeSingle()

    if (vErr || !visit) {
      return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })
    }
  }

  const { data: notes, error } = await supabase
    .from('visit_notes')
    .select(`
      id, visit_id, body, created_at, updated_at,
      author:users!visit_notes_user_id_fkey(id, name)
    `)
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[visit/notes GET] error:', error.message)
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }

  const shaped = (notes ?? []).map(n => ({
    id:           n.id,
    visit_id:     n.visit_id,
    body:         n.body,
    created_at:   n.created_at,
    updated_at:   n.updated_at,
    author_id:    (n.author as { id: string; name: string } | null)?.id   ?? null,
    author_name:  (n.author as { id: string; name: string } | null)?.name ?? 'Unknown',
  }))

  return NextResponse.json({ notes: shaped })
}

// ─── POST — add a note ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { visit_id?: string; body?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }
  if (!body?.visit_id) return NextResponse.json({ error: 'visit_id required' }, { status: 400 })
  if (!body?.body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const isManager = role === 'admin' || role === 'office'

  // Sales: verify visit ownership before allowing note
  if (!isManager) {
    const { data: visit, error: vErr } = await supabase
      .from('visits')
      .select('id')
      .eq('id', body.visit_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (vErr || !visit) {
      return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })
    }
  }

  const { data: note, error } = await supabase
    .from('visit_notes')
    .insert({
      visit_id:   body.visit_id,
      user_id:    userId,
      body:       body.body.trim(),
      created_at: new Date().toISOString(),
    })
    .select(`
      id, visit_id, body, created_at, updated_at,
      author:users!visit_notes_user_id_fkey(id, name)
    `)
    .single()

  if (error) {
    console.error('[visit/notes POST] error:', error.message)
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
  }

  return NextResponse.json({
    note: {
      id:          note.id,
      visit_id:    note.visit_id,
      body:        note.body,
      created_at:  note.created_at,
      updated_at:  note.updated_at,
      author_id:   (note.author as { id: string; name: string } | null)?.id   ?? null,
      author_name: (note.author as { id: string; name: string } | null)?.name ?? 'Unknown',
    },
  }, { status: 201 })
}

// ─── PATCH — edit a note ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { id?: string; body?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }
  if (!body?.id)          return NextResponse.json({ error: 'id required' },   { status: 400 })
  if (!body?.body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const isManager = role === 'admin' || role === 'office'

  // Build filter: admin/office can edit any note; sales can only edit their own
  const filter = supabase
    .from('visit_notes')
    .update({ body: body.body.trim(), updated_at: new Date().toISOString() })
    .eq('id', body.id)

  if (!isManager) filter.eq('user_id', userId)

  const { data, error } = await filter
    .select('id, body, updated_at')
    .single()

  if (error) {
    console.error('[visit/notes PATCH] error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Note not found or not authorised' }, { status: 404 })
  }

  return NextResponse.json({ note: data })
}
