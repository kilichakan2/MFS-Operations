/**
 * app/api/routes/customers/[id]/route.ts
 *
 * PATCH — Update a customer's postcode from the route planner inline editor.
 *         Geocodes the new postcode immediately via postcodes.io and returns
 *         lat/lng in the response so the UI can clear the "Not geocoded" warning.
 *
 * Body: { postcode: string }
 *
 * Returns: { customer: { id, name, postcode, lat, lng } }
 *          lat/lng may be null if geocoding failed (postcode still saved)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

function extractOutcode(postcode: string): string {
  return postcode.trim().toUpperCase().split(' ')[0]
}

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  // Pass 1 — exact postcode lookup
  try {
    const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
    const data = await res.json() as { status: number; result?: { latitude: number; longitude: number } }
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude, approximate: false }
    }
  } catch { /* fall through to outcode */ }

  // Pass 2 — outcode fallback (e.g. "S70" for "S70 1GW")
  try {
    const outcode = extractOutcode(postcode)
    const res     = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`)
    const data    = await res.json() as { status: number; result?: { latitude: number; longitude: number } }
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude, approximate: true }
    }
  } catch { /* both passes failed */ }

  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { id } = await params
    const body   = await req.json() as { postcode?: string }

    const postcode = (body.postcode ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

    if (!postcode) {
      return NextResponse.json({ error: 'postcode is required' }, { status: 400 })
    }
    if (!UK_POSTCODE_RE.test(postcode)) {
      return NextResponse.json(
        { error: `"${postcode}" doesn't look like a valid UK postcode (e.g. S3 8DG)` },
        { status: 400 }
      )
    }

    // Geocode the new postcode
    const now    = new Date().toISOString()
    const coords = await geocodePostcode(postcode)

    // Save postcode + coordinates (null if geocoding failed — non-fatal)
    const { data, error } = await supabase
      .from('customers')
      .update({
        postcode,
        lat:                    coords?.lat    ?? null,
        lng:                    coords?.lng    ?? null,
        geocoded_at:            coords ? now   : null,
        is_approximate_location: coords?.approximate ?? false,
      })
      .eq('id', id)
      .select('id, name, postcode, lat, lng')
      .single()

    if (error) {
      console.error('[PATCH /api/routes/customers/:id]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(
      `[PATCH /api/routes/customers/:id] ${data.name} → ${postcode}`,
      coords ? `geocoded (${coords.approximate ? 'approx' : 'exact'}) lat=${coords.lat} lng=${coords.lng}` : 'geocoding failed — lat/lng null'
    )

    return NextResponse.json({
      customer: data,
      geocoded: !!coords,
      approximate: coords?.approximate ?? false,
    })

  } catch (err) {
    console.error('[PATCH /api/routes/customers/:id] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
