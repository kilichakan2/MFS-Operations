/**
 * POST /api/admin/import/confirm
 *
 * Receives the admin-confirmed clean_rows array and the target type
 * ('customers' or 'products') and performs a bulk insert into Supabase.
 *
 * Also writes a single audit_log entry summarising the import.
 * Returns { inserted: number, skipped: number } — skipped count covers
 * rows that failed individually (e.g. duplicate name constraint).
 *
 * Sprint 1 Map View: new customer inserts now trigger a fire-and-forget
 * geocoding call to postcodes.io so lat/lng are written automatically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { customersServiceForCaller } from '@/lib/wiring/customers'
import { productsServiceForCaller }  from '@/lib/wiring/products'
import { geocoder }                  from '@/lib/wiring/geocoder'
import { auditLogForCaller }         from '@/lib/wiring/auditLog'
import { requireRole }               from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import type { CustomersService }     from '@/lib/services'

interface CustomerRow { name: string; postcode?: string }
interface ProductRow  { name: string; category?: string | null; code?: string | null; box_size?: string | null }

// ── Geocoding helper — fire-and-forget (W1) ───────────────────────────────────
// Called after new customers are inserted. Resolves postcodes through the
// Geocoder port (one geocodeMany round-trip; the exact→outcode fallback + the
// `approximate` flag now live INSIDE the postcodes adapter) and writes lat/lng
// back via customersService.setCoords. Errors are SWALLOWED — a failed geocode
// is non-blocking; the map simply omits that pin until next run. The call site
// also wraps this in `.catch(() => {})` so a thrown GeocoderError OR a setCoords
// ServiceError can NEVER turn the already-returned 201 into an error (W1).
//
// F-RLS-04i: the `customersService` is passed in (the PER-CALLER authenticated
// service built in POST), NOT a module-level singleton — so the setCoords write
// below runs under the caller's key and the customers_update is_admin() policy
// passes (R-GEOCODE-WRITE).
async function geocodeNewCustomers(
  customersService: CustomersService,
  rows: { id: string; postcode: string }[],
) {
  const withPostcode = rows.filter(r => r.postcode?.trim())
  if (withPostcode.length === 0) return

  const now = new Date().toISOString()
  // geocodeMany keys results by the postcode normalised trim()+upper-case.
  const geoMap = await geocoder.geocodeMany(withPostcode.map(r => r.postcode.trim()))
  for (const r of withPostcode) {
    const coords = geoMap.get(r.postcode.trim().toUpperCase())
    if (!coords) continue
    await customersService.setCoords(r.id, {
      lat: coords.lat,
      lng: coords.lng,
      geocoded_at: now,
      is_approximate_location: coords.approximate,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller   = requireRole(req, ['admin'])
    const userId   = caller.userId!
    const userName = req.headers.get('x-mfs-user-name') ?? 'Admin'

    // F-RLS-04i: ALL THREE writes (customers, products, audit_log) run through
    // the per-caller authenticated client (is_admin() insert policies + the
    // audit_log_insert WITH CHECK user_id=GUC fire). Rollback = swap each
    // `…ForCaller(userId)` → its module-level singleton.
    const customersService = await customersServiceForCaller(userId)
    const productsService  = await productsServiceForCaller(userId)
    const auditLog         = await auditLogForCaller(userId)

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { type, rows } = body as {
      type: 'customers' | 'products'
      rows: (CustomerRow | ProductRow)[]
    }

    if (type !== 'customers' && type !== 'products') {
      return NextResponse.json(
        { error: 'type must be "customers" or "products"' },
        { status: 400 }
      )
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'rows array is required and must not be empty' },
        { status: 400 }
      )
    }

    // ── Build insert payload ──────────────────────────────────────────────────
    const validRows = rows.filter((r) => typeof r.name === 'string' && r.name.trim())

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to insert after validation' },
        { status: 400 }
      )
    }

    let inserted = 0
    let skipped  = 0

    if (type === 'customers') {
      // The adapter sets active:true; the route maps only name/postcode/created_by.
      const payload = validRows.map((r) => ({
        name:       (r as CustomerRow).name.trim(),
        postcode:   (r as CustomerRow).postcode?.trim() || null,
        created_by: userId,
      }))

      // Bulk insert is all-or-nothing: a batch error throws ServiceError inside
      // the adapter → bubbles to the catch below → 500 'Server error'. DEVIATION
      // (Locked item 5): today this returned the raw PostgREST error.message; the
      // re-point returns a GENERIC 'Server error' (no raw vendor leak) — within
      // the PR1/PR2 accepted-deviation envelope, a net security improvement.
      const created = await customersService.insertMany(payload)

      inserted = created.length
      skipped  = validRows.length - inserted

      // Fire-and-forget geocoding for newly inserted customers that have postcodes
      if (created.length > 0) {
        const toGeocode = created
          .filter(d => d.postcode)
          .map(d => ({ id: d.id, postcode: d.postcode! }))
        geocodeNewCustomers(customersService, toGeocode).catch(() => {/* swallow — W1, already logged inside */})

        // After geocoding completes (async), trigger road-time computation for all new customers.
        // We use a delayed fire-and-forget — geocoding must finish first so lat/lng exist.
        // Each new customer's pairs are computed individually via the compute-road-times route.
        setTimeout(() => {
          for (const d of created) {
            fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/routes/compute-road-times`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-mfs-user-role': 'admin' },
              body: JSON.stringify({ mode: 'customer', id: d.id }),
            }).catch(e => console.warn('[import/confirm] road-time trigger failed:', e))
          }
        }, 5000)  // 5s delay — geocoding typically completes in 1-2s
      }

    } else {
      const sentinel = (v: string | null | undefined): string | null => {
        if (!v || v.trim() === '' || v.trim().toLowerCase() === 'none') return null
        return v.trim()
      }

      // The sentinel 'none'→null cleaning stays in the ROUTE (it is row-cleaning,
      // applied BEFORE the repo call); the adapter receives already-cleaned
      // category/code/box_size and sets active:true itself.
      const payload = validRows.map((r) => ({
        name:       (r as ProductRow).name.trim(),
        category:   sentinel((r as ProductRow).category),
        code:       sentinel((r as ProductRow).code),
        box_size:   sentinel((r as ProductRow).box_size),
        created_by: userId,
      }))

      // All-or-nothing bulk insert (same deviation as customers: a batch error
      // throws → 500 'Server error', no raw vendor message).
      const created = await productsService.insertMany(payload)

      inserted = created.length
      skipped  = validRows.length - inserted
    }

    // ── Write audit log ───────────────────────────────────────────────────────
    // Best-effort (R-AUDIT): today the inline insert's `{ error }` is IGNORED —
    // an audit-write failure never fails an already-succeeded import. The .catch
    // preserves that.
    const entityLabel = type === 'customers' ? 'customer' : 'product'
    await auditLog.record({
      user_id:   userId,
      screen:    'screen5',
      action:    'imported',
      record_id: null,
      summary:   `${inserted} ${entityLabel}${inserted === 1 ? '' : 's'} imported via AI import by ${userName}${skipped > 0 ? ` (${skipped} skipped — already exist)` : ''}`,
    }).catch(e => console.error('[import/confirm] audit write failed (non-fatal):', e))

    return NextResponse.json({ inserted, skipped }, { status: 201 })

  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error('[import/confirm] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
