/**
 * app/api/test-routes/route.ts
 *
 * TEMPORARY — Infrastructure proof-of-life test for Google Routes API v2.
 * DELETE this file once the Routes API is confirmed working.
 *
 * Tests:
 *   - API key is valid for Routes API v2 (routes.googleapis.com)
 *   - computeRoutes endpoint accepts our payload
 *   - TRAFFIC_AWARE_OPTIMAL routing preference is enabled on the project
 *
 * Call: GET /api/test-routes
 * Returns the raw Google response and logs it to Vercel console.
 */

import { NextResponse } from 'next/server'

const MAPS_KEY    = process.env.GOOGLE_MAPS_API_KEY!
const ROUTES_URL  = 'https://routes.googleapis.com/directions/v2:computeRoutes'

export async function GET() {
  if (!MAPS_KEY) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set in environment' }, { status: 500 })
  }

  const payload = {
    origin: {
      address: 'S38DG, UK',
    },
    destination: {
      address: 'S24QT, UK',
    },
    travelMode:         'DRIVE',
    routingPreference:  'TRAFFIC_AWARE_OPTIMAL',
    computeAlternativeRoutes: false,
    languageCode: 'en-GB',
    units:        'METRIC',
  }

  console.log('[test-routes] Sending to Google Routes API v2:', {
    url:             ROUTES_URL,
    api_key_prefix:  MAPS_KEY.slice(0, 10) + '...',
    payload,
  })

  let googleStatus: number
  let googleData: unknown

  try {
    const res = await fetch(ROUTES_URL, {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-Goog-Api-Key':     MAPS_KEY,
        'X-Goog-FieldMask':   'routes.duration,routes.distanceMeters,routes.legs',
      },
      body: JSON.stringify(payload),
    })

    googleStatus = res.status
    googleData   = await res.json()

    console.log('[test-routes] Google Routes API v2 response:', {
      httpStatus: googleStatus,
      data:       googleData,
    })

  } catch (err) {
    console.error('[test-routes] Network error calling Google Routes API:', err)
    return NextResponse.json({ error: 'Network error', detail: String(err) }, { status: 502 })
  }

  return NextResponse.json({
    googleHttpStatus: googleStatus!,
    googleResponse:   googleData,
    apiKeyPrefix:     MAPS_KEY.slice(0, 10) + '...',
    testedEndpoint:   ROUTES_URL,
    payload,
  })
}
