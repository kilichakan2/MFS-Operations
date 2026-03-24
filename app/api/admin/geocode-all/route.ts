/**
 * GET /api/admin/geocode-all
 *
 * TEMPORARY one-shot route — Sprint 1 of Map View feature.
 * Fetches all customers with null lat/lng, hits postcodes.io bulk
 * endpoint, writes coordinates back to Supabase.
 *
 * DELETE THIS ROUTE after geocoding is confirmed complete.
 * Protect with a secret header check to prevent accidental re-runs.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const supaHeaders = {
  'apikey':         SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
}

interface Customer {
  id:       string
  name:     string
  postcode: string
}

interface PostcodesResult {
  query:  string
  result: { latitude: number; longitude: number } | null
}

export async function GET(req: NextRequest) {
  // Simple guard — require ?secret=geocode2024 so it can't be triggered accidentally
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'geocode2024') {
    return NextResponse.json({ error: 'Forbidden — pass ?secret=geocode2024' }, { status: 403 })
  }

  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 })
  }

  // ── 1. Fetch customers that still need geocoding ────────────────────────────
  const custRes = await fetch(
    `${SUPA_URL}/rest/v1/customers?select=id,name,postcode&postcode=not.is.null&lat=is.null&limit=500`,
    { headers: supaHeaders }
  )
  if (!custRes.ok) {
    const t = await custRes.text()
    return NextResponse.json({ error: `Failed to fetch customers: ${t}` }, { status: 500 })
  }
  const customers: Customer[] = await custRes.json()

  if (customers.length === 0) {
    return NextResponse.json({
      message: 'Nothing to geocode — all customers already have coordinates.',
      geocoded: 0, failed: 0, failed_list: [],
    })
  }

  // ── 2. Hit postcodes.io bulk endpoint (max 100 per request) ────────────────
  const geocoded:    { name: string; postcode: string; lat: number; lng: number }[] = []
  const failedList:  string[] = []
  const now = new Date().toISOString()

  // Batch into groups of 100
  for (let i = 0; i < customers.length; i += 100) {
    const batch = customers.slice(i, i + 100)
    const postcodes = batch.map(c => c.postcode.trim())

    let geoResults: PostcodesResult[] = []
    try {
      const geoRes = await fetch('https://api.postcodes.io/postcodes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postcodes }),
      })
      const geoData = await geoRes.json()
      if (geoData.status !== 200) throw new Error(`postcodes.io returned status ${geoData.status}`)
      geoResults = geoData.result as PostcodesResult[]
    } catch (err) {
      return NextResponse.json({
        error: `postcodes.io request failed: ${err instanceof Error ? err.message : String(err)}`,
      }, { status: 500 })
    }

    // ── 3. Update each customer in Supabase ─────────────────────────────────
    for (const r of geoResults) {
      const customer = batch.find(
        c => c.postcode.trim().toUpperCase() === r.query.toUpperCase()
      )
      if (!customer) continue

      if (!r.result) {
        failedList.push(`${customer.name} (${customer.postcode}) — not found in postcodes.io`)
        continue
      }

      const upRes = await fetch(
        `${SUPA_URL}/rest/v1/customers?id=eq.${customer.id}`,
        {
          method:  'PATCH',
          headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body:    JSON.stringify({
            lat:         r.result.latitude,
            lng:         r.result.longitude,
            geocoded_at: now,
          }),
        }
      )

      if (upRes.ok) {
        geocoded.push({
          name:     customer.name,
          postcode: customer.postcode,
          lat:      r.result.latitude,
          lng:      r.result.longitude,
        })
      } else {
        const errText = await upRes.text()
        failedList.push(`${customer.name} (${customer.postcode}) — DB update error: ${errText.slice(0, 80)}`)
      }
    }
  }

  return NextResponse.json({
    message:     `Geocoding complete.`,
    total_input: customers.length,
    geocoded:    geocoded.length,
    failed:      failedList.length,
    failed_list: failedList,
    results:     geocoded,
  })
}
