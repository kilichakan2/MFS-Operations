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


    // ── Calibration ───────────────────────────────────────────────────────────
    if (section === 'calibration') {
      const { data: cals, error: cErr } = await supabase
        .from('haccp_calibration_log')
        .select(`
          id, date, time_of_check, thermometer_id, calibration_mode,
          ice_water_result_c, ice_water_pass,
          boiling_water_result_c, boiling_water_pass,
          action_taken, cert_reference, purchase_date, verified_by,
          users!submitted_by ( name )
        `)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
        .order('time_of_check', { ascending: false })

      if (cErr) {
        console.error('[audit/calibration]', cErr.message)
        return NextResponse.json({ error: cErr.message }, { status: 500 })
      }

      const calIds = (cals ?? []).map((c) => c.id)
      const casMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (calIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, management_verification_required, resolved, verified_at`)
          .eq('source_table', 'haccp_calibration_log')
          .in('source_id', calIds)
        for (const ca of caData ?? []) casMap[ca.source_id] = ca
      }

      type CalRow = typeof cals extends (infer T)[] | null ? T : never
      const rows = (cals ?? []).map((c: CalRow) => ({
        ...c,
        submitted_by_name: (c.users as unknown as { name: string } | null)?.name ?? '—',
        ca: casMap[c.id] ?? null,
      }))

      const manual    = rows.filter((r) => r.calibration_mode === 'manual')
      const certified = rows.filter((r) => r.calibration_mode === 'certified_probe')

      const summary = {
        total:      rows.length,
        manual:     manual.length,
        certified:  certified.length,
        pass:       manual.filter((r) => r.ice_water_pass && r.boiling_water_pass).length,
        fail:       manual.filter((r) => r.ice_water_pass === false || r.boiling_water_pass === false).length,
        ca_count:   rows.filter((r) => r.ca !== null).length,
        unresolved: rows.filter((r) => r.ca !== null && !(r.ca as {resolved:boolean}).resolved).length,
      }

      // Heatmap — monthly: green/amber on days logged, grey otherwise (not red)
      const calMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      for (const r of rows) {
        if (!calMap[r.date]) calMap[r.date] = { has_records: false, has_deviations: false }
        calMap[r.date].has_records = true
        const isDev = r.calibration_mode === 'manual' &&
          (r.ice_water_pass === false || r.boiling_water_pass === false)
        if (isDev || (r.ca && !(r.ca as {resolved:boolean}).resolved)) {
          calMap[r.date].has_deviations = true
        }
      }

      return NextResponse.json({ rows, summary, heatmap: { calibration: calMap } })
    }


    // ── Mince & Prep ──────────────────────────────────────────────────────────
    if (section === 'mince') {
      const { data: runs, error: mErr } = await supabase
        .from('haccp_mince_log')
        .select(`
          id, date, time_of_production, batch_code, product_species, output_mode,
          kill_date, days_from_kill, kill_date_within_limit,
          input_temp_c, output_temp_c, input_temp_pass, output_temp_pass,
          corrective_action, source_batch_numbers,
          users!submitted_by ( name )
        `)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
        .order('time_of_production', { ascending: false })

      if (mErr) {
        console.error('[audit/mince]', mErr.message)
        return NextResponse.json({ error: mErr.message }, { status: 500 })
      }

      const runIds = (runs ?? []).map((r) => r.id)
      const casMap: Record<string, {
        id: string; ccp_ref: string; deviation_description: string
        action_taken: string; product_disposition: string | null
        management_verification_required: boolean
        resolved: boolean; verified_at: string | null
      }> = {}

      if (runIds.length > 0) {
        const { data: caData } = await supabase
          .from('haccp_corrective_actions')
          .select(`id, source_id, ccp_ref, deviation_description, action_taken,
            product_disposition, management_verification_required, resolved, verified_at`)
          .eq('source_table', 'haccp_mince_log')
          .in('source_id', runIds)
        for (const ca of caData ?? []) casMap[ca.source_id] = ca
      }

      type MRow = typeof runs extends (infer T)[] | null ? T : never
      const rows = (runs ?? []).map((r: MRow) => ({
        ...r,
        submitted_by_name: (r.users as unknown as { name: string } | null)?.name ?? '—',
        ca: casMap[r.id] ?? null,
      }))

      const summary = {
        total:        rows.length,
        all_pass:     rows.filter(r => r.input_temp_pass && r.output_temp_pass && r.kill_date_within_limit).length,
        temp_fails:   rows.filter(r => !r.input_temp_pass || !r.output_temp_pass).length,
        kill_fails:   rows.filter(r => !r.kill_date_within_limit).length,
        with_ca_note: rows.filter(r => !!(r.corrective_action as string | null)?.trim()).length,
        linked_cas:   rows.filter(r => r.ca !== null).length,
        unresolved:   rows.filter(r => r.ca !== null && !(r.ca as {resolved:boolean}).resolved).length,
      }

      // Heatmap — variable: green/amber on days logged, grey otherwise
      const minceMap: Record<string, { has_records: boolean; has_deviations: boolean }> = {}
      for (const r of rows) {
        if (!minceMap[r.date]) minceMap[r.date] = { has_records: false, has_deviations: false }
        minceMap[r.date].has_records = true
        const isDev = !r.input_temp_pass || !r.output_temp_pass || !r.kill_date_within_limit ||
          !!(r.corrective_action as string | null) || (r.ca && !(r.ca as {resolved:boolean}).resolved)
        if (isDev) minceMap[r.date].has_deviations = true
      }

      return NextResponse.json({ rows, summary, heatmap: { mince: minceMap } })
    }


    // ── Product Returns ───────────────────────────────────────────────────────
    if (section === 'returns') {
      const { data: returns, error: rErr } = await supabase
        .from('haccp_returns')
        .select(`
          id, date, time_of_return, customer, product, return_code,
          return_code_notes, temperature_c, disposition, never_resell_reason,
          corrective_action, source_batch_number, verified_by,
          users!submitted_by ( name )
        `)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

      type RetRow = typeof returns extends (infer T)[] | null ? T : never
      const rows = (returns ?? []).map((r: RetRow) => ({
        ...r,
        submitted_by_name: (r.users as unknown as { name: string } | null)?.name ?? '—',
      }))

      const SAFETY_CODES = ['RC01','RC02','RC04','RC05']
      const summary = {
        total:    rows.length,
        safety:   rows.filter(r => SAFETY_CODES.includes(r.return_code)).length,
        non_safety: rows.filter(r => !SAFETY_CODES.includes(r.return_code)).length,
      }

      return NextResponse.json({ rows, summary })
    }

    // ── Corrective Actions ────────────────────────────────────────────────────
    if (section === 'ccas') {
      const { data: cas, error: cErr } = await supabase
        .from('haccp_corrective_actions')
        .select(`
          id, submitted_at, source_table, source_id, ccp_ref,
          deviation_description, action_taken, product_disposition,
          recurrence_prevention, management_verification_required,
          resolved, verified_at,
          actioned_by_user:users!actioned_by ( name ),
          verified_by_user:users!verified_by ( name )
        `)
        .gte('submitted_at', from + 'T00:00:00')
        .lte('submitted_at', to   + 'T23:59:59')
        .order('submitted_at', { ascending: false })
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

      type CARow = typeof cas extends (infer T)[] | null ? T : never
      const rows = (cas ?? []).map((c: CARow) => ({
        ...c,
        actioned_by_name: (c.actioned_by_user as unknown as { name: string } | null)?.name ?? '—',
        verified_by_name: (c.verified_by_user as unknown as { name: string } | null)?.name ?? null,
        date: (c.submitted_at as string).slice(0, 10),
      }))

      const summary = {
        total:      rows.length,
        resolved:   rows.filter(r => r.resolved).length,
        unresolved: rows.filter(r => !r.resolved).length,
        mgmt_req:   rows.filter(r => !r.resolved && r.management_verification_required).length,
      }

      return NextResponse.json({ rows, summary })
    }

    // ── Reviews ───────────────────────────────────────────────────────────────
    if (section === 'reviews') {
      const [{ data: weekly }, { data: monthly }] = await Promise.all([
        supabase.from('haccp_weekly_review')
          .select('id, week_ending, date, assessments, users!submitted_by ( name )')
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false }),
        supabase.from('haccp_monthly_review')
          .select('id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, users!submitted_by ( name )')
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false }),
      ])

      type WRow = typeof weekly extends (infer T)[] | null ? T : never
      type MRow = typeof monthly extends (infer T)[] | null ? T : never

      const weeklyRows = (weekly ?? []).map((w: WRow) => {
        const assessments = (w.assessments as { state: string }[] | null) ?? []
        const problems = assessments.filter(a => a.state === 'problem' || a.state === 'no').length
        return {
          ...w,
          submitted_by_name: (w.users as unknown as { name: string } | null)?.name ?? '—',
          problem_count: problems,
          total_assessments: assessments.length,
        }
      })

      const monthlyRows = (monthly ?? []).map((m: MRow) => {
        const equip = m.equipment_checks as Record<string, boolean> | null ?? {}
        const facil = m.facilities_checks as Record<string, boolean> | null ?? {}
        const sys   = m.haccp_system_review as { result: string; invertFail: boolean }[] | null ?? []
        const equipFail = Object.values(equip).filter(v => !v).length
        const facilFail = Object.values(facil).filter(v => !v).length
        const sysFail   = sys.filter(i => i.invertFail ? i.result === 'YES' : i.result !== 'YES').length
        return {
          ...m,
          submitted_by_name: (m.users as unknown as { name: string } | null)?.name ?? '—',
          equip_fail: equipFail, facil_fail: facilFail, sys_fail: sysFail,
        }
      })

      return NextResponse.json({ weeklyRows, monthlyRows })
    }

    // ── Health & People ───────────────────────────────────────────────────────
    if (section === 'health') {
      const { data: records, error: hErr } = await supabase
        .from('haccp_health_records')
        .select(`
          id, date, record_type, staff_name, visitor_name, visitor_company,
          visitor_reason, fit_for_work, exclusion_reason, illness_type,
          absence_from, absence_to, symptom_free_48h,
          medical_certificate_provided, manager_signed_name,
          users!submitted_by ( name )
        `)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })

      type HRow = typeof records extends (infer T)[] | null ? T : never
      const rows = (records ?? []).map((h: HRow) => ({
        ...h,
        submitted_by_name: (h.users as unknown as { name: string } | null)?.name ?? '—',
      }))

      const summary = {
        total:         rows.length,
        declarations:  rows.filter(r => r.record_type === 'new_staff_declaration').length,
        return_to_work:rows.filter(r => r.record_type === 'return_to_work').length,
        visitors:      rows.filter(r => r.record_type === 'visitor').length,
        excluded:      rows.filter(r => !r.fit_for_work).length,
      }

      return NextResponse.json({ rows, summary })
    }

    // ── Training ──────────────────────────────────────────────────────────────
    if (section === 'training') {
      const today = todayUK()
      const [{ data: staff }, { data: allergen }] = await Promise.all([
        supabase.from('haccp_staff_training')
          .select('id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at')
          .gte('completion_date', from).lte('completion_date', to)
          .order('completion_date', { ascending: false }),
        supabase.from('haccp_allergen_training')
          .select('id, staff_name, job_role, training_completed, certification_date, refresh_date, supervisor_name, confirmation_items, submitted_at')
          .gte('certification_date', from).lte('certification_date', to)
          .order('certification_date', { ascending: false }),
      ])

      function refreshStatus(date: string): string {
        const diff = (new Date(date).getTime() - new Date(today).getTime()) / 86400000
        if (diff < 0)   return 'overdue'
        if (diff <= 30) return 'due_soon'
        return 'current'
      }

      const staffRows  = (staff   ?? []).map(r => ({ ...r, status: refreshStatus(r.refresh_date) }))
      const allergenRows = (allergen ?? []).map(r => ({ ...r, status: refreshStatus(r.refresh_date) }))

      const summary = {
        staff_total:     staffRows.length,
        allergen_total:  allergenRows.length,
        overdue:  [...staffRows, ...allergenRows].filter(r => r.status === 'overdue').length,
        due_soon: [...staffRows, ...allergenRows].filter(r => r.status === 'due_soon').length,
      }

      return NextResponse.json({ staffRows, allergenRows, summary })
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 })

  } catch (err) {
    console.error('[GET /api/haccp/audit]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
