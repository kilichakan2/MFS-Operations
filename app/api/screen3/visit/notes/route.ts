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
 *
 * F-18 PR2: re-pointed onto visitsService + toVisitNoteWireDto/toNoteUpdateWireDto
 * — no direct @supabase / /rest/v1 access. Wire output byte-identical
 * (snake_case). W1: PATCH on a non-existent note now returns 404 (was a latent
 * 500 from `.single()` throwing) — the adapter uses `.maybeSingle()` → null →
 * 404.
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'
import { toVisitNoteWireDto, toNoteUpdateWireDto } from '@/lib/api/visits/dto'
import { ServiceError } from '@/lib/errors'

// ─── GET — load notes for a visit ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const visitId = req.nextUrl.searchParams.get('visit_id')
  if (!visitId) return NextResponse.json({ error: 'visit_id required' }, { status: 400 })

  const isManager = role === 'admin' || role === 'office'

  // For sales: verify this visit belongs to them before returning notes
  if (!isManager && !(await visitsService.verifyVisitOwnership(visitId, userId))) {
    return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })
  }

  try {
    const notes = await visitsService.listNotes(visitId)
    return NextResponse.json({ notes: notes.map(toVisitNoteWireDto) })
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[visit/notes GET] error:', err.message)
      return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
    }
    throw err
  }
}

// ─── POST — add a note ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { visit_id?: string; body?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }

  const valid = visitsService.validateNote({
    visitId: body?.visit_id,
    body: body?.body,
  })
  if (!valid.ok) {
    return NextResponse.json({ error: valid.message }, { status: valid.status })
  }

  const visitId = body!.visit_id as string
  const isManager = role === 'admin' || role === 'office'

  // Sales: verify visit ownership before allowing note
  if (!isManager && !(await visitsService.verifyVisitOwnership(visitId, userId))) {
    return NextResponse.json({ error: 'Visit not found or not authorised' }, { status: 404 })
  }

  try {
    const note = await visitsService.createNote({
      visitId,
      body: body!.body as string,
      userId,
    })
    return NextResponse.json({ note: toVisitNoteWireDto(note) }, { status: 201 })
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[visit/notes POST] error:', err.message)
      return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
    }
    throw err
  }
}

// ─── PATCH — edit a note ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? 'sales'
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: { id?: string; body?: string } | null = null
  try { body = await req.json() } catch { /* fall through */ }

  const valid = visitsService.validateUpdateNote({
    id: body?.id,
    body: body?.body,
  })
  if (!valid.ok) {
    return NextResponse.json({ error: valid.message }, { status: valid.status })
  }

  const isManager = role === 'admin' || role === 'office'

  let note
  try {
    note = await visitsService.updateNote({
      id: body!.id as string,
      body: body!.body as string,
      userId,
      isManager,
    })
  } catch (err) {
    // R3: preserve the exact DB-failure 500 body the route emitted today.
    if (err instanceof ServiceError) {
      console.error('[visit/notes PATCH] error:', err.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    throw err
  }

  // W1: no-match now returns 404 (was a latent 500 — `.single()` threw on 0 rows).
  if (note === null) {
    return NextResponse.json({ error: 'Note not found or not authorised' }, { status: 404 })
  }

  return NextResponse.json({ note: toNoteUpdateWireDto(note) })
}
