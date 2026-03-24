/**
 * DELETE /api/screen3/visit?id=<uuid>
 *
 * Permanently deletes a visit record from Supabase.
 * Only the owning user can delete their own visits.
 * Auth: middleware injects x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only allow deletion of visits owned by this user
  const res = await fetch(
    `${SUPA_URL}/rest/v1/visits?id=eq.${id}&user_id=eq.${userId}`,
    {
      method: 'DELETE',
      headers: {
        'apikey':         SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Prefer':        'return=minimal',
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[screen3/visit DELETE] error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
