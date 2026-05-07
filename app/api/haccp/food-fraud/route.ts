/**
 * app/api/haccp/food-fraud/route.ts
 *
 * BSD 1.6.4 — Food Fraud Vulnerability Assessments
 *
 * GET  — all versions desc + latest flag + review_due (any HACCP role)
 * POST — insert new version (admin only — never overwrites existing rows)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('haccp_food_fraud_assessments')
      .select(`
        id, version, issue_date, next_review_date,
        risks, supply_chain, mitigation_notes, created_at,
        preparer:prepared_by ( name ),
        approver:approved_by ( name ),
        creator:created_by   ( name )
      `)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const assessments = data ?? []
    const latest      = assessments[0] ?? null
    const review_due  = latest
      ? new Date(latest.next_review_date) < new Date()
      : true

    return NextResponse.json({ assessments, latest, review_due })
  } catch (err) {
    console.error('[GET /api/haccp/food-fraud]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const {
      version, issue_date, next_review_date,
      risks, supply_chain, mitigation_notes,
      prepared_by, approved_by,
    } = body

    if (!version?.trim())       return NextResponse.json({ error: 'Version required' },          { status: 400 })
    if (!issue_date)            return NextResponse.json({ error: 'Issue date required' },        { status: 400 })
    if (!next_review_date)      return NextResponse.json({ error: 'Review date required' },       { status: 400 })
    if (!Array.isArray(risks))  return NextResponse.json({ error: 'Risks must be an array' },     { status: 400 })

    const { data, error } = await supabase
      .from('haccp_food_fraud_assessments')
      .insert({
        version:          version.trim(),
        issue_date,
        next_review_date,
        risks,
        supply_chain:     Array.isArray(supply_chain) ? supply_chain : [],
        mitigation_notes: mitigation_notes?.trim() || null,
        prepared_by:      prepared_by || null,
        approved_by:      approved_by || null,
        created_by:       userId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ assessment: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/food-fraud]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
