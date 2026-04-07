/**
 * app/api/admin/customers/[id]/route.ts
 *
 * PATCH — update a customer from the admin panel.
 *   { active: boolean }              — toggle active status
 *   { postcode: string }             — update postcode + geocode inline
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

function extractOutcode(postcode: string): string {
  return postcode.trim().toUpperCase().split(' ')[0]
}

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  try {
    const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
    const data = await res.json() as { status: number; result?: { latitude: number; longitude: number } }
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude, approximate: false }
    }
  } catch { /* fall through */ }

  try {
    const outcode = extractOutcode(postcode)
    const res     = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`)
    const data    = await res.json() as { status: number; result?: { latitude: number; longitude: number } }
    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude, approximate: true }
    }
  } catch { /* both failed */ }

  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }  = await params
    const body    = await req.json() as { active?: boolean; postcode?: string }

    // ── Active toggle ────────────────────────────────────────────────────────
    if (body.active !== undefined) {
      const { data, error } = await supabase
        .from('customers')
        .update({ active: body.active })
        .eq('id', id)
        .select('id, name, postcode, lat, lng, active, created_at')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // ── Postcode update ──────────────────────────────────────────────────────
    if (body.postcode !== undefined) {
      const postcode = body.postcode.replace(/\s+/g, ' ').trim().toUpperCase()

      if (!postcode) {
        return NextResponse.json({ error: 'postcode is required' }, { status: 400 })
      }
      if (!UK_POSTCODE_RE.test(postcode)) {
        return NextResponse.json(
          { error: `"${postcode}" doesn't look like a valid UK postcode (e.g. S3 8DG)` },
          { status: 400 }
        )
      }

      const now    = new Date().toISOString()
      const coords = await geocodePostcode(postcode)

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
        .select('id, name, postcode, lat, lng, active, created_at')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      console.log(
        `[admin/customers/:id] ${data.name} postcode → ${postcode}`,
        coords ? `geocoded (${coords.approximate ? 'approx' : 'exact'})` : 'geocoding failed'
      )

      // Fire-and-forget road-time computation for this customer
      if (coords && data?.id) {
        fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/routes/compute-road-times`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-mfs-user-role': 'admin' },
          body: JSON.stringify({ mode: 'customer', id: data.id }),
        }).catch(e => console.warn('[admin/customers/:id] road-time trigger failed:', e))
      }

      return NextResponse.json({
        ...data,
        _geocoded:    !!coords,
        _approximate: coords?.approximate ?? false,
        _warning:     coords ? undefined : 'Postcode saved but could not be geocoded — will retry on next sync',
      })
    }

    return NextResponse.json({ error: 'No valid field to update' }, { status: 400 })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
