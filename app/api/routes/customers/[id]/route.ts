/**
 * app/api/routes/customers/[id]/route.ts
 *
 * PATCH — Update a customer's postcode directly from the route planner.
 *         Used by the inline edit flow when a stop is flagged as broken.
 *
 * Body: { postcode: string }
 *
 * Also clears lat/lng and geocoded_at so the next route sync will
 * re-geocode the corrected postcode automatically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple UK postcode format check — not exhaustive but catches obvious typos
const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { id } = await params
    const body   = await req.json() as { postcode?: string }

    const raw      = (body.postcode ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
    const postcode = raw

    if (!postcode) {
      return NextResponse.json({ error: 'postcode is required' }, { status: 400 })
    }

    if (!UK_POSTCODE_RE.test(postcode)) {
      return NextResponse.json(
        { error: `"${postcode}" doesn't look like a valid UK postcode (e.g. S3 8DG)` },
        { status: 400 }
      )
    }

    // Update postcode — clear geocoding fields so route sync re-geocodes it
    const { data, error } = await supabase
      .from('customers')
      .update({
        postcode,
        lat:          null,
        lng:          null,
        geocoded_at:  null,
        is_approximate_location: false,
      })
      .eq('id', id)
      .select('id, name, postcode')
      .single()

    if (error) {
      console.error('[PATCH /api/routes/customers/:id]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[PATCH /api/routes/customers/:id] Updated ${data.name} postcode → ${postcode}`)
    return NextResponse.json({ customer: data })

  } catch (err) {
    console.error('[PATCH /api/routes/customers/:id] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
