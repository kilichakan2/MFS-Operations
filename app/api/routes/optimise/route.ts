/**
 * app/api/routes/optimise/route.ts
 *
 * POST — Two-pass routing engine using Google Routes API v2.
 *
 * Algorithm (4 passes):
 *   Pass 1 — Geographic spine: computeRoutes with optimizeWaypointOrder:true
 *   Pass 2 — Cluster: group stops ≤25 min apart by drive time
 *   Pass 3 — Priority sort within each cluster (urgent > priority > none)
 *   Pass 4 — Final ETAs: computeRoutes with optimizeWaypointOrder:false
 *
 * Spec: docs/routing-engine-spec.md
 *
 * KEY FIX: Pass 1 intermediates use latLng coordinates (not address strings).
 * Routes API v2 requires latLng for intermediate waypoints when
 * optimizeWaypointOrder:true — address strings are rejected with INVALID_ARGUMENT.
 * Origin and destination use address format (fixed anchors, not being optimised).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MAPS_KEY  = process.env.GOOGLE_MAPS_API_KEY!

const ROUTES_URL         = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUTES_FIELD_MASK  = 'routes.optimizedIntermediateWaypointIndex,routes.legs,routes.distanceMeters,routes.duration'
// Sniffer uses simpler A→B calls with no intermediates — optimizedIntermediateWaypointIndex
// must NOT be requested when optimizeWaypointOrder is not set (causes INVALID_ARGUMENT)
const SNIFFER_FIELD_MASK = 'routes.legs,routes.distanceMeters,routes.duration'

// Fixed anchors — no spaces, uppercase
const ORIGIN_PC = 'S38DG'    // MFS Sheffield, Neepsend Lane
const OZMEN_PC  = 'S24QT'    // Ozmen John Street

// 25-minute cluster boundary in seconds
const CLUSTER_THRESHOLD_S = 25 * 60

// 15-minute unloading/service time added at every stop
const SERVICE_TIME_MINS = 15
const SERVICE_TIME_MS   = SERVICE_TIME_MINS * 60 * 1000

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, priority: 1, none: 2 }

const supabase = createClient(SUPA_URL, SUPA_KEY)

// ─── Types ────────────────────────────────────────────────────────────────────

interface StopInput {
  customerId:     string
  lockedPosition: boolean
  priority:       'none' | 'urgent' | 'priority'
  priorityNote?:  string
}

interface CustomerRow {
  id:       string
  name:     string
  postcode: string | null
  lat:      number | null
  lng:      number | null
}

interface WorkingStop {
  input:    StopInput
  customer: CustomerRow
  postcode: string   // cleaned
}

interface RoutesLeg {
  duration?:       string   // "723s" protobuf Duration format
  distanceMeters?: number
}

interface RoutesResponse {
  error?: { code: number; message: string; status: string }
  routes?: Array<{
    optimizedIntermediateWaypointIndex?: number[]
    legs:            RoutesLeg[]
    distanceMeters?: number
    duration?:       string
  }>
}

// ─── Waypoint helpers ─────────────────────────────────────────────────────────

/**
 * latLngWaypoint — REQUIRED for intermediate waypoints in Pass 1
 * (optimizeWaypointOrder:true rejects address strings — must use coordinates)
 */
function latLngWaypoint(lat: number, lng: number): Record<string, unknown> {
  return { location: { latLng: { latitude: lat, longitude: lng } } }
}

/**
 * addrWaypoint — used for origin and destination (fixed anchors, not optimised)
 * Also used in Pass 4 where optimizeWaypointOrder:false accepts address strings
 */
function addrWaypoint(postcode: string): Record<string, unknown> {
  return { address: `${postcode}, UK` }
}

// ─── Other helpers ────────────────────────────────────────────────────────────

function cleanPostcode(pc: string): string {
  return pc.replace(/\s+/g, '').trim().toUpperCase()
}

