/**
 * app/api/routes/customers/route.ts
 *
 * GET — Returns all active customers with the fields the route planner needs:
 *   id, name, postcode, lat, lng
 *
 * Separate from /api/reference which only returns id + name for IndexedDB sync.
 * Service role key — bypasses RLS, runs server-side only.
 *
 * Why not extend /api/reference?
 *   /api/reference feeds the client IndexedDB cache on Screens 1-3. Adding
 *   postcode/lat/lng would increase that payload by ~40% for no benefit on
 *   those screens, and any schema change risks breaking the Dexie sync contract.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data, error } = await supabase
      .from('customers')
      .select('id, name, postcode, lat, lng')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('[/api/routes/customers] Supabase error:', error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const total    = data?.length ?? 0
    const withPost = data?.filter(c => c.postcode)?.length ?? 0
    const withCoord = data?.filter(c => c.lat != null)?.length ?? 0
    console.log(`[/api/routes/customers] ${total} customers — ${withPost} with postcode, ${withCoord} geocoded`)

    return NextResponse.json({ customers: data ?? [] })

  } catch (err) {
    console.error('[/api/routes/customers] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
