export const dynamic   = 'force-dynamic'
export const maxDuration = 60  // Vercel max for hobby/pro — large matrix may take ~30s

/**
 * POST /api/routes/compute-road-times
 *
 * Computes and caches road times in customer_road_times.
 *
 * Body options:
 *   { mode: 'all' }                     — full matrix: all customers + hub rows
 *   { mode: 'customer', id: string }    — single customer: their row + column + hub pairs
 *   { mode: 'cron' }                    — same as 'all' but only from cron header
 *
 * Uses Google Distance Matrix API v2 (routes.googleapis.com/distanceMatrix/v2).
 * Batched in chunks of 25×25 to stay under API limits.
 *
 * Admin-only (or cron secret). Hub sentinels stored in hub_sentinels table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { MFS_COORDS, OZMEN_COORDS }  from '@/lib/hubs'
import { MFS_HUB_ID, OZMEN_HUB_ID } from '@/lib/road-times'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAPS_KEY      = process.env.GOOGLE_MAPS_API_KEY!
const MATRIX_URL    = 'https://routes.googleapis.com/distanceMatrix/v2'
const CRON_SECRET   = process.env.CRON_SECRET ?? ''
const CHUNK_SIZE    = 25   // Google Distance Matrix max: 25 origins × 25 destinations

// ─── Waypoint helper ──────────────────────────────────────────────────────────

function latLng(lat: number, lng: number) {
  return { waypoint: { location: { latLng: { latitude: lat, longitude: lng } } } }
}

// ─── Call Distance Matrix ─────────────────────────────────────────────────────

interface MatrixEntry {
  originIndex?:      number
  destinationIndex?: number
  duration?:         string   // e.g. "1234s"
  distanceMeters?:   number
  status?:           { code?: number }
}

async function callMatrix(
  origins:      { lat: number; lng: number; id: string }[],
  destinations: { lat: number; lng: number; id: string }[],
): Promise<{ fromId: string; toId: string; duration_s: number; distance_m: number }[]> {
  const body = {
    origins:      origins.map(o => latLng(o.lat, o.lng)),
    destinations: destinations.map(d => latLng(d.lat, d.lng)),
    travelMode:   'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',  // time-independent for caching
  }

  const res  = await fetch(MATRIX_URL, {
    method:  'POST',
    headers: {
      'Content-Type':        'application/json',
      'X-Goog-Api-Key':      MAPS_KEY,
      'X-Goog-FieldMask':    'originIndex,destinationIndex,duration,distanceMeters,status',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[compute-road-times] Matrix API error:', res.status, text)
    return []
  }

  const entries = await res.json() as MatrixEntry[]
  const results: { fromId: string; toId: string; duration_s: number; distance_m: number }[] = []

  for (const e of entries) {
    if (e.status?.code && e.status.code !== 0) continue  // skip failed elements
    const oi = e.originIndex ?? 0
    const di = e.destinationIndex ?? 0
    if (oi === di) continue  // skip self-pairs
    const duration_s  = parseInt((e.duration ?? '0s').replace('s', ''), 10)
    const distance_m  = e.distanceMeters ?? 0
    if (!duration_s)  continue  // skip zero-time pairs
    results.push({
      fromId:     origins[oi].id,
      toId:       destinations[di].id,
      duration_s,
      distance_m,
    })
  }

  return results
}

// ─── Upsert rows ──────────────────────────────────────────────────────────────

async function upsertPairs(
  pairs: { fromId: string; toId: string; duration_s: number; distance_m: number }[]
): Promise<number> {
  if (!pairs.length) return 0
  const now = new Date().toISOString()
  const rows = pairs.map(p => ({
    from_id:     p.fromId,
    to_id:       p.toId,
    duration_s:  p.duration_s,
    distance_m:  p.distance_m,
    computed_at: now,
  }))
  const { error } = await supabase
    .from('customer_road_times')
    .upsert(rows, { onConflict: 'from_id,to_id' })
  if (error) {
    console.error('[compute-road-times] Upsert error:', error.message)
    return 0
  }
  return rows.length
}

// ─── Compute matrix for a set of nodes ────────────────────────────────────────

type Node = { lat: number; lng: number; id: string }

async function computePairs(nodes: Node[]): Promise<number> {
  let total = 0
  // Chunk origins in groups of CHUNK_SIZE
  for (let oi = 0; oi < nodes.length; oi += CHUNK_SIZE) {
    const origins = nodes.slice(oi, oi + CHUNK_SIZE)
    // Chunk destinations in groups of CHUNK_SIZE
    for (let di = 0; di < nodes.length; di += CHUNK_SIZE) {
      const destinations = nodes.slice(di, di + CHUNK_SIZE)
      const pairs = await callMatrix(origins, destinations)
      total += await upsertPairs(pairs)
    }
  }
  return total
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth — admin or valid cron secret
    const role         = req.headers.get('x-mfs-user-role')
    const cronHeader   = req.headers.get('x-cron-secret')
    const isCron       = CRON_SECRET && cronHeader === CRON_SECRET
    const isAdmin      = role === 'admin'

    if (!isAdmin && !isCron) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    if (!MAPS_KEY) {
      return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })
    }

    const body = await req.json() as { mode?: string; id?: string }
    const mode = body.mode ?? 'all'

    // Hub nodes — always included
    const hubNodes: Node[] = [
      { id: MFS_HUB_ID,   lat: MFS_COORDS.lat,   lng: MFS_COORDS.lng   },
      { id: OZMEN_HUB_ID, lat: OZMEN_COORDS.lat,  lng: OZMEN_COORDS.lng },
    ]

    // ── Single customer mode ─────────────────────────────────────────────────
    if (mode === 'customer' && body.id) {
      const { data: cust, error } = await supabase
        .from('customers')
        .select('id, name, lat, lng')
        .eq('id', body.id)
        .eq('active', true)
        .single()

      if (error || !cust?.lat || !cust?.lng) {
        return NextResponse.json({ error: 'Customer not found or not geocoded' }, { status: 404 })
      }

      // Load all other active geocoded customers
      const { data: others } = await supabase
        .from('customers')
        .select('id, lat, lng')
        .eq('active', true)
        .not('lat', 'is', null)
        .neq('id', body.id)

      const otherNodes: Node[] = (others ?? []).map(c => ({ id: c.id, lat: c.lat!, lng: c.lng! }))
      const thisNode:    Node   = { id: cust.id, lat: cust.lat, lng: cust.lng }
      const allNodes          = [...hubNodes, ...otherNodes, thisNode]

      // Compute row (thisNode → all) and column (all → thisNode)
      const rowPairs = await callMatrix([thisNode], allNodes)
      const colPairs = await callMatrix(allNodes,   [thisNode])
      const total    = await upsertPairs([...rowPairs, ...colPairs])

      console.log(`[compute-road-times] customer ${cust.name}: ${total} pairs computed`)
      return NextResponse.json({ ok: true, customer: cust.name, pairs: total })
    }

    // ── Full matrix mode (all / cron) ────────────────────────────────────────
    const { data: customers } = await supabase
      .from('customers')
      .select('id, lat, lng')
      .eq('active', true)
      .not('lat', 'is', null)

    const custNodes: Node[] = (customers ?? []).map(c => ({
      id:  c.id,
      lat: c.lat!,
      lng: c.lng!,
    }))

    const allNodes = [...hubNodes, ...custNodes]
    console.log(`[compute-road-times] Full matrix: ${allNodes.length} nodes (${custNodes.length} customers + 2 hubs)`)

    const total = await computePairs(allNodes)
    console.log(`[compute-road-times] Full matrix complete: ${total} pairs upserted`)

    return NextResponse.json({ ok: true, nodes: allNodes.length, pairs: total })

  } catch (err) {
    console.error('[compute-road-times] Unexpected error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
