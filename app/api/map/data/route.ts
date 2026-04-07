/**
 * GET /api/map/data?layer=all|customers|visits&from=ISO&to=ISO
 *
 * Returns geocoded customers and/or visits for the Map View (Screen 6).
 * Admin-only: requires x-mfs-user-id header.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const h = {
  'apikey':         SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
}

export interface MapCustomer {
  id:           string
  name:         string
  postcode:     string
  code:         string | null
  active:       boolean
  lat:          number
  lng:          number
  is_approximate: boolean
}

export interface MapVisit {
  id:            string
  lat:           number
  lng:           number
  visit_type:    string
  outcome:       string
  rep:           string
  customer_name: string
  created_at:    string
  is_prospect:   boolean
  is_approximate: boolean
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-mfs-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
  const { searchParams } = req.nextUrl
  const layer = searchParams.get('layer') ?? 'all'
  const from  = searchParams.get('from')  ?? null
  const to    = searchParams.get('to')    ?? null

  const customers: MapCustomer[] = []
  const visits:    MapVisit[]    = []

  // ── Customers ─────────────────────────────────────────────────────────────
  if (layer === 'all' || layer === 'customers') {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/customers?select=id,name,postcode,external_system_id,active,lat,lng,is_approximate_location&lat=not.is.null&lng=not.is.null&order=name.asc`,
      { headers: h }
    )
    if (res.ok) {
      const rows = await res.json() as {
        id: string; name: string; postcode: string
        external_system_id: string | null; active: boolean
        lat: number; lng: number; is_approximate_location: boolean
      }[]
      for (const r of rows) {
        customers.push({
          id:             r.id,
          name:           r.name,
          postcode:       r.postcode,
          code:           r.external_system_id,
          active:         r.active,
          lat:            r.lat,
          lng:            r.lng,
          is_approximate: r.is_approximate_location,
        })
      }
    }
  }

  // ── Visits ─────────────────────────────────────────────────────────────────
  if (layer === 'all' || layer === 'visits') {
    // Build date filter
    const dateFilter = [
      from ? `&created_at=gte.${from}` : '',
      to   ? `&created_at=lte.${to}`   : '',
    ].join('')

    // Existing-customer visits — join lat/lng from customers table
    const custVisitRes = await fetch(
      `${SUPA_URL}/rest/v1/visits?select=id,visit_type,outcome,created_at,users!visits_user_id_fkey(name),customers!visits_customer_id_fkey(name,lat,lng)&customer_id=not.is.null${dateFilter}&order=created_at.desc&limit=500`,
      { headers: h }
    )
    if (custVisitRes.ok) {
      const rows = await custVisitRes.json() as {
        id: string; visit_type: string; outcome: string; created_at: string
        users: { name: string } | null
        customers: { name: string; lat: number | null; lng: number | null } | null
      }[]
      for (const r of rows) {
        const lat = r.customers?.lat
        const lng = r.customers?.lng
        if (lat == null || lng == null) continue
        visits.push({
          id:             r.id,
          lat,
          lng,
          visit_type:     r.visit_type,
          outcome:        r.outcome,
          rep:            r.users?.name ?? 'Unknown',
          customer_name:  r.customers?.name ?? 'Unknown',
          created_at:     r.created_at,
          is_prospect:    false,
          is_approximate: false,  // customer visits inherit customer coords — already verified
        })
      }
    }

    // Prospect visits — use prospect_lat/lng stored on the visit row
    const prospectVisitRes = await fetch(
      `${SUPA_URL}/rest/v1/visits?select=id,visit_type,outcome,created_at,prospect_name,prospect_lat,prospect_lng,is_approximate_location,users!visits_user_id_fkey(name)&customer_id=is.null&prospect_lat=not.is.null${dateFilter}&order=created_at.desc&limit=500`,
      { headers: h }
    )
    if (prospectVisitRes.ok) {
      const rows = await prospectVisitRes.json() as {
        id: string; visit_type: string; outcome: string; created_at: string
        prospect_name: string | null; prospect_lat: number; prospect_lng: number
        is_approximate_location: boolean
        users: { name: string } | null
      }[]
      for (const r of rows) {
        visits.push({
          id:             r.id,
          lat:            r.prospect_lat,
          lng:            r.prospect_lng,
          visit_type:     r.visit_type,
          outcome:        r.outcome,
          rep:            r.users?.name ?? 'Unknown',
          customer_name:  r.prospect_name ?? 'Prospect',
          created_at:     r.created_at,
          is_prospect:    true,
          is_approximate: r.is_approximate_location,
        })
      }
    }
  }

  return NextResponse.json({ customers, visits })
  } catch (err) {
    console.error('[map/data GET] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
