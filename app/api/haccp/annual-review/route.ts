/**
 * app/api/haccp/annual-review/route.ts
 *
 * SALSA 3.1 — Annual Systems Review
 *
 * GET   — list all reviews (newest first)
 * POST  — create a new draft review (admin only)
 * PATCH — update checklist / action_plan / sign-off (admin only)
 *         sign-off: include signed_off_by, approved_by, approved_at → sets locked=true
 *
 * F-19 PR6 (Cluster D re-point): the route no longer touches Supabase directly —
 * it delegates to `haccpAnnualReviewService` (wired in lib/wiring/haccp.ts). The
 * not-found (404) and locked (409) decisions stay at the route edge because they
 * consume `findCurrent`'s result; the unique-draft 23505 is mapped to
 * ConflictError inside the adapter and turned into the 409 by the catch below.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpAnnualReviewService }  from '@/lib/wiring/haccp'
import { ConflictError }             from '@/lib/errors'
import type {
  CreateAnnualReviewInput,
  UpdateAnnualReviewInput,
} from '@/lib/domain'

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpAnnualReviewService.getReviews()
    return NextResponse.json(result)
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

    const body = (await req.json()) as CreateAnnualReviewInput

    const valid = haccpAnnualReviewService.validateCreate(body)
    if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

    // Only one draft (unlocked) review at a time — the unique index enforces it;
    // a 23505 surfaces as ConflictError (mapped in the adapter) → 409 in the catch.
    const review = await haccpAnnualReviewService.createDraft(
      haccpAnnualReviewService.buildCreatePersist({ input: body, userId, now: new Date() }),
    )

    return NextResponse.json({ review }, { status: 201 })
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
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

    const body = (await req.json()) as UpdateAnnualReviewInput
    const { id, sign_off } = body

    // R-D1: the id-required guard MUST stay at the route edge, BEFORE findCurrent.
    // Without it a missing id would hit findCurrent('') → null → 404, silently
    // turning the original 400 into a 404.
    if (!id) {
      return NextResponse.json({ error: 'Review ID required' }, { status: 400 })
    }

    // Fetch current record — check it exists and isn't locked
    const current = await haccpAnnualReviewService.findCurrent(id)
    if (!current) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }
    if (current.locked) {
      return NextResponse.json({ error: 'This review is locked and cannot be edited' }, { status: 409 })
    }

    const valid = haccpAnnualReviewService.validatePatch({
      input: body,
      currentChecklist: current.checklist,
    })
    if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

    // ── Sign-off path ─────────────────────────────────────────────────────────
    if (sign_off) {
      const signed = await haccpAnnualReviewService.signOff(
        id,
        haccpAnnualReviewService.buildSignOffPersist({ input: body, current, userId, now: new Date() }),
      )
      return NextResponse.json({ review: signed })
    }

    // ── Regular update ────────────────────────────────────────────────────────
    const updated = await haccpAnnualReviewService.update(
      id,
      haccpAnnualReviewService.buildUpdatePersist({ input: body, now: new Date() }),
    )
    return NextResponse.json({ review: updated })

  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('[PATCH /api/haccp/annual-review]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
