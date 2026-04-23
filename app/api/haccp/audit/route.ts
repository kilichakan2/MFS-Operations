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

      // Heatmap data — pre-keyed so parent can merge generically
      const deliveryHeatmap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      for (const row of rows) {
        if (!deliveryHeatmap[row.date]) {
          deliveryHeatmap[row.date] = { has_records: false, has_deviations: false }
        }
        deliveryHeatmap[row.date].has_records = true
        if (row.temp_status !== 'pass' || (row.ca && !row.ca.resolved)) {
          deliveryHeatmap[row.date].has_deviations = true
        }
      }

      return NextResponse.json({ rows, summary, heatmap: { deliveries: deliveryHeatmap } })
    }


    // ── Cold Storage ──────────────────────────────────────────────────────────
    if (section === 'cold_storage') {
      const { data: temps, error: tErr } = await supabase
        .from('haccp_cold_storage_temps')
        .select(`
          id, date, session, temperature_c, temp_status,
          comments, corrective_action_required,
          unit_id, submitted_at,
          users!submitted_by ( name ),
          haccp_cold_storage_units!unit_id ( name, unit_type, target_temp_c, max_temp_c )
        `)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('session', { ascending: true })

      if (tErr) {
        console.error('[audit/cold_storage]', tErr.message)
        return NextResponse.json({ error: tErr.message }, { status: 500 })
      }

      // Fetch CAs
      const tempIds = (temps ?? []).map((t) => t.id)
      const casMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        recurrence_prevention: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (tempIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`
            id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, recurrence_prevention,
            management_verification_required, resolved, verified_at
          `)
          .eq('source_table', 'haccp_cold_storage_temps')
          .in('source_id', tempIds)
        for (const ca of caData ?? []) {
          casMap[ca.source_id] = ca
        }
      }

      type TempRow = typeof temps extends (infer T)[] | null ? T : never
      const rows = (temps ?? []).map((t: TempRow) => ({
        ...t,
        submitted_by_name: (t.users as unknown as { name: string } | null)?.name ?? '—',
        unit: t.haccp_cold_storage_units as unknown as {
          name: string; unit_type: string; target_temp_c: number; max_temp_c: number
        } | null,
        ca: casMap[t.id] ?? null,
      }))

      const summary = {
        total:      rows.length,
        pass:       rows.filter((r) => r.temp_status === 'pass').length,
        amber:      rows.filter((r) => r.temp_status === 'amber').length,
        critical:   rows.filter((r) => r.temp_status === 'critical').length,
        ca_count:   rows.filter((r) => r.ca !== null).length,
        unresolved: rows.filter((r) => r.ca !== null && !(r.ca as {resolved:boolean}).resolved).length,
      }

      // Heatmap — two rows: cold_am and cold_pm
      const amMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      const pmMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}

      for (const row of rows) {
        const isDeviation = row.temp_status !== 'pass' || (row.ca && !(row.ca as {resolved:boolean}).resolved)
        const map = row.session === 'AM' ? amMap : pmMap
        if (!map[row.date]) map[row.date] = { has_records: false, has_deviations: false }
        map[row.date].has_records = true
        if (isDeviation) map[row.date].has_deviations = true
      }

      return NextResponse.json({
        rows, summary,
        heatmap: { cold_am: amMap, cold_pm: pmMap },
      })
    }


    // ── Process Room ──────────────────────────────────────────────────────────
    if (section === 'process_room') {
      const [{ data: temps, error: tErr }, { data: diary, error: dErr }] = await Promise.all([
        supabase
          .from('haccp_processing_temps')
          .select(`
            id, date, session, product_temp_c, room_temp_c,
            product_within_limit, room_within_limit, within_limits,
            corrective_action_required,
            users!submitted_by ( name )
          `)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false })
          .order('session', { ascending: true }),

        supabase
          .from('haccp_daily_diary')
          .select(`
            id, date, phase, check_results, issues, what_did_you_do,
            users!submitted_by ( name )
          `)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false })
          .order('phase',  { ascending: true }),
      ])

      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

      // CAs for temperatures
      const tempIds = (temps ?? []).map((t) => t.id)
      const tempCasMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        recurrence_prevention: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (tempIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, recurrence_prevention,
            management_verification_required, resolved, verified_at`)
          .eq('source_table', 'haccp_processing_temps')
          .in('source_id', tempIds)
        for (const ca of caData ?? []) tempCasMap[ca.source_id] = ca
      }

      // CAs for diary
      const diaryIds = (diary ?? []).map((d) => d.id)
      const diaryCasMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; resolved: boolean
      }> = {}

      if (diaryIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select('id, source_id, ccp_ref, deviation_description, action_taken, resolved')
          .eq('source_table', 'haccp_daily_diary')
          .in('source_id', diaryIds)
        for (const ca of caData ?? []) diaryCasMap[ca.source_id] = ca
      }

      type TRow = typeof temps extends (infer T)[] | null ? T : never
      type DRow = typeof diary extends (infer T)[] | null ? T : never

      const tempRows = (temps ?? []).map((t: TRow) => ({
        ...t,
        submitted_by_name: (t.users as unknown as { name: string } | null)?.name ?? '—',
        ca: tempCasMap[t.id] ?? null,
      }))

      const diaryRows = (diary ?? []).map((d: DRow) => ({
        ...d,
        submitted_by_name: (d.users as unknown as { name: string } | null)?.name ?? '—',
        ca: diaryCasMap[d.id] ?? null,
      }))

      const tempSummary = {
        total:      tempRows.length,
        pass:       tempRows.filter((r) => r.within_limits).length,
        fail:       tempRows.filter((r) => !r.within_limits).length,
        ca_count:   tempRows.filter((r) => r.ca !== null).length,
        unresolved: tempRows.filter((r) => r.ca !== null && !(r.ca as {resolved:boolean}).resolved).length,
      }

      const diarySummary = {
        total:       diaryRows.length,
        with_issues: diaryRows.filter((r) => r.issues).length,
        opening:     diaryRows.filter((r) => r.phase === 'opening').length,
        operational: diaryRows.filter((r) => r.phase === 'operational').length,
        closing:     diaryRows.filter((r) => r.phase === 'closing').length,
      }

      // Heatmap — three diary rows: opening, operational, closing
      const roomAmMap:           Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      const roomPmMap:           Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      const diaryOpenMap:        Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      const diaryOperationalMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      const diaryCloseMap:       Record<string, { has_records: boolean; has_deviations: boolean }> = {}

      for (const r of tempRows) {
        const isDev = !r.within_limits || (r.ca && !(r.ca as {resolved:boolean}).resolved)
        const map = r.session === 'AM' ? roomAmMap : roomPmMap
        if (!map[r.date]) map[r.date] = { has_records: false, has_deviations: false }
        map[r.date].has_records = true
        if (isDev) map[r.date].has_deviations = true
      }

      for (const r of diaryRows) {
        const isDev = r.issues
        if (r.phase === 'opening') {
          if (!diaryOpenMap[r.date])        diaryOpenMap[r.date]        = { has_records: false, has_deviations: false }
          diaryOpenMap[r.date].has_records = true
          if (isDev) diaryOpenMap[r.date].has_deviations = true
        }
        if (r.phase === 'operational') {
          if (!diaryOperationalMap[r.date]) diaryOperationalMap[r.date] = { has_records: false, has_deviations: false }
          diaryOperationalMap[r.date].has_records = true
          if (isDev) diaryOperationalMap[r.date].has_deviations = true
        }
        if (r.phase === 'closing') {
          if (!diaryCloseMap[r.date])       diaryCloseMap[r.date]       = { has_records: false, has_deviations: false }
          diaryCloseMap[r.date].has_records = true
          if (isDev) diaryCloseMap[r.date].has_deviations = true
        }
      }

      return NextResponse.json({
        tempRows, diaryRows, tempSummary, diarySummary,
        heatmap: {
          room_am:           roomAmMap,
          room_pm:           roomPmMap,
          diary_open:        diaryOpenMap,
          diary_operational: diaryOperationalMap,
          diary_close:       diaryCloseMap,
        },
      })
    }


    // ── Cleaning ──────────────────────────────────────────────────────────────
    if (section === 'cleaning') {
      const { data: cleans, error: cErr } = await supabase
        .from('haccp_cleaning_log')
        .select(`
          id, date, time_of_clean, what_was_cleaned, issues,
          what_did_you_do, sanitiser_temp_c, verified_by,
          users!submitted_by ( name )
        `)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
        .order('time_of_clean', { ascending: false })

      if (cErr) {
        console.error('[audit/cleaning]', cErr.message)
        return NextResponse.json({ error: cErr.message }, { status: 500 })
      }

      // CAs for cleaning records
      const cleanIds = (cleans ?? []).map((c) => c.id)
      const casMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (cleanIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, management_verification_required, resolved, verified_at`)
          .eq('source_table', 'haccp_cleaning_log')
          .in('source_id', cleanIds)
        for (const ca of caData ?? []) casMap[ca.source_id] = ca
      }

      type CRow = typeof cleans extends (infer T)[] | null ? T : never
      const rows = (cleans ?? []).map((c: CRow) => ({
        ...c,
        submitted_by_name: (c.users as unknown as { name: string } | null)?.name ?? '—',
        ca: casMap[c.id] ?? null,
      }))

      const summary = {
        total:          rows.length,
        no_issues:      rows.filter((r) => !r.issues).length,
        with_issues:    rows.filter((r) => r.issues).length,
        sanitiser_fail: rows.filter((r) => r.sanitiser_temp_c !== null && (r.sanitiser_temp_c as unknown as number) < 82).length,
        ca_count:       rows.filter((r) => r.ca !== null).length,
        unresolved:     rows.filter((r) => r.ca !== null && !(r.ca as {resolved:boolean}).resolved).length,
      }

      // Heatmap — single row: cleaning
      const cleanMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      for (const r of rows) {
        if (!cleanMap[r.date]) cleanMap[r.date] = { has_records: false, has_deviations: false }
        cleanMap[r.date].has_records = true
        if (r.issues || (r.ca && !(r.ca as {resolved:boolean}).resolved)) {
          cleanMap[r.date].has_deviations = true
        }
      }

      return NextResponse.json({ rows, summary, heatmap: { cleaning: cleanMap } })
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 })

  } catch (err) {
    console.error('[GET /api/haccp/audit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
