/**
 * app/api/routes/optimise/route.ts
 *
 * POST — Preview an optimised route via Google Directions API.
 * Does NOT save anything to the database — this is a pure preview step.
 * The client calls this, shows the result, then calls POST /api/routes to save.
 *
 * Body:
 *   stops[]          Array of { customerId, locked_position, priority, priority_note }
 *   departureTime    "08:00" (HH:MM, local UK time)
 *   endPoint         "mfs" | "ozmen_john_street"
 *   plannedDate      "YYYY-MM-DD" — used to build the departure datetime
 *
 * Returns:
 *   orderedStops[]   Stops in optimised order with estimated arrival times
 *   totalDistanceKm
 *   totalDurationMin
 *   googleMapsUrl    Deep link for the full route
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MAPS_KEY  = process.env.GOOGLE_MAPS_API_KEY!

// Fixed location postcodes
const ORIGIN_POSTCODE      = 'S1 4GE'   // MFS Sheffield warehouse
const OZMEN_POSTCODE       = 'S6 1ND'   // Ozmen John Street

const supabase = createClient(SUPA_URL, SUPA_KEY)

interface StopInput {
  customerId:      string
  lockedPosition:  boolean
  priority:        'none' | 'urgent' | 'priority'
  priorityNote?:   string
}

interface CustomerRow {
  id:       string
  name:     string
  postcode: string | null
  lat:      number | null
  lng:      number | null
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse and validate body ──────────────────────────────────────────
    const body = await req.json() as {
      stops:         StopInput[]
      departureTime: string
      endPoint:      'mfs' | 'ozmen_john_street'
      plannedDate:   string
    }

    const { stops, departureTime, endPoint, plannedDate } = body

    if (!stops?.length)       return NextResponse.json({ error: 'stops required' },         { status: 400 })
    if (!departureTime)       return NextResponse.json({ error: 'departureTime required' }, { status: 400 })
    if (!plannedDate)         return NextResponse.json({ error: 'plannedDate required' },   { status: 400 })
    if (stops.length > 23)    return NextResponse.json({ error: 'Max 23 stops per route' }, { status: 400 })
    if (!MAPS_KEY)            return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 })

    // ── 2. Fetch customer postcodes from Supabase ───────────────────────────
    const customerIds = stops.map(s => s.customerId)
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, name, postcode, lat, lng')
      .in('id', customerIds)

    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 })

    const custMap = new Map<string, CustomerRow>(
      (customers ?? []).map(c => [c.id, c as CustomerRow])
    )

    // Validate every stop has a postcode
    const missing = stops.filter(s => !custMap.get(s.customerId)?.postcode)
    if (missing.length > 0) {
      const names = missing.map(s => custMap.get(s.customerId)?.name ?? s.customerId)
      return NextResponse.json(
        { error: `Missing postcodes for: ${names.join(', ')}. Add postcodes to these customers first.` },
        { status: 422 }
      )
    }

    // ── 3. Separate locked vs optimisable stops ─────────────────────────────
    // Locked stops stay exactly where they are in the stops[] array.
    // Unlocked stops are sent to Google with optimizeWaypoints: true.
    //
    // Strategy:
    //   - Build a slot array matching stops.length positions
    //   - Locked stops occupy their slot index immediately
    //   - Unlocked stops fill remaining slots in Google's optimised order

    const destination = endPoint === 'ozmen_john_street' ? OZMEN_POSTCODE : ORIGIN_POSTCODE

    const lockedIndices   = stops.map((s, i) => s.lockedPosition ? i : -1).filter(i => i >= 0)
    const unlockableStops = stops.filter(s => !s.lockedPosition)

    // ── 4. Call Google Directions API ───────────────────────────────────────
    // We pass all unlocked stops as waypoints with optimize:true.
    // Locked stops are handled in post-processing (see step 5).
    //
    // Google Directions waypoints format:
    //   "optimize:true|postcode1|postcode2|..."

    const unlockablePostcodes = unlockableStops
      .map(s => custMap.get(s.customerId)!.postcode!)
      .map(pc => encodeURIComponent(pc))

    let googleOrder: number[]       = unlockableStops.map((_, i) => i) // default: as-is
    let googleLegs:  GoogleLeg[]    = []
    let totalDistanceM              = 0
    let totalDurationS              = 0

    if (unlockableStops.length > 0) {
      const waypointsParam = unlockablePostcodes.length > 0
        ? `optimize:true|${unlockablePostcodes.join('|')}`
        : ''

      // Build departure time as Unix timestamp for traffic-aware routing
      const departureDt  = new Date(`${plannedDate}T${departureTime}:00`)
      const departureUnix = Math.floor(departureDt.getTime() / 1000)

      const params = new URLSearchParams({
        origin:           ORIGIN_POSTCODE,
        destination,
        waypoints:        waypointsParam,
        travelmode:       'driving',
        departure_time:   String(departureUnix),
        traffic_model:    'best_guess',
        key:              MAPS_KEY,
        region:           'gb',
        units:            'metric',
      })

      const mapsRes  = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
      )
      const mapsData = await mapsRes.json() as GoogleDirectionsResponse

      if (mapsData.status !== 'OK') {
        console.error('[routes/optimise] Google API error:', mapsData.status, mapsData.error_message)
        return NextResponse.json(
          { error: `Google Maps error: ${mapsData.status}. ${mapsData.error_message ?? ''}`.trim() },
          { status: 502 }
        )
      }

      // Google returns waypoint_order: the optimised sequence indices into our unlocked stops array
      googleOrder = mapsData.routes[0].waypoint_order ?? googleOrder
      googleLegs  = mapsData.routes[0].legs ?? []

      // Sum total distance and duration (legs = origin→wp1, wp1→wp2, ..., wpN→destination)
      for (const leg of googleLegs) {
        totalDistanceM += leg.distance.value
        totalDurationS += (leg.duration_in_traffic?.value ?? leg.duration.value)
      }
    }

    // ── 5. Reconstruct the final ordered stop list ──────────────────────────
    // Merge locked stops back into their original positions.
    //
    // Algorithm:
    //   1. Start with an empty slot[] of length stops.length
    //   2. Place locked stops at their slot indices
    //   3. Fill remaining slots in Google's optimised order

    const slots: (StopInput | null)[] = new Array(stops.length).fill(null)

    // Place locked stops
    for (const idx of lockedIndices) {
      slots[idx] = stops[idx]
    }

    // Fill remaining slots with Google's optimised unlocked stops
    const optimisedUnlocked = googleOrder.map(i => unlockableStops[i])
    let   unlockCursor = 0
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === null) {
        slots[i] = optimisedUnlocked[unlockCursor++] ?? null
      }
    }

    // ── 6. Calculate estimated arrivals per stop ────────────────────────────
    // We use departure time + cumulative drive time from Google legs.
    // Legs[0] = origin → stop[0], Legs[1] = stop[0] → stop[1], etc.
    // The last leg goes to the destination (end point), not a stop.

    const departureMs = new Date(`${plannedDate}T${departureTime}:00`).getTime()
    let   cumulativeMs = 0

    const orderedStops = slots.map((stop, i) => {
      if (!stop) return null

      const customer = custMap.get(stop.customerId)!

      // Leg i drives FROM previous stop (or origin) TO this stop
      const leg = googleLegs[i]
      const legDurationS  = leg ? (leg.duration_in_traffic?.value ?? leg.duration.value) : 0
      const legDistanceKm = leg ? leg.distance.value / 1000 : 0

      cumulativeMs += legDurationS * 1000
      const arrivalMs   = departureMs + cumulativeMs
      const arrivalTime = new Date(arrivalMs)
        .toTimeString()
        .slice(0, 5) // "HH:MM"

      return {
        position:              i + 1,
        customerId:            stop.customerId,
        customerName:          customer.name,
        postcode:              customer.postcode,
        lat:                   customer.lat,
        lng:                   customer.lng,
        priority:              stop.priority,
        lockedPosition:        stop.lockedPosition,
        priorityNote:          stop.priorityNote ?? null,
        estimatedArrival:      arrivalTime,
        driveTimeFromPrevMin:  Math.round(legDurationS / 60),
        distanceFromPrevKm:    Math.round(legDistanceKm * 10) / 10,
      }
    }).filter(Boolean)

    const totalDistanceKm  = Math.round((totalDistanceM / 1000) * 10) / 10
    const totalDurationMin = Math.round(totalDurationS / 60)

    // ── 7. Build Google Maps deep link ──────────────────────────────────────
    const waypointPostcodes = orderedStops
      .slice(0, -1) // exclude last stop — it's before the destination
      .map(s => encodeURIComponent(s!.postcode ?? s!.customerName))
      .join('|')

    const googleMapsUrl = [
      'https://www.google.com/maps/dir/?api=1',
      `&origin=${encodeURIComponent(ORIGIN_POSTCODE)}`,
      `&destination=${encodeURIComponent(destination)}`,
      waypointPostcodes ? `&waypoints=${waypointPostcodes}` : '',
      '&travelmode=driving',
    ].join('')

    // ── 8. Return preview result ─────────────────────────────────────────────
    return NextResponse.json({
      orderedStops,
      totalDistanceKm,
      totalDurationMin,
      googleMapsUrl,
    })

  } catch (err) {
    console.error('[routes/optimise] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Google Directions API types (minimal) ────────────────────────────────────

interface GoogleLeg {
  distance:             { value: number; text: string }
  duration:             { value: number; text: string }
  duration_in_traffic?: { value: number; text: string }
  start_address:        string
  end_address:          string
}

interface GoogleDirectionsResponse {
  status:         string
  error_message?: string
  routes: Array<{
    waypoint_order: number[]
    legs:           GoogleLeg[]
  }>
}
