/**
 * GET /api/admin/geocode-all
 *
 * TEMPORARY one-shot route — Sprint 1 of Map View feature.
 * Fetches all customers with null lat/lng, hits postcodes.io bulk endpoint,
 * writes coordinates back to Supabase.
 *
 * Fuzzy fallback: if a full postcode fails, retries with just the outcode
 * (e.g. "S70 1KW" → "S70"). Sets is_approximate_location=true on fallback.
 *
 * DELETE THIS ROUTE after geocoding is confirmed complete.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const supaHeaders = {
  'apikey':         SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
}

interface Customer { id: string; name: string; postcode: string }
interface GeoResult { query: string; result: { latitude: number; longitude: number } | null }

/** Extract outcode — everything before the inward code (last 3 chars after space) */
function outcode(postcode: string): string {
  return postcode.trim().toUpperCase().split(' ')[0]
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'geocode2024') {
    return NextResponse.json({ error: 'Forbidden — pass ?secret=geocode2024' }, { status: 403 })
  }
  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 })
  }

  // 1. Fetch un-geocoded customers
  const custRes = await fetch(
    `${SUPA_URL}/rest/v1/customers?select=id,name,postcode&postcode=not.is.null&lat=is.null&limit=500`,
    { headers: supaHeaders }
  )
  if (!custRes.ok) {
    return NextResponse.json({ error: `Failed to fetch customers: ${await custRes.text()}` }, { status: 500 })
  }
  const customers: Customer[] = await custRes.json()
  if (customers.length === 0) {
    return NextResponse.json({ message: 'Nothing to geocode.', geocoded: 0, approximate: 0, failed: 0, failed_list: [] })
  }

  // 2. Bulk geocode
  const postcodes = customers.map(c => c.postcode.trim())
  const geoRes = await fetch('https://api.postcodes.io/postcodes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postcodes }),
  })
  const geoData = await geoRes.json()
  if (geoData.status !== 200) {
    return NextResponse.json({ error: `postcodes.io error: ${geoData.status}` }, { status: 500 })
  }

  // Build map: POSTCODE → coords
  const geoMap: Record<string, { lat: number; lng: number }> = {}
  for (const r of (geoData.result as GeoResult[])) {
    if (r.result) geoMap[r.query.toUpperCase()] = { lat: r.result.latitude, lng: r.result.longitude }
  }

  const now = new Date().toISOString()
  let geocoded = 0, approximate = 0
  const failedList: string[] = []
  const needFallback: Customer[] = []

  // 3. First pass — exact match
  for (const c of customers) {
    const key = c.postcode.trim().toUpperCase()
    const coords = geoMap[key]
    if (coords) {
      await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${c.id}`, {
        method: 'PATCH', headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ lat: coords.lat, lng: coords.lng, geocoded_at: now, is_approximate_location: false }),
      })
      geocoded++
    } else {
      needFallback.push(c)
    }
  }

  // 4. Fallback pass — outcode only
  if (needFallback.length > 0) {
    const outcodes = [...new Set(needFallback.map(c => outcode(c.postcode)))]
    const fallbackRes = await fetch('https://api.postcodes.io/outcodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcodes }),
    })
    const fallbackData = await fallbackRes.json()
    const fallbackMap: Record<string, { lat: number; lng: number }> = {}
    if (fallbackData.status === 200) {
      for (const r of (fallbackData.result as { outcode: string; latitude: number; longitude: number }[])) {
        fallbackMap[r.outcode.toUpperCase()] = { lat: r.latitude, lng: r.longitude }
      }
    }

    for (const c of needFallback) {
      const oc = outcode(c.postcode)
      const coords = fallbackMap[oc]
      if (coords) {
        await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${c.id}`, {
          method: 'PATCH', headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ lat: coords.lat, lng: coords.lng, geocoded_at: now, is_approximate_location: true }),
        })
        approximate++
      } else {
        failedList.push(`${c.name} (${c.postcode}) — outcode ${oc} also not found`)
      }
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
}
