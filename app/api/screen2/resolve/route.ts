/**
 * POST /api/screen2/resolve
 * Marks an open complaint as resolved.
 * Uses raw fetch() to Supabase REST — avoids cold-start client issues.
 *
 * Body: { complaint_id: string, resolution_note: string }
 *
 * The DB enforces complaints_resolution_check: when status='resolved',
 * resolution_note, resolved_by, and resolved_at must ALL be non-null.
 * This route sets all three atomically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'

// audit_log is a cross-cutting write with no owned port yet (F-TD-31) — it
// stays as a raw REST fetch. Only the complaint DATA surface moved to the
// service.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
    const complaintsService = await complaintsServiceForCaller(userId)

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* fall through */ }
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const complaint_id    = body.complaint_id    as string | undefined
    const resolution_note = body.resolution_note as string | undefined

    const valid = complaintsService.validateResolve({
      complaintId:    complaint_id ?? '',
      resolutionNote: resolution_note ?? '',
      resolvedBy:     userId,
    })
    if (!valid.ok) {
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    // UUID format sanity check (presentation — stays in the route)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(complaint_id!)) return NextResponse.json({ error: 'Invalid complaint_id' }, { status: 400 })

    console.log('[screen2/resolve] resolving complaint:', complaint_id, 'by:', userName)

    const resolved = await complaintsService.resolveOpen({
      complaintId:    complaint_id!,
      resolutionNote: resolution_note!.trim(),
      resolvedBy:     userId,
    })
    if (!resolved) {
      // No open row matched — either wrong ID or already resolved
      return NextResponse.json(
        { error: 'Complaint not found or already resolved' },
        { status: 404 }
      )
    }

    console.log('[screen2/resolve] resolved:', resolved.id)

    // Send email — awaited so errors surface in this request context
    try {
      const comp = await complaintsService.findEmailContext(complaint_id!)
      const { sendComplaintEmail } = await import('@/lib/complaint-email')
      await sendComplaintEmail({
        type:           'resolved',
        resolvedBy:     userName,
        resolutionNote: resolution_note!.trim(),
        complaint: {
          id:          resolved.id,
          customer:    comp?.customerName ?? 'Unknown',
          category:    (comp?.category ?? '').replace(/_/g, ' '),
          description: comp?.description ?? '',
          status:      'resolved',
        },
      })
    } catch (e) {
      console.error('[screen2/resolve] email error:', e instanceof Error ? e.stack : String(e))
    }

    // Audit log (fire-and-forget) — raw REST, F-TD-31 (no owned port yet)
    fetch(`${SUPA_URL}/rest/v1/audit_log`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        user_id:   userId,
        screen:    'screen2',
        action:    'resolved',
        record_id: resolved.id,
        summary:   `Complaint resolved by ${userName}: "${resolution_note!.trim().slice(0, 80)}"`,
      }),
    }).catch((e) => console.error('[screen2/resolve] audit error:', e))

    return NextResponse.json({ id: resolved.id }, { status: 200 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen2/resolve] Unhandled error:', msg)
    if (stk) console.error('[screen2/resolve] Stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
