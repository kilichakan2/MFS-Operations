/**
 * POST /api/screen3/sync
 * Inserts a queued visit.
 *
 * Sprint 1 Map View: prospect visits now trigger a fire-and-forget geocoding
 * call to postcodes.io, writing prospect_lat/prospect_lng back to the row.
 *
 * F-18 PR2: the visit DATA surface (insert/upsert + geocode write-back) moved to
 * visitsService. The postcodes.io geocode lookup stays here — it's a public HTTP
 * API (not a vendor SDK). The audit_log write + customers name lookup STAY raw
 * REST (F-TD-31 — no owned audit port yet; CreatedVisit does not carry the
 * customer name). Mirrors the screen2/sync (complaints) precedent exactly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { visitsService } from '@/lib/wiring/visits'
import type { VisitType, VisitOutcome } from '@/lib/domain'

// audit_log + the customers name lookup are cross-cutting reads/writes with no
// owned port yet (F-TD-31) — they stay as raw REST fetches. Only the visit DATA
// surface moved to the service.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function supaPost(table: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Prefer':         'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

async function supaGet(table: string, params: string) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey':         SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json() as { name?: string }[]
  return rows[0] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Unknown'
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    let body: Record<string, unknown> | null = null
    try { body = await req.json() } catch { /* fall through */ }
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    console.log('[screen3/sync] keys:', Object.keys(body).join(', '))

    const _upsert           =  body._upsert           === true
    const id                =  body.id                as string  | undefined
    const customer_id       = (body.customer_id       as string  | undefined) ?? null
    const prospect_name     = (body.prospect_name     as string  | undefined) ?? null
    const prospect_postcode = (body.prospect_postcode as string  | undefined) ?? null
    const visit_type        =  body.visit_type        as string  | undefined
    const outcome           =  body.outcome           as string  | undefined
    const notes             = (body.notes             as string  | undefined) ?? null
    const commitment_detail = (body.commitment_detail as string  | undefined) ?? null
    const commitment_made   = body.commitment_made === true || body.commitment_made === 'true'

    const input = {
      ...(id ? { id } : {}),
      upsert:           _upsert,
      userId,
      customerId:       customer_id,
      prospectName:     prospect_name,
      prospectPostcode: prospect_postcode,
      visitType:        (visit_type ?? '') as VisitType,
      outcome:          (outcome ?? '') as VisitOutcome,
      commitmentMade:   commitment_made,
      commitmentDetail: commitment_detail,
      notes,
    }

    const valid = visitsService.validateCreate(input)
    if (!valid.ok) {
      console.warn('[screen3/sync] validation failed:', valid.message)
      return NextResponse.json({ error: valid.message }, { status: valid.status })
    }

    const created = await visitsService.createVisit(input)

    // 23505/409 = unique_violation — already inserted on a previous retry. The
    // adapter maps it to duplicate:true; the offline queue needs a 200 here (a
    // 500 would make it retry forever).
    if (created.duplicate) {
      console.log('[screen3/sync] Duplicate insert — already exists, returning 200')
      return NextResponse.json({ id: created.id, duplicate: true }, { status: 200 })
    }

    const recordId = created.id
    console.log('[screen3/sync] inserted:', recordId)

    // ── Geocode prospect postcode — fire-and-forget ───────────────────────────
    // Writes prospect_lat/lng back to the visits row for the map view via the
    // service (the postcodes.io lookup is a public HTTP API, kept inline).
    // Fuzzy fallback: if full postcode fails, retries with just the outcode
    // and sets approximate=true so the map can render a ghost pin.
    if (prospect_postcode && recordId) {
      ;(async () => {
        try {
          // Pass 1 — exact postcode
          const clean = prospect_postcode.replace(/\s/g, '')
          const r1 = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`)
          const d1 = await r1.json()
          if (d1.status === 200 && d1.result) {
            await visitsService.updateProspectLocation({
              visitId: recordId, lat: d1.result.latitude, lng: d1.result.longitude, approximate: false,
            })
            console.log('[screen3/sync] geocoded prospect (exact):', prospect_postcode)
            return
          }
          // Pass 2 — outcode fallback
          const oc = prospect_postcode.trim().toUpperCase().split(' ')[0]
          const r2 = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(oc)}`)
          const d2 = await r2.json()
          if (d2.status === 200 && d2.result) {
            // /outcodes/:oc returns result.latitude directly
            await visitsService.updateProspectLocation({
              visitId: recordId, lat: d2.result.latitude, lng: d2.result.longitude, approximate: true,
            })
            console.log('[screen3/sync] geocoded prospect (outcode fallback):', oc)
          } else {
            console.warn('[screen3/sync] prospect postcode unresolvable:', prospect_postcode)
          }
        } catch (e) {
          console.error('[screen3/sync] prospect geocoding failed (non-fatal):', e)
        }
      })()
    }

    // ── Audit log (fire-and-forget) — raw REST, F-TD-31 (no owned port yet) ────
    let displayName = prospect_name ?? 'Unknown'
    if (customer_id) {
      const customer = await supaGet('customers', `select=name&id=eq.${customer_id}`)
      displayName = customer?.name ?? customer_id
    }
    supaPost('audit_log', {
      user_id:   userId,
      screen:    'screen3',
      action:    'created',
      record_id: recordId ?? null,
      summary:   `Visit logged: ${displayName} — ${visit_type!.replace(/_/g,' ')} — ${outcome!.replace(/_/g,' ')} — by ${userName}`,
    }).catch((e) => console.error('[screen3/sync] audit error:', e))

    return NextResponse.json({ id: recordId }, { status: 201 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stk = err instanceof Error ? err.stack   : undefined
    console.error('[screen3/sync] unhandled error:', msg)
    if (stk) console.error('[screen3/sync] stack:', stk)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
