/**
 * app/api/haccp/product-specs/route.ts
 *
 * BSD 1.6.2 — Product Specifications
 *
 * GET   — all active specs + review status (any logged-in role)
 * POST  — create spec (admin only)
 * PATCH — update spec (admin only); deactivate via active=false
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_product_specs')
      .select(`
        id, product_name, description, ingredients, allergens,
        portion_weight_g, storage_temp_c,
        shelf_life_chilled_days, shelf_life_frozen_days,
        packaging_type, micro_limits,
        version, reviewed_at, active,
        created_at, updated_at,
        reviewer:reviewed_by ( name ),
        creator:created_by   ( name )
      `)
      .eq('active', true)
      .order('product_name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Derive review_due: never reviewed or reviewed > 12 months ago
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

    const specs = (data ?? []).map(s => ({
      ...s,
      review_due: !s.reviewed_at || new Date(s.reviewed_at) < twelveMonthsAgo,
    }))

    const review_due_count = specs.filter(s => s.review_due).length

    return NextResponse.json({ specs, review_due_count })
  } catch (err) {
    console.error('[GET /api/haccp/product-specs]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — create ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const {
      product_name, description, ingredients, allergens,
      portion_weight_g, storage_temp_c,
      shelf_life_chilled_days, shelf_life_frozen_days,
      packaging_type, micro_limits,
      version, reviewed_at, reviewed_by,
    } = body

    if (!product_name?.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('haccp_product_specs')
      .insert({
        product_name:            product_name.trim(),
        description:             description?.trim()   || null,
        ingredients:             ingredients?.trim()   || null,
        allergens:               allergens?.trim()     || null,
        portion_weight_g:        portion_weight_g      || null,
        storage_temp_c:          storage_temp_c        || null,
        shelf_life_chilled_days: shelf_life_chilled_days || null,
        shelf_life_frozen_days:  shelf_life_frozen_days  || null,
        packaging_type:          packaging_type?.trim() || null,
        micro_limits:            micro_limits?.trim()   || null,
        version:                 version?.trim()        || 'V1.0',
        reviewed_at:             reviewed_at            || null,
        reviewed_by:             reviewed_by            || null,
        created_by:              userId,
        updated_at:              new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ spec: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/product-specs]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update ───────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { id, ...fields } = body

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { data, error } = await supabase
      .from('haccp_product_specs')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ spec: data })
  } catch (err) {
    console.error('[PATCH /api/haccp/product-specs]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
