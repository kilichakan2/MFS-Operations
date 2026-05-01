/**
 * app/api/haccp/allergen-assessment/monthly-reviews/route.ts
 *
 * SALSA 1.4.2 — monthly allergen monitoring records
 *
 * GET  — list all past monthly reviews (newest first)
 * POST — run review for a given month (admin only)
 *        Queries live delivery data, aggregates, upserts record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import {
  monthDateRange,
  deriveSiteStatus,
  buildCategoryBreakdown,
} from '@/lib/allergen/monthlyReviewUtils'

const supabase = supabaseService

// ─── Helpers ──────────────────────────────────────────────────────────────────
// monthDateRange, deriveSiteStatus, buildCategoryBreakdown imported from utils

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_allergen_monthly_reviews')
      .select(`
        id, month_year, period_start, period_end,
        total_deliveries, allergen_detections, category_breakdown,
        detection_details, site_status, reviewed_at, notes,
        reviewer:reviewed_by ( name )
      `)
      .order('period_start', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reviews: data ?? [] })
  } catch (err) {
    console.error('[GET /api/haccp/allergen-assessment/monthly-reviews]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — run monthly review ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { month_year, notes } = body as { month_year: string; notes?: string }

    // Validate month format
    const range = monthDateRange(month_year)
    if (!range) {
      return NextResponse.json(
        { error: 'Invalid month format — expected YYYY-MM' },
        { status: 400 },
      )
    }

    // Fetch all deliveries in the month
    const { data: deliveries, error: delivErr } = await supabase
      .from('haccp_deliveries')
      .select('id, date, supplier, product, product_category, allergens_identified, allergen_notes, batch_number')
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: true })

    if (delivErr) {
      return NextResponse.json({ error: delivErr.message }, { status: 500 })
    }

    const rows = deliveries ?? []

    // Aggregate
    const totalDeliveries    = rows.length
    const detections         = rows.filter(d => d.allergens_identified === true)
    const allergenDetections = detections.length
    const categoryBreakdown  = buildCategoryBreakdown(rows)
    const siteStatus         = deriveSiteStatus(totalDeliveries, allergenDetections)

    // Build detection detail records (only flagged deliveries)
    const detectionDetails = detections.map(d => ({
      date:          d.date,
      supplier:      d.supplier,
      product:       d.product,
      category:      d.product_category,
      batch_number:  d.batch_number ?? null,
      allergen_notes: d.allergen_notes ?? null,
    }))

    // Upsert — overwrite if review for this month already exists
    const { data: saved, error: upsertErr } = await supabase
      .from('haccp_allergen_monthly_reviews')
      .upsert(
        {
          month_year,
          period_start:        range.start,
          period_end:          range.end,
          total_deliveries:    totalDeliveries,
          allergen_detections: allergenDetections,
          category_breakdown:  categoryBreakdown,
          detection_details:   detectionDetails,
          site_status:         siteStatus,
          reviewed_by:         userId,
          reviewed_at:         new Date().toISOString(),
          notes:               notes?.trim() || null,
        },
        { onConflict: 'month_year' },
      )
      .select()
      .single()

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      review:           saved,
      total_deliveries: totalDeliveries,
      detections:       allergenDetections,
      site_status:      siteStatus,
      already_existed:  false, // upsert handles both cases
    }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/haccp/allergen-assessment/monthly-reviews]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
