/**
 * GET /api/admin/geocode-all
 *
 * One-shot backfill route — Map View feature. Fetches all customers with a
 * postcode but null lat/lng, resolves them through the Geocoder port (exact,
 * then outcode fallback), and writes coordinates back through the Customers
 * service. Sets is_approximate_location=true on an outcode-only match.
 *
 * F-20 PR1 changes (the only behaviour change in this PR):
 *   - GUARD SWAP: the old `?secret=geocode2024` URL guard is replaced by
 *     requireRole(req, ['admin']). Middleware stamps x-mfs-user-id +
 *     x-mfs-user-role on /api/admin/geocode-all (SHARED_API_PATHS), so an
 *     authenticated admin reaches the handler with the headers requireRole
 *     needs. UnauthorizedError → 401, ForbiddenError → 403 (mapped exactly like
 *     app/api/admin/users/route.ts). Operator recipe: run this logged in as an
 *     admin in the browser — no secret query string any more.
 *   - HEXAGONAL: the raw Supabase REST fetches and the bulk postcodes.io fetch
 *     are gone — DB access goes through customersService, geocoding through the
 *     geocoder port. No vendor SDK / raw vendor fetch in this file.
 *
 * The JSON summary response shape is PRESERVED byte-identical
 * ({ message, total_input, geocoded, approximate, failed, failed_list } and the
 * 'Nothing to geocode.' early-return shape).
 */

import { NextRequest, NextResponse } from 'next/server'
import { customersService }          from '@/lib/wiring/customers'
import { geocoder }                  from '@/lib/wiring/geocoder'
import { requireRole }               from '@/lib/auth/session'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'

/** Extract outcode — everything before the inward code (first space-delimited segment). */
function outcode(postcode: string): string {
  return postcode.trim().toUpperCase().split(' ')[0]
}

export async function GET(req: NextRequest) {
  try {
    requireRole(req, ['admin'])

    // 1. Fetch un-geocoded customers
    const customers = await customersService.listUngeocoded(500)
    if (customers.length === 0) {
      return NextResponse.json({ message: 'Nothing to geocode.', geocoded: 0, approximate: 0, failed: 0, failed_list: [] })
    }

    // 2. Bulk geocode (exact + outcode fallback, all behind the Geocoder port)
    const postcodes = customers.map(c => (c.postcode ?? '').trim())
    const geoMap = await geocoder.geocodeMany(postcodes)

    const now = new Date().toISOString()
    let geocoded = 0, approximate = 0
    const failedList: string[] = []

    // 3. Persist per-row (sequential loop preserved from the original route)
    for (const c of customers) {
      const key = (c.postcode ?? '').trim().toUpperCase()
      const coords = geoMap.get(key)
      if (coords) {
        await customersService.setCoords(c.id, {
          lat: coords.lat,
          lng: coords.lng,
          geocoded_at: now,
          is_approximate_location: coords.approximate,
        })
        if (coords.approximate) {
          approximate++
        } else {
          geocoded++
        }
      } else {
        failedList.push(`${c.name} (${c.postcode}) — outcode ${outcode(c.postcode ?? '')} also not found`)
      }
    }

    return NextResponse.json({
      message:     'Geocoding complete.',
      total_input: customers.length,
      geocoded,
      approximate,
      failed:      failedList.length,
      failed_list: failedList,
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    console.error('[geocode-all GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