function parseDuration(d: string | undefined): number {
  if (!d) return 0
  return parseInt(d.replace('s', ''), 10) || 0
}

function toHHMM(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 5)
}

async function callRoutesAPI(body: Record<string, unknown>, fieldMask = ROUTES_FIELD_MASK): Promise<RoutesResponse> {
  const res = await fetch(ROUTES_URL, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   MAPS_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<RoutesResponse>
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 0. Parse + validate ──────────────────────────────────────────────────
    const body = await req.json() as {
      stops:         StopInput[]
      departureTime: string
      endPoint:      'mfs' | 'ozmen_john_street'
      plannedDate:   string
    }

    const { stops, departureTime, endPoint, plannedDate } = body

    if (!stops?.length)    return NextResponse.json({ error: 'stops required' },               { status: 400 })
    if (!departureTime)    return NextResponse.json({ error: 'departureTime required' },       { status: 400 })
    if (!plannedDate)      return NextResponse.json({ error: 'plannedDate required' },         { status: 400 })
    if (stops.length > 23) return NextResponse.json({ error: 'Max 23 stops per route' },      { status: 400 })
    if (!MAPS_KEY)         return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

    const destinationPC = endPoint === 'ozmen_john_street' ? OZMEN_PC : ORIGIN_PC

    // ── 1. Fetch customer data ───────────────────────────────────────────────
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, name, postcode, lat, lng')
      .in('id', stops.map(s => s.customerId))

    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 })

    const custMap = new Map<string, CustomerRow>(
      (customers ?? []).map(c => [c.id, c as CustomerRow])
    )

    const missing = stops.filter(s => !custMap.get(s.customerId)?.postcode)
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing postcodes for: ${missing.map(s => custMap.get(s.customerId)?.name ?? s.customerId).join(', ')}` },
        { status: 422 }
      )
    }

    // Check lat/lng for Pass 1 — all stops need coordinates for optimisation
    const missingCoords = stops.filter(s => {
      const c = custMap.get(s.customerId)
      return !c?.lat || !c?.lng
    })
    if (missingCoords.length > 0) {
      return NextResponse.json(
        { error: `Missing coordinates for: ${missingCoords.map(s => custMap.get(s.customerId)?.name ?? s.customerId).join(', ')}. Re-geocode these customers first.` },
        { status: 422 }
      )
    }

    const workingStops: WorkingStop[] = stops.map(s => ({
      input:    s,
      customer: custMap.get(s.customerId)!,
      postcode: cleanPostcode(custMap.get(s.customerId)!.postcode!),
    }))

    // Departure time — omit if in the past (Google uses live traffic)
    const departureDt  = new Date(`${plannedDate}T${departureTime}:00`)
    const departureISO = departureDt.getTime() > Date.now() ? departureDt.toISOString() : null
    if (!departureISO) {
      console.log(`[optimise] Departure ${departureDt.toISOString()} is in the past — omitting (live traffic)`)
    }

    const lockedStops   = workingStops.filter(s => s.input.lockedPosition)
    const unlockedStops = workingStops.filter(s => !s.input.lockedPosition)

    // ════════════════════════════════════════════════════════════════════════
    // PASS 1 — Geographic spine
    // Intermediates MUST use latLng — address strings rejected by Routes API
    // when optimizeWaypointOrder:true
    // ════════════════════════════════════════════════════════════════════════
    let geoOrdered: WorkingStop[]
    let pass1Legs: RoutesLeg[] = []

    if (unlockedStops.length <= 1) {
      geoOrdered = unlockedStops
    } else {
      const p1Body: Record<string, unknown> = {
        origin:                addrWaypoint(ORIGIN_PC),
        destination:           addrWaypoint(destinationPC),
        // latLng required for intermediates — optimizeWaypointOrder:true rejects address strings
        intermediates:         unlockedStops.map(s => latLngWaypoint(s.customer.lat!, s.customer.lng!)),
        travelMode:            'DRIVE',
        // CRITICAL: TRAFFIC_AWARE_OPTIMAL is incompatible with optimizeWaypointOrder:true.
        // Google returns 400: 'optimize_waypoint_order is not supported for TRAFFIC_AWARE_OPTIMAL'.
        // Pass 1 MUST always use TRAFFIC_AWARE regardless of whether we have a future departure time.
        // Pass 4 (optimizeWaypointOrder:false) can use TRAFFIC_AWARE_OPTIMAL for accurate ETAs.
        routingPreference:     'TRAFFIC_AWARE',
        optimizeWaypointOrder: true,
      }
      if (departureISO) p1Body.departureTime = departureISO

      console.log('[optimise] Pass 1 — Geographic spine:', {
        stops:       unlockedStops.map(s => `${s.customer.name} (${s.postcode}) [${s.customer.lat},${s.customer.lng}]`),
        destination: destinationPC,
        departure:   departureISO ?? 'now (live traffic)',
        waypointFormat: 'latLng',
      })

      const p1Res = await callRoutesAPI(p1Body)

      if (p1Res.error || !p1Res.routes?.length) {
        const status = p1Res.error?.status ?? 'UNKNOWN'
        const msg    = p1Res.error?.message ?? 'No routes returned'
        console.error('[optimise] Pass 1 failed:', { status, message: msg, fullError: p1Res.error })

        if (status === 'INVALID_ARGUMENT' || status === 'NOT_FOUND') {
          return sniffBrokenPostcodes(workingStops, destinationPC, departureISO)
        }
        const hint = status === 'RESOURCE_EXHAUSTED'
          ? 'Google Maps quota exceeded — try again tomorrow.'
          : status === 'PERMISSION_DENIED'
          ? 'Routes API not enabled or API key invalid. Enable at console.cloud.google.com → Routes API.'
          : msg
        return NextResponse.json({ error: hint }, { status: 502 })
      }

      const optIdx = p1Res.routes[0].optimizedIntermediateWaypointIndex ?? unlockedStops.map((_, i) => i)
      pass1Legs    = p1Res.routes[0].legs ?? []

      console.log('[optimise] Pass 1 result:', {
        original:  unlockedStops.map((s, i) => `${i}: ${s.customer.name}`),
        optimised: optIdx.map((i, pos) => `${pos + 1}. ${unlockedStops[i].customer.name}`),
        leg_durations_s: pass1Legs.map(l => parseDuration(l.duration)),
      })

      geoOrdered = optIdx.map(i => unlockedStops[i])
    }

    // ════════════════════════════════════════════════════════════════════════
    // PASS 2 — Cluster by 25-min drive time threshold
    // legs[i] = drive FROM the previous stop TO geoOrdered[i].
    // We split when that drive time exceeds 25 minutes.
    // ════════════════════════════════════════════════════════════════════════
    const clusters: WorkingStop[][] = []
    let   current:  WorkingStop[]   = []

    for (let i = 0; i < geoOrdered.length; i++) {
      if (current.length === 0) { current.push(geoOrdered[i]); continue }
      // FIX: use pass1Legs[i] (drive TO this stop), not [i+1] (drive TO next stop)
      const legS = parseDuration(pass1Legs[i]?.duration)
      if (legS > CLUSTER_THRESHOLD_S) {
        clusters.push(current)
        current = [geoOrdered[i]]
      } else {
        current.push(geoOrdered[i])
      }
    }
    if (current.length > 0) clusters.push(current)

    console.log('[optimise] Pass 2 — Clusters:', clusters.map((cl, i) => ({
      cluster: i + 1,
      stops:   cl.map(s => `${s.customer.name} (${s.input.priority})`),
    })))

    // ════════════════════════════════════════════════════════════════════════
    // PASS 3 — Priority sort within each cluster
    // ════════════════════════════════════════════════════════════════════════
    const sorted = clusters.map(cl =>
      [...cl].sort((a, b) =>
        (PRIORITY_ORDER[a.input.priority] ?? 2) - (PRIORITY_ORDER[b.input.priority] ?? 2)
      )
    )

    console.log('[optimise] Pass 3 — After priority sort:', sorted.map((cl, i) => ({
      cluster: i + 1,
      stops:   cl.map(s => `${s.customer.name} (${s.input.priority})`),
    })))

    // Flatten + re-insert locked stops at their original index positions
    const clusteredUnlocked = sorted.flat()
    const finalOrdered: WorkingStop[] = new Array(workingStops.length).fill(null)

    for (const s of lockedStops) {
      const idx = workingStops.findIndex(w => w.input.customerId === s.input.customerId)
      if (idx >= 0) finalOrdered[idx] = s
    }
    let cur = 0
    for (let i = 0; i < finalOrdered.length; i++) {
      if (finalOrdered[i] === null) finalOrdered[i] = clusteredUnlocked[cur++]
    }

    console.log('[optimise] Pass 3 final order:', finalOrdered.map((s, i) =>
      `${i + 1}. ${s.customer.name} (${s.input.priority}${s.input.lockedPosition ? ', LOCKED' : ''})`
    ))

    // ════════════════════════════════════════════════════════════════════════
    // PASS 4 — Final ETAs with locked order
    // Use latLng for all waypoints for consistency and accuracy
    // ════════════════════════════════════════════════════════════════════════
    const p4Body: Record<string, unknown> = {
      origin:                addrWaypoint(ORIGIN_PC),
      destination:           addrWaypoint(destinationPC),
      intermediates:         finalOrdered.map(s => latLngWaypoint(s.customer.lat!, s.customer.lng!)),
      travelMode:            'DRIVE',
      routingPreference:     departureISO ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE',
      optimizeWaypointOrder: false,
    }
    if (departureISO) p4Body.departureTime = departureISO

    console.log('[optimise] Pass 4 — Final ETA confirmation for', finalOrdered.length, 'stops')

    const p4Res = await callRoutesAPI(p4Body)

    // If Pass 4 fails, return order without ETAs rather than crash
    if (p4Res.error || !p4Res.routes?.length) {
      console.error('[optimise] Pass 4 failed — returning order without ETAs:', p4Res.error)
      const fallback = finalOrdered.map((s, i) => ({
        position:             i + 1,
        customerId:           s.input.customerId,
        customerName:         s.customer.name,
        postcode:             s.customer.postcode,
        lat:                  s.customer.lat,
        lng:                  s.customer.lng,
        priority:             s.input.priority,
        lockedPosition:       s.input.lockedPosition,
        priorityNote:         s.input.priorityNote ?? null,
        estimatedArrival:     null,
        driveTimeFromPrevMin: 0,
        distanceFromPrevKm:   0,
      }))
      return NextResponse.json({
        orderedStops:    fallback,
        totalDistanceKm: 0,
        totalDurationMin: 0,
        googleMapsUrl:   buildDeepLink(ORIGIN_PC, destinationPC, finalOrdered),
        warning:         'ETAs unavailable — route order is correct.',
      })
    }

    const p4Legs     = p4Res.routes[0].legs ?? []
    const totalDistM = p4Res.routes[0].distanceMeters ?? p4Legs.reduce((s, l) => s + (l.distanceMeters ?? 0), 0)
    const totalDurS  = parseDuration(p4Res.routes[0].duration) ||
                       p4Legs.reduce((s, l) => s + parseDuration(l.duration), 0)

    // Accumulate drive time + 15-min service time at each stop.
    // Formula: Arrival[N] = Departure + sum(drive[0..N]) + (N × SERVICE_TIME)
    //   - First stop: add drive time only (no prior service time)
    //   - Each subsequent stop: add service time from previous stop, then drive time
    let cumMs = 0
    const orderedStops = finalOrdered.map((s, i) => {
      const leg   = p4Legs[i]
      const legS  = parseDuration(leg?.duration)
      const legKm = (leg?.distanceMeters ?? 0) / 1000

      cumMs += legS * 1000                    // drive time to reach this stop
      const arrival = toHHMM(departureDt.getTime() + cumMs)
      cumMs += SERVICE_TIME_MS               // unloading at this stop (affects next ETA)

      return {
        position:             i + 1,
        customerId:           s.input.customerId,
        customerName:         s.customer.name,
        postcode:             s.customer.postcode,
        lat:                  s.customer.lat,
        lng:                  s.customer.lng,
        priority:             s.input.priority,
        lockedPosition:       s.input.lockedPosition,
        priorityNote:         s.input.priorityNote ?? null,
        estimatedArrival:     arrival,
        driveTimeFromPrevMin: Math.round(legS / 60),
        distanceFromPrevKm:   Math.round(legKm * 10) / 10,
      }
    })

    // True shift length = Google drive time + 15 min unloading at every stop
    const totalDurationMin = Math.round(totalDurS / 60) + finalOrdered.length * SERVICE_TIME_MINS

    const googleMapsUrl = buildDeepLink(ORIGIN_PC, destinationPC, finalOrdered)
    console.log('[optimise] Complete —', orderedStops.length, 'stops,',
      totalDurationMin, 'min total (inc. service time),', Math.round(totalDistM / 1000), 'km')

    return NextResponse.json({
      orderedStops,
      totalDistanceKm:  Math.round((totalDistM / 1000) * 10) / 10,
      totalDurationMin,
      googleMapsUrl,
    })

  } catch (err) {
    console.error('[optimise] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Sniffer — identify broken postcodes ──────────────────────────────────────

async function sniffBrokenPostcodes(
  stops: WorkingStop[],
  destinationPC: string,
  departureISO: string | null,
): Promise<NextResponse> {
  const broken: Array<{ customerId: string; name: string; postcode: string; status: string }> = []
  console.log(`[optimise] Sniffer — testing ${stops.length} stops individually`)

  for (const s of stops) {
    const body: Record<string, unknown> = {
      origin:      addrWaypoint(ORIGIN_PC),
      destination: (s.customer.lat && s.customer.lng)
        ? latLngWaypoint(s.customer.lat, s.customer.lng)
        : addrWaypoint(s.postcode),
      travelMode:        'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',  // no optimizeWaypointOrder, no OPTIMAL
    }
    if (departureISO) body.departureTime = departureISO
    const res = await callRoutesAPI(body, SNIFFER_FIELD_MASK)
    const ok  = !res.error && !!res.routes?.length
    console.log(`[optimise] Sniffer  ${ORIGIN_PC} → ${s.postcode} (${s.customer.name}): ${ok ? 'OK' : res.error?.status ?? 'FAIL'}`)
    if (!ok) broken.push({ customerId: s.input.customerId, name: s.customer.name, postcode: s.customer.postcode!, status: res.error?.status ?? 'FAIL' })
  }

  return NextResponse.json(
    {
      error:           'ZERO_RESULTS',
      brokenPostcodes: broken,
      message:         broken.length > 0
        ? `Could not route to: ${broken.map(b => `${b.name} (${b.postcode})`).join(', ')}. Check postcode${broken.length > 1 ? 's' : ''} and try again.`
        : 'Could not calculate a route. All individual postcodes OK but combined route failed.',
    },
    { status: 422 }
  )
}

// ─── Deep link builder ────────────────────────────────────────────────────────

function buildDeepLink(origin: string, destination: string, stops: WorkingStop[]): string {
  const wps = stops.map(s => s.postcode).join('|')
  return [
    'https://www.google.com/maps/dir/?api=1',
    `&origin=${origin}`,
    `&destination=${destination}`,
    wps ? `&waypoints=${wps}` : '',
    '&travelmode=driving',
  ].join('')
}
