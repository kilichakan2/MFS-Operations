/**
 * app/api/haccp/cleaning/route.ts
 *
 * GET  — today's cleaning log entries
 * POST — submit a new cleaning event
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

type CAPayload = { cause: string; disposition: string; recurrence: string; notes: string }

const DISPOSITION_MAP: Record<string, string> = {
  'Re-cleaned and verified': 'accept',
  'Equipment isolated':      'conditional_accept',
  'Supervisor notified':     'assess',
  'Maintenance requested':   'assess',
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()

    const { data, error } = await supabase
      .from('haccp_cleaning_log')
      .select(`
        id,
        date,
        time_of_clean,
        what_was_cleaned,
        issues,
        what_did_you_do,
        verified_by,
        sanitiser_temp_c,
        submitted_at,
        submitted_by,
        users!inner(name)
      `)
      .eq('date', today)
      .order('submitted_at', { ascending: false })

    if (error) {
      console.error('[GET /api/haccp/cleaning]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      date:    today,
      entries: data ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/cleaning] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { what_was_cleaned, issues, what_did_you_do, verified_by, sanitiser_temp_c, corrective_action } = body as {
      what_was_cleaned:    string
      issues:              boolean
      what_did_you_do?:    string
      verified_by:         string
      sanitiser_temp_c?:   number
      corrective_action?:  CAPayload
    }

    if (!what_was_cleaned?.trim())
      return NextResponse.json({ error: 'Select at least one item that was cleaned' }, { status: 400 })
    if (!verified_by?.trim())
      return NextResponse.json({ error: 'Verified by is required' }, { status: 400 })
    if (issues && !corrective_action)
      return NextResponse.json({ error: 'Corrective action is required when issues are reported' }, { status: 400 })

    const { data: inserted, error } = await supabase
      .from('haccp_cleaning_log')
      .insert({
        submitted_by:     userId,
        date:             todayUK(),
        time_of_clean:    nowTimeUK(),
        what_was_cleaned,
        issues,
        verified_by:      verified_by.trim(),
        sanitiser_temp_c: sanitiser_temp_c ?? null,
        what_did_you_do:  what_did_you_do?.trim() || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[POST /api/haccp/cleaning]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Write CA row if issues reported
    let caWriteFailed = false
    if (issues && corrective_action && inserted) {
      const ca        = corrective_action
      const disp      = DISPOSITION_MAP[ca.disposition] ?? 'assess'
      const recNotes  = ca.notes ? `${ca.recurrence} | Notes: ${ca.notes}` : ca.recurrence

      const { error: caErr } = await supabase.from('haccp_corrective_actions').insert({
        actioned_by:   userId,
        source_table:  'haccp_cleaning_log',
        source_id:     inserted.id,
        ccp_ref:       'SOP2',
        deviation_description: `Cleaning issue: ${what_was_cleaned}. Cause: ${ca.cause}`,
        action_taken:  `${ca.disposition}. Protocol: Stop use, re-clean full 4-step, verify before returning to service.`,
        product_disposition:   disp,
        recurrence_prevention: recNotes,
        management_verification_required: false,
      })

      if (caErr) {
        console.error('[POST /api/haccp/cleaning] CA insert failed:', caErr)
        caWriteFailed = true
      }
    }

    return NextResponse.json({ ok: true, ca_write_failed: caWriteFailed })

  } catch (err) {
    console.error('[POST /api/haccp/cleaning] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
