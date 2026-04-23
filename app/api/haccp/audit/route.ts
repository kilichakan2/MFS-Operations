/**
 * app/api/haccp/audit/route.ts
 *
 * GET /api/haccp/audit?section=deliveries&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns section-specific audit data within a date range.
 * Lazy-loaded per tab — each section fetched only when clicked.
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorised — admin only' }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const section = searchParams.get('section')
    const from    = searchParams.get('from') ?? daysAgo(30)
    const to      = searchParams.get('to')   ?? todayUK()

    if (!section) {
      return NextResponse.json({ error: 'section param required' }, { status: 400 })
    }

    // ── Deliveries ────────────────────────────────────────────────────────────
    if (section === 'deliveries') {
      const { data: deliveries, error: dErr } = await supabase
        .from('haccp_deliveries')
        .select(`
          id, date, time_of_delivery, supplier, product, species,
          product_category, temperature_c, temp_status,
          covered_contaminated, contamination_notes, contamination_type,
          corrective_action_required, batch_number, delivery_number,
          born_in, reared_in, slaughter_site, cut_site, notes,
          users!submitted_by ( name )
        `)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('time_of_delivery', { ascending: false })

      if (dErr) {
        console.error('[audit/deliveries]', dErr.message)
        return NextResponse.json({ error: dErr.message }, { status: 500 })
      }

      // Fetch CAs for these deliveries
      const deliveryIds = (deliveries ?? []).map((d) => d.id)
      let cas: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        recurrence_prevention: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (deliveryIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`
            id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, recurrence_prevention,
            management_verification_required, resolved, verified_at
          `)
          .eq('source_table', 'haccp_deliveries')
          .in('source_id', deliveryIds)

        for (const ca of caData ?? []) {
          cas[ca.source_id] = ca
        }
      }

      // Merge CAs into delivery rows
      const rows = (deliveries ?? []).map((d) => ({
        ...d,
        submitted_by_name: (d.users as unknown as { name: string } | null)?.name ?? '—',
        ca: cas[d.id] ?? null,
      }))

      // Summary counts
      const summary = {
        total:      rows.length,
        pass:       rows.filter((r) => r.temp_status === 'pass').length,
        urgent:     rows.filter((r) => r.temp_status === 'urgent').length,
        fail:       rows.filter((r) => r.temp_status === 'fail').length,
        ca_count:   rows.filter((r) => r.ca !== null).length,
        unresolved: rows.filter((r) => r.ca !== null && !r.ca.resolved).length,
      }

      // Heatmap data — group by date for this section
      const heatmap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      for (const row of rows) {
        if (!heatmap[row.date]) {
          heatmap[row.date] = { has_records: false, has_deviations: false }
        }
        heatmap[row.date].has_records = true
        if (row.temp_status !== 'pass' || (row.ca && !row.ca.resolved)) {
          heatmap[row.date].has_deviations = true
        }
      }

      return NextResponse.json({ rows, summary, heatmap })
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 })

  } catch (err) {
    console.error('[GET /api/haccp/audit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
