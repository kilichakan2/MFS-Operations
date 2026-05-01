/**
 * app/api/haccp/annual-review/route.ts
 *
 * SALSA 3.1 — Annual Systems Review
 *
 * GET   — list all reviews (newest first)
 * POST  — create a new draft review (admin only)
 * PATCH — update checklist / action_plan / sign-off (admin only)
 *         sign-off: include signed_off_by, approved_by, approved_at → sets locked=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import {
  buildInitialChecklist,
  buildInitialActionPlan,
  isValidStatus,
  isValidReviewPeriod,
  canSignOff,
  type Checklist,
  type ActionPlanItem,
} from '@/lib/annualReview/sections'

const supabase = supabaseService

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_annual_reviews')
      .select(`
        id, review_year, review_period_from, review_period_to,
        locked, signed_off_at, approved_at, updated_at, created_at,
        signer:signed_off_by  ( name ),
        approver:approved_by  ( name ),
        creator:created_by    ( name )
      `)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reviews: data ?? [] })
  } catch (err) {
    console.error('[GET /api/haccp/annual-review]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — create new draft ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { review_year, review_period_from, review_period_to } = body as {
      review_year:        string
      review_period_from: string
      review_period_to:   string
    }

    if (!review_year?.trim()) {
      return NextResponse.json({ error: 'Review year label is required' }, { status: 400 })
    }
    if (!isValidReviewPeriod(review_period_from, review_period_to)) {
      return NextResponse.json(
        { error: 'Invalid review period — from must be before to, and to cannot be in the future' },
        { status: 400 },
      )
    }

    // Only one draft (unlocked) review at a time — unique index enforces this
    const { data, error } = await supabase
      .from('haccp_annual_reviews')
      .insert({
        review_year:        review_year.trim(),
        review_period_from,
        review_period_to,
        checklist:          buildInitialChecklist(),
        action_plan:        buildInitialActionPlan(),
        locked:             false,
        created_by:         userId,
        updated_at:         new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      // Unique index violation = draft already exists
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A draft review already exists. Complete or delete it before starting a new one.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ review: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/annual-review]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update checklist / action plan / sign-off ────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { id, checklist, action_plan, sign_off } = body as {
      id:           string
      checklist?:   Checklist
      action_plan?: ActionPlanItem[]
      sign_off?:    { approved_by: string; approved_at: string }
    }

    if (!id) {
      return NextResponse.json({ error: 'Review ID required' }, { status: 400 })
    }

    // Fetch current record — check it exists and isn't locked
    const { data: current, error: fetchErr } = await supabase
      .from('haccp_annual_reviews')
      .select('id, locked, checklist')
      .eq('id', id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }
    if (current.locked) {
      return NextResponse.json({ error: 'This review is locked and cannot be edited' }, { status: 409 })
    }

    // ── Validate checklist if provided ────────────────────────────────────────
    if (checklist) {
      for (const [sectionKey, section] of Object.entries(checklist)) {
        if (!Array.isArray(section.items)) {
          return NextResponse.json(
            { error: `Section ${sectionKey}: items must be an array` },
            { status: 400 },
          )
        }
        for (const item of section.items) {
          if (!isValidStatus(item.status)) {
            return NextResponse.json(
              { error: `Section ${sectionKey}: invalid status "${item.status}" — must be ok, na, action, or null` },
              { status: 400 },
            )
          }
        }
      }
    }

    // ── Sign-off path ─────────────────────────────────────────────────────────
    if (sign_off) {
      const { approved_by, approved_at } = sign_off
      if (!approved_by || !approved_at) {
        return NextResponse.json({ error: 'approved_by and approved_at required for sign-off' }, { status: 400 })
      }

      const checklistToUse = checklist ?? (current.checklist as Checklist)
      if (!canSignOff(false, checklistToUse)) {
        return NextResponse.json(
          { error: 'Cannot sign off — not all checklist sections are complete' },
          { status: 400 },
        )
      }

      const { data: signed, error: signErr } = await supabase
        .from('haccp_annual_reviews')
        .update({
          checklist:      checklistToUse,
          action_plan:    action_plan ?? undefined,
          signed_off_by:  userId,
          signed_off_at:  new Date().toISOString(),
          approved_by,
          approved_at,
          locked:         true,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })
      return NextResponse.json({ review: signed })
    }

    // ── Regular update ────────────────────────────────────────────────────────
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (checklist)    updates.checklist    = checklist
    if (action_plan)  updates.action_plan  = action_plan

    const { data: updated, error: updateErr } = await supabase
      .from('haccp_annual_reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    return NextResponse.json({ review: updated })

  } catch (err) {
    console.error('[PATCH /api/haccp/annual-review]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
