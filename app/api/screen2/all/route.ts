export const dynamic = 'force-dynamic'

/**
 * GET /api/screen2/all
 *
 * Returns ALL complaints (open + resolved), newest first.
 * Each complaint includes its full notes thread.
 * Used by the AllComplaintsTab on /complaints.
 *
 * Does NOT filter by user — all complaints visible to all authenticated users.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const headers = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // Fetch complaints + notes in parallel
    const [complaintsRes, notesRes] = await Promise.all([
      fetch(
        `${SUPA_URL}/rest/v1/complaints?` + new URLSearchParams({
          select: 'id,created_at,category,description,status,resolution_note,resolved_at,' +
                  'customers(name),' +
                  'logged_by:users!complaints_user_id_fkey(id,name),' +
                  'resolver:users!complaints_resolved_by_fkey(name)',
          order: 'created_at.desc',
        }),
        { headers }
      ),
      fetch(
        `${SUPA_URL}/rest/v1/complaint_notes?` + new URLSearchParams({
          select: 'id,complaint_id,body,created_at,author:users!complaint_notes_user_id_fkey(name)',
          order:  'created_at.asc',
        }),
        { headers }
      ),
    ])

    if (!complaintsRes.ok) {
      const text = await complaintsRes.text()
      console.error('[screen2/all] complaints error:', complaintsRes.status, text.slice(0, 200))
      return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 })
    }
    if (!notesRes.ok) {
      const text = await notesRes.text()
      console.error('[screen2/all] notes error:', notesRes.status, text.slice(0, 200))
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
    }

    const complaints = await complaintsRes.json() as {
      id: string
      created_at: string
      category: string
      description: string
      status: 'open' | 'resolved'
      resolution_note: string | null
      resolved_at: string | null
      customers:   { name: string } | null
      logged_by:   { id: string; name: string } | null
      resolver:    { name: string } | null
    }[]

    const notes = await notesRes.json() as {
      id:           string
      complaint_id: string
      body:         string
      created_at:   string
      author:       { name: string } | null
    }[]

    // Group notes by complaint_id
    const notesByComplaint = new Map<string, typeof notes>()
    for (const n of notes) {
      if (!notesByComplaint.has(n.complaint_id)) notesByComplaint.set(n.complaint_id, [])
      notesByComplaint.get(n.complaint_id)!.push(n)
    }

    const result = complaints.map(c => ({
      id:             c.id,
      createdAt:      c.created_at,
      category:       c.category.replace(/_/g, ' '),
      description:    c.description,
      status:         c.status,
      resolutionNote: c.resolution_note,
      resolvedAt:     c.resolved_at,
      customer:       c.customers?.name ?? 'Unknown',
      loggedBy:       c.logged_by?.name ?? 'Unknown',
      resolvedBy:     c.resolver?.name  ?? null,
      notes:          (notesByComplaint.get(c.id) ?? []).map(n => ({
        id:        n.id,
        body:      n.body,
        author:    n.author?.name ?? 'Unknown',
        createdAt: n.created_at,
      })),
    }))

    return NextResponse.json(result)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screen2/all] error:', msg)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
