/**
 * app/api/admin/customers/[id]/route.ts
 *
 * PATCH — update a customer from the admin panel.
 *   { active: boolean }              — toggle active status
 *   { postcode: string }             — update postcode + geocode inline
 *
 * F-20 PR1: re-pointed onto customersService (writes) + geocoder (postcode
 * lookup). No raw supabaseService query and no inline postcodes.io fetch in app
 * code any more — the DB write goes through the CustomersRepository port and the
 * geocode goes through the Geocoder port. The x-mfs-user-role admin guard is
 * PRESERVED byte-identical; the postcode regex/validation branch, the
 * fire-and-forget road-time trigger, and the response shape
 * ({...row, _geocoded, _approximate, _warning}) are all preserved byte-identical.
 *
 * The service returns the richer CustomerAdminView; this route maps it back to
 * the exact 7-field presentation row before spreading the underscore flags onto
 * it, so the response keys are byte-identical to today.
 */

import { NextRequest, NextResponse } from 'next/server'
import { customersService }          from '@/lib/wiring/customers'
import { geocoder }                  from '@/lib/wiring/geocoder'
import type { CustomerAdminView }    from '@/lib/domain'

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

/** Project the admin view back to today's exact 7-field customer-row shape. */
function toRow(c: CustomerAdminView) {
  return {
    id:         c.id,
    name:       c.name,
    postcode:   c.postcode,
    lat:        c.lat,
    lng:        c.lng,
    active:     c.active,
    created_at: c.created_at,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id }  = await params
    const body    = await req.json() as { active?: boolean; postcode?: string }

    // ── Active toggle ────────────────────────────────────────────────────────
    if (body.active !== undefined) {
      const updated = await customersService.setActive(id, body.active)
      if (updated === null) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      return NextResponse.json(toRow(updated))
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
      const coords = await geocoder.geocode(postcode)

      const updated = await customersService.setPostcodeAndCoords(id, {
        postcode,
        lat:                     coords?.lat    ?? null,
        lng:                     coords?.lng    ?? null,
        geocoded_at:             coords ? now   : null,
        is_approximate_location: coords?.approximate ?? false,
      })

      if (updated === null) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      const data = toRow(updated)

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
