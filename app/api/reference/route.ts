/**
 * app/api/reference/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns all active customers and products in a single request.
 * Used by syncReferenceData() on the client to populate IndexedDB.
 *
 * Runs server-side — uses the Supabase service role key, never exposed to
 * the client. Auth is validated via the session cookie before any data is
 * returned.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse }         from 'next/server'
import { supabaseService }           from '@/lib/supabase'

// Service role client — bypasses RLS for trusted server-side reads
const supabase = supabaseService

export async function GET() {
  try {
    const [customersRes, productsRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name')
        .eq('active', true)
        .order('name', { ascending: true }),

      supabase
        .from('products')
        .select('id, name, category, box_size, code')
        .eq('active', true)
        .order('name', { ascending: true }),
    ])

    if (customersRes.error) throw customersRes.error
    if (productsRes.error)  throw productsRes.error

    return NextResponse.json({
      customers: customersRes.data,
      products:  productsRes.data,
    })
  } catch (err) {
    console.error('[/api/reference] Error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch reference data' },
      { status: 500 }
    )
  }
}
