/**
 * app/api/haccp/audit/export/route.ts
 *
 * GET /api/haccp/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Generates a single XLSX file with one sheet per built audit section.
 * Returns as a binary download: MFS_HACCP_Audit_FROM_to_TO.xlsx
 *
 * Admin only.
 * Sections are added here as each audit section is built.
 * Current: Sheet 1 — Deliveries
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import * as XLSX                     from 'xlsx'

const supabase = supabaseService

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

// ── Deliveries sheet ──────────────────────────────────────────────────────────

async function fetchDeliveriesSheet(from: string, to: string) {
  const { data: deliveries } = await supabase
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

  const deliveryIds = (deliveries ?? []).map((d) => d.id)
  const casMap: Record<string, {
    deviation_description: string; action_taken: string
    product_disposition: string | null; resolved: boolean
  }> = {}

  if (deliveryIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, product_disposition, resolved')
      .eq('source_table', 'haccp_deliveries')
      .in('source_id', deliveryIds)
    for (const ca of caData ?? []) {
      casMap[ca.source_id] = ca
    }
  }

  const headers = [
    'Date', 'Time', 'Supplier', 'Product', 'Species', 'Category',
    'Temp °C', 'Status', 'Contamination', 'Batch No', 'Delivery No',
    'Born in', 'Reared in', 'Slaughter site', 'Cut site', 'Notes',
    'Submitted by', 'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
  ]

  const rows = (deliveries ?? []).map((d) => {
    const ca = casMap[d.id] ?? null
    const user = (d.users as unknown as { name: string } | null)?.name ?? '—'
    return [
      d.date,
      d.time_of_delivery ?? '',
      d.supplier,
      d.product,
      d.species ?? '',
      d.product_category,
      d.temperature_c,
      d.temp_status,
      d.covered_contaminated,
      d.batch_number ?? '',
      d.delivery_number ?? '',
      d.born_in ?? '',
      d.reared_in ?? '',
      d.slaughter_site ?? '',
      d.cut_site ?? '',
      d.notes ?? '',
      user,
      ca ? 'Yes' : 'No',
      ca ? (ca.resolved ? 'Yes' : 'No') : '',
      ca?.deviation_description ?? '',
      ca?.action_taken ?? '',
      ca?.product_disposition ?? '',
    ]
  })

  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 8  }, { wch: 18 }, { wch: 20 }, { wch: 12 },
    { wch: 12 }, { wch: 8  }, { wch: 10 }, { wch: 18 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
    { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
    { wch: 30 }, { wch: 20 },
  ]

  return ws
}


async function fetchColdStorageSheet(from: string, to: string) {
  const { data: temps } = await supabase
    .from('haccp_cold_storage_temps')
    .select(`
      id, date, session, temperature_c, temp_status, comments, submitted_at,
      users!submitted_by ( name ),
      haccp_cold_storage_units!unit_id ( name, unit_type, target_temp_c, max_temp_c )
    `)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })

  const tempIds = (temps ?? []).map((t) => t.id)
  const casMap: Record<string, {
    deviation_description: string; action_taken: string
    product_disposition: string | null; resolved: boolean
  }> = {}

  if (tempIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, product_disposition, resolved')
      .eq('source_table', 'haccp_cold_storage_temps')
      .in('source_id', tempIds)
    for (const ca of caData ?? []) casMap[ca.source_id] = ca
  }

  const headers = [
    'Date', 'Session', 'Unit', 'Unit Type', 'Target Temp °C', 'Max Temp °C',
    'Temp °C', 'Status', 'Comments', 'Submitted by',
    'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
  ]

  type TempRow = typeof temps extends (infer T)[] | null ? T : never
  const rows = (temps ?? []).map((t: TempRow) => {
    const ca   = casMap[t.id] ?? null
    const user = (t.users as unknown as { name: string } | null)?.name ?? '—'
    const unit = t.haccp_cold_storage_units as unknown as {
      name: string; unit_type: string; target_temp_c: number; max_temp_c: number
    } | null
    return [
      t.date, t.session, unit?.name ?? '—', unit?.unit_type ?? '—',
      unit?.target_temp_c ?? '', unit?.max_temp_c ?? '',
      t.temperature_c, t.temp_status, t.comments ?? '', user,
      ca ? 'Yes' : 'No',
      ca ? (ca.resolved ? 'Yes' : 'No') : '',
      ca?.deviation_description ?? '',
      ca?.action_taken ?? '',
      ca?.product_disposition ?? '',
    ]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 14 },
    { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 20 },
  ]
  return ws
}


async function fetchProcessRoomSheets(from: string, to: string): Promise<{ temps: XLSX.WorkSheet; diary: XLSX.WorkSheet }> {
  const [{ data: temps }, { data: diary }] = await Promise.all([
    supabase.from('haccp_processing_temps')
      .select('id, date, session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, users!submitted_by(name)')
      .gte('date', from).lte('date', to).order('date', { ascending: false }),
    supabase.from('haccp_daily_diary')
      .select('id, date, phase, check_results, issues, what_did_you_do, users!submitted_by(name)')
      .gte('date', from).lte('date', to).order('date', { ascending: false }),
  ])

  // CAs for temps
  const tempIds = (temps ?? []).map((t) => t.id)
  const tempCasMap: Record<string, { deviation_description: string; action_taken: string; product_disposition: string | null; resolved: boolean }> = {}
  if (tempIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, product_disposition, resolved')
      .eq('source_table', 'haccp_processing_temps').in('source_id', tempIds)
    for (const ca of caData ?? []) tempCasMap[ca.source_id] = ca
  }

  type TRow = typeof temps extends (infer T)[] | null ? T : never
  type DRow = typeof diary extends (infer T)[] | null ? T : never

  const tempHeaders = ['Date','Session','Product Temp °C','Room Temp °C','Product Pass','Room Pass','Overall','CA logged','CA resolved','CA deviation','CA action taken','CA disposition','Submitted by']
  const tempRows = (temps ?? []).map((t: TRow) => {
    const ca = tempCasMap[t.id] ?? null
    return [t.date, t.session, t.product_temp_c, t.room_temp_c, t.product_within_limit ? 'Yes' : 'No', t.room_within_limit ? 'Yes' : 'No', t.within_limits ? 'Pass' : 'Fail', ca ? 'Yes' : 'No', ca ? (ca.resolved ? 'Yes' : 'No') : '', ca?.deviation_description ?? '', ca?.action_taken ?? '', ca?.product_disposition ?? '', (t.users as unknown as {name:string}|null)?.name ?? '—']
  })
  const tempsWs = XLSX.utils.aoa_to_sheet([tempHeaders, ...tempRows])
  tempsWs['!cols'] = [{wch:12},{wch:8},{wch:14},{wch:12},{wch:14},{wch:12},{wch:10},{wch:10},{wch:12},{wch:30},{wch:30},{wch:20},{wch:14}]

  const diaryHeaders = ['Date','Phase','Checks Passed','Total Checks','Issues','Action Taken','Submitted by']
  const diaryRows = (diary ?? []).map((d: DRow) => {
    const checks = d.check_results as Record<string, boolean> | null ?? {}
    const vals = Object.values(checks)
    const passed = vals.filter(Boolean).length
    return [d.date, d.phase, passed, vals.length, d.issues ? 'Yes' : 'No', d.what_did_you_do ?? '', (d.users as unknown as {name:string}|null)?.name ?? '—']
  })
  const diaryWs = XLSX.utils.aoa_to_sheet([diaryHeaders, ...diaryRows])
  diaryWs['!cols'] = [{wch:12},{wch:14},{wch:14},{wch:14},{wch:8},{wch:30},{wch:14}]

  return { temps: tempsWs, diary: diaryWs }
}


async function fetchCleaningSheet(from: string, to: string) {
  const { data: cleans } = await supabase
    .from('haccp_cleaning_log')
    .select('id, date, time_of_clean, what_was_cleaned, issues, what_did_you_do, sanitiser_temp_c, verified_by, users!submitted_by(name)')
    .gte('date', from).lte('date', to).order('date', { ascending: false })

  const cleanIds = (cleans ?? []).map((c) => c.id)
  const casMap: Record<string, { deviation_description: string; action_taken: string; resolved: boolean }> = {}
  if (cleanIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, resolved')
      .eq('source_table', 'haccp_cleaning_log').in('source_id', cleanIds)
    for (const ca of caData ?? []) casMap[ca.source_id] = ca
  }

  type CRow = typeof cleans extends (infer T)[] | null ? T : never
  const headers = ['Date','Time','What was cleaned','Sanitiser °C','Sanitiser pass','Issues','Action taken','Verified by','CA logged','CA resolved','CA deviation','CA action taken']
  const rows = (cleans ?? []).map((c: CRow) => {
    const ca = casMap[c.id] ?? null
    const temp = c.sanitiser_temp_c as unknown as number | null
    return [
      c.date, (c.time_of_clean as string)?.slice(0,5) ?? '',
      c.what_was_cleaned, temp ?? '', temp !== null ? (temp >= 82 ? 'Yes' : 'No') : '',
      c.issues ? 'Yes' : 'No', c.what_did_you_do ?? '',
      c.verified_by ?? '',
      ca ? 'Yes' : 'No', ca ? (ca.resolved ? 'Yes' : 'No') : '',
      ca?.deviation_description ?? '', ca?.action_taken ?? '',
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:8},{wch:40},{wch:12},{wch:14},{wch:8},{wch:30},{wch:12},{wch:10},{wch:12},{wch:30},{wch:30}]
  return ws
}


async function fetchCalibrationSheet(from: string, to: string) {
  const { data: cals } = await supabase
    .from('haccp_calibration_log')
    .select('id, date, time_of_check, thermometer_id, calibration_mode, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass, action_taken, cert_reference, purchase_date, verified_by, users!submitted_by(name)')
    .gte('date', from).lte('date', to).order('date', { ascending: false })

  const calIds = (cals ?? []).map((c) => c.id)
  const casMap: Record<string, { deviation_description: string; action_taken: string; resolved: boolean }> = {}
  if (calIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, resolved')
      .eq('source_table', 'haccp_calibration_log').in('source_id', calIds)
    for (const ca of caData ?? []) casMap[ca.source_id] = ca
  }

  type CalRow = typeof cals extends (infer T)[] | null ? T : never
  const headers = ['Date','Time','Probe ID','Mode','Ice water °C','Ice pass','Boiling water °C','Boiling pass','Overall','Cert reference','Purchase date','Action taken','Verified by','CA logged','CA resolved','CA deviation','CA action taken']
  const rows = (cals ?? []).map((c: CalRow) => {
    const ca = casMap[c.id] ?? null
    const isCert = c.calibration_mode === 'certified_probe'
    const overall = isCert ? 'Certified' : (c.ice_water_pass && c.boiling_water_pass ? 'Pass' : 'Fail')
    return [
      c.date, (c.time_of_check as string)?.slice(0,5) ?? '',
      c.thermometer_id, c.calibration_mode,
      c.ice_water_result_c ?? '', c.ice_water_pass !== null ? (c.ice_water_pass ? 'Yes' : 'No') : '',
      c.boiling_water_result_c ?? '', c.boiling_water_pass !== null ? (c.boiling_water_pass ? 'Yes' : 'No') : '',
      overall, c.cert_reference ?? '', c.purchase_date ?? '',
      c.action_taken ?? '', c.verified_by ?? '',
      ca ? 'Yes' : 'No', ca ? (ca.resolved ? 'Yes' : 'No') : '',
      ca?.deviation_description ?? '', ca?.action_taken ?? '',
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:8},{wch:16},{wch:12},{wch:14},{wch:10},{wch:16},{wch:12},{wch:10},{wch:20},{wch:14},{wch:30},{wch:14},{wch:10},{wch:12},{wch:30},{wch:30}]
  return ws
}


async function fetchMinceSheet(from: string, to: string) {
  const { data: runs } = await supabase
    .from('haccp_mince_log')
    .select('id, date, time_of_production, batch_code, product_species, output_mode, kill_date, days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c, input_temp_pass, output_temp_pass, corrective_action, source_batch_numbers, users!submitted_by(name)')
    .gte('date', from).lte('date', to).order('date', { ascending: false })

  const runIds = (runs ?? []).map((r) => r.id)
  const casMap: Record<string, { deviation_description: string; action_taken: string; resolved: boolean }> = {}
  if (runIds.length > 0) {
    const { data: caData } = await supabase
      .from('haccp_corrective_actions')
      .select('source_id, deviation_description, action_taken, resolved')
      .eq('source_table', 'haccp_mince_log').in('source_id', runIds)
    for (const ca of caData ?? []) casMap[ca.source_id] = ca
  }

  type MRow = typeof runs extends (infer T)[] | null ? T : never
  const headers = ['Date','Time','Species','Batch code','Mode','Input temp °C','Input pass','Output temp °C','Output pass','Kill date','Days from kill','Kill limit pass','CA note','Source batches','Linked CA','CA resolved']
  const rows = (runs ?? []).map((r: MRow) => {
    const ca = casMap[r.id] ?? null
    const batches = (r.source_batch_numbers as string[] | null) ?? []
    return [
      r.date, (r.time_of_production as string)?.slice(0,5) ?? '',
      r.product_species, r.batch_code, r.output_mode,
      r.input_temp_c, r.input_temp_pass ? 'Yes' : 'No',
      r.output_temp_c, r.output_temp_pass ? 'Yes' : 'No',
      r.kill_date ?? '', r.days_from_kill ?? '', r.kill_date_within_limit ? 'Yes' : 'No',
      (r.corrective_action as string | null) ?? '',
      batches.join(', '),
      ca ? 'Yes' : 'No', ca ? (ca.resolved ? 'Yes' : 'No') : '',
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:8},{wch:8},{wch:20},{wch:10},{wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:30},{wch:20},{wch:10},{wch:12}]
  return ws
}


async function fetchReturnsSheet(from: string, to: string) {
  const { data: returns } = await supabase
    .from('haccp_returns')
    .select('date, time_of_return, customer, product, return_code, temperature_c, disposition, corrective_action, source_batch_number, verified_by, users!submitted_by(name)')
    .gte('date', from).lte('date', to).order('date', { ascending: false })
  const SAFETY = ['RC01','RC02','RC04','RC05']
  const CODE_LABELS: Record<string,string> = { RC01:'Temperature abuse', RC02:'Quality/condition', RC03:'Incorrect product', RC04:'Contamination', RC05:'Labelling/date', RC06:'Quantity', RC07:'Packaging damage', RC08:'Other' }
  type RRow = typeof returns extends (infer T)[] | null ? T : never
  const headers = ['Date','Time','Customer','Product','Return code','Code description','Safety critical','Temp °C','Disposition','Batch number','Corrective action','Verified by']
  const rows = (returns ?? []).map((r: RRow) => [
    r.date, (r.time_of_return as string)?.slice(0,5) ?? '', r.customer, r.product,
    r.return_code, CODE_LABELS[r.return_code] ?? r.return_code, SAFETY.includes(r.return_code) ? 'Yes' : 'No',
    r.temperature_c ?? '', r.disposition ?? '', r.source_batch_number ?? '',
    r.corrective_action ?? '', r.verified_by ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:8},{wch:20},{wch:20},{wch:10},{wch:22},{wch:14},{wch:10},{wch:16},{wch:16},{wch:30},{wch:14}]
  return ws
}

async function fetchCAsSheet(from: string, to: string) {
  const { data: cas } = await supabase
    .from('haccp_corrective_actions')
    .select('submitted_at, source_table, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, management_verification_required, resolved, verified_at, actioned_by_user:users!actioned_by(name)')
    .gte('submitted_at', from + 'T00:00:00').lte('submitted_at', to + 'T23:59:59')
    .order('submitted_at', { ascending: false })
  const TABLE_LABELS: Record<string,string> = { haccp_deliveries:'Deliveries', haccp_cold_storage_temps:'Cold Storage', haccp_processing_temps:'Process Room', haccp_daily_diary:'Daily Diary', haccp_cleaning_log:'Cleaning', haccp_calibration_log:'Calibration', haccp_mince_log:'Mince & Prep', haccp_returns:'Product Returns', haccp_weekly_review:'Weekly Review', haccp_monthly_review:'Monthly Review' }
  type CARow = typeof cas extends (infer T)[] | null ? T : never
  const headers = ['Date','CCP ref','Source section','Deviation','Action taken','Product disposition','Recurrence prevention','Mgmt verification required','Resolved','Verified at','Actioned by']
  const rows = (cas ?? []).map((c: CARow) => [
    (c.submitted_at as string).slice(0,10), c.ccp_ref, TABLE_LABELS[c.source_table] ?? c.source_table,
    c.deviation_description, c.action_taken, c.product_disposition ?? '', c.recurrence_prevention ?? '',
    c.management_verification_required ? 'Yes' : 'No', c.resolved ? 'Yes' : 'No',
    c.verified_at ? (c.verified_at as string).slice(0,10) : '',
    (c.actioned_by_user as unknown as {name:string}|null)?.name ?? '—',
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:10},{wch:16},{wch:35},{wch:35},{wch:20},{wch:30},{wch:22},{wch:10},{wch:12},{wch:14}]
  return ws
}

async function fetchReviewsSheets(from: string, to: string): Promise<{weekly: XLSX.WorkSheet; monthly: XLSX.WorkSheet}> {
  const [{ data: weekly }, { data: monthly }] = await Promise.all([
    supabase.from('haccp_weekly_review').select('week_ending, assessments, users!submitted_by(name)').gte('date', from).lte('date', to).order('date', { ascending: false }),
    supabase.from('haccp_monthly_review').select('month_year, equipment_checks, facilities_checks, haccp_system_review, further_notes, users!submitted_by(name)').gte('date', from).lte('date', to).order('date', { ascending: false }),
  ])
  type WRow = typeof weekly extends (infer T)[] | null ? T : never
  type MRow = typeof monthly extends (infer T)[] | null ? T : never
  const wHeaders = ['Week ending','Problems found','Total assessments','Issues detail','Submitted by']
  const wRows = (weekly ?? []).map((w: WRow) => {
    const items = (w.assessments as {state:string;label:string}[] | null) ?? []
    const problems = items.filter(a => a.state === 'problem' || a.state === 'no')
    return [w.week_ending, problems.length, items.length, problems.map(p => p.label).join('; '), (w.users as unknown as {name:string}|null)?.name ?? '—']
  })
  const ws1 = XLSX.utils.aoa_to_sheet([wHeaders, ...wRows])
  ws1['!cols'] = [{wch:14},{wch:14},{wch:18},{wch:60},{wch:14}]

  const mHeaders = ['Month','Equipment fails','Facilities fails','System review fails','Further notes','Submitted by']
  const mRows = (monthly ?? []).map((m: MRow) => {
    const equip = m.equipment_checks as Record<string,boolean> | null ?? {}
    const facil = m.facilities_checks as Record<string,boolean> | null ?? {}
    const sys   = m.haccp_system_review as {result:string;invertFail:boolean}[] | null ?? []
    return [
      (m.month_year as string)?.slice(0,7),
      Object.values(equip).filter(v=>!v).length,
      Object.values(facil).filter(v=>!v).length,
      sys.filter(i => i.invertFail ? i.result==='YES' : i.result!=='YES').length,
      m.further_notes ?? '',
      (m.users as unknown as {name:string}|null)?.name ?? '—',
    ]
  })
  const ws2 = XLSX.utils.aoa_to_sheet([mHeaders, ...mRows])
  ws2['!cols'] = [{wch:10},{wch:16},{wch:18},{wch:20},{wch:30},{wch:14}]
  return { weekly: ws1, monthly: ws2 }
}

async function fetchHealthSheet(from: string, to: string) {
  const { data: records } = await supabase
    .from('haccp_health_records')
    .select('date, record_type, staff_name, visitor_name, visitor_company, fit_for_work, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name')
    .gte('date', from).lte('date', to).order('date', { ascending: false })
  const TYPE_LABELS: Record<string,string> = { new_staff_declaration:'Health Declaration', return_to_work:'Return to Work', visitor:'Visitor Log' }
  type HRow = typeof records extends (infer T)[] | null ? T : never
  const headers = ['Date','Type','Name','Company (visitor)','Fit for work','Exclusion reason','Illness type','Absence from','Absence to','Manager signed by']
  const rows = (records ?? []).map((h: HRow) => [
    h.date, TYPE_LABELS[h.record_type] ?? h.record_type,
    (h.staff_name as string|null) ?? (h.visitor_name as string|null) ?? '—',
    (h.visitor_company as string|null) ?? '',
    h.fit_for_work ? 'Yes' : 'No',
    (h.exclusion_reason as string|null) ?? '',
    (h.illness_type as string|null) ?? '',
    (h.absence_from as string|null) ?? '',
    (h.absence_to as string|null) ?? '',
    (h.manager_signed_name as string|null) ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{wch:12},{wch:18},{wch:16},{wch:18},{wch:12},{wch:25},{wch:16},{wch:12},{wch:12},{wch:16}]
  return ws
}

async function fetchTrainingSheets(from: string, to: string): Promise<{staff: XLSX.WorkSheet; allergen: XLSX.WorkSheet}> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [{ data: staff }, { data: allergen }] = await Promise.all([
    supabase.from('haccp_staff_training').select('staff_name,job_role,training_type,document_version,completion_date,refresh_date,supervisor_name').gte('completion_date', from).lte('completion_date', to).order('completion_date', { ascending: false }),
    supabase.from('haccp_allergen_training').select('staff_name,job_role,training_completed,certification_date,refresh_date,supervisor_name,confirmation_items').gte('certification_date', from).lte('certification_date', to).order('certification_date', { ascending: false }),
  ])
  const TYPE_LABELS: Record<string,string> = { butchery_process_room:'Butchery & Process Room', warehouse_operative:'Warehouse Operative', allergen_awareness:'Allergen Awareness' }
  function status(date: string): string {
    const diff = (new Date(date).getTime() - new Date(today).getTime()) / 86400000
    return diff < 0 ? 'Overdue' : diff <= 30 ? 'Due soon' : 'Current'
  }
  type SRow = typeof staff extends (infer T)[] | null ? T : never
  type ARow = typeof allergen extends (infer T)[] | null ? T : never
  const sHeaders = ['Staff name','Job role','Training type','Document version','Completed','Refresh due','Status','Supervisor']
  const sRows = (staff ?? []).map((r: SRow) => [r.staff_name, r.job_role ?? '', TYPE_LABELS[r.training_type] ?? r.training_type, r.document_version ?? '', r.completion_date, r.refresh_date, status(r.refresh_date), r.supervisor_name ?? ''])
  const ws1 = XLSX.utils.aoa_to_sheet([sHeaders, ...sRows])
  ws1['!cols'] = [{wch:16},{wch:18},{wch:22},{wch:14},{wch:12},{wch:12},{wch:10},{wch:14}]

  const aHeaders = ['Staff name','Job role','Completed','Refresh due','Status','Supervisor','Allergens confirmed','Understanding confirmed']
  const aRows = (allergen ?? []).map((r: ARow) => {
    const items = r.confirmation_items as Record<string,boolean> | null ?? {}
    const aCount = Object.entries(items).filter(([k,v]) => k.startsWith('a') && v).length
    const uCount = Object.entries(items).filter(([k,v]) => k.startsWith('u') && v).length
    return [r.staff_name, r.job_role ?? '', r.certification_date, r.refresh_date, status(r.refresh_date), r.supervisor_name ?? '', `${aCount}/14`, `${uCount}/5`]
  })
  const ws2 = XLSX.utils.aoa_to_sheet([aHeaders, ...aRows])
  ws2['!cols'] = [{wch:16},{wch:18},{wch:12},{wch:12},{wch:10},{wch:14},{wch:18},{wch:22}]
  return { staff: ws1, allergen: ws2 }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return new NextResponse('Unauthorised', { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const from = searchParams.get('from') ?? daysAgo(30)
    const to   = searchParams.get('to')   ?? todayUK()

    // Build workbook — one sheet per completed section
    const wb = XLSX.utils.book_new()

    const deliveriesSheet = await fetchDeliveriesSheet(from, to)
    XLSX.utils.book_append_sheet(wb, deliveriesSheet, '01 Deliveries')

    const coldStorageSheet = await fetchColdStorageSheet(from, to)
    XLSX.utils.book_append_sheet(wb, coldStorageSheet, '02 Cold Storage')

    const processRoomSheets = await fetchProcessRoomSheets(from, to)
    XLSX.utils.book_append_sheet(wb, processRoomSheets.temps, '03a Process Room Temps')
    XLSX.utils.book_append_sheet(wb, processRoomSheets.diary, '03b Process Room Diary')

    const cleaningSheet = await fetchCleaningSheet(from, to)
    XLSX.utils.book_append_sheet(wb, cleaningSheet, '04 Cleaning')

    const calibrationSheet = await fetchCalibrationSheet(from, to)
    XLSX.utils.book_append_sheet(wb, calibrationSheet, '05 Calibration')

    const minceSheet = await fetchMinceSheet(from, to)
    XLSX.utils.book_append_sheet(wb, minceSheet, '06 Mince & Prep')

    const returnsSheet = await fetchReturnsSheet(from, to)
    XLSX.utils.book_append_sheet(wb, returnsSheet, '07 Product Returns')

    const casSheet = await fetchCAsSheet(from, to)
    XLSX.utils.book_append_sheet(wb, casSheet, '08 Corrective Actions')

    const reviewSheets = await fetchReviewsSheets(from, to)
    XLSX.utils.book_append_sheet(wb, reviewSheets.weekly,  '09a Weekly Reviews')
    XLSX.utils.book_append_sheet(wb, reviewSheets.monthly, '09b Monthly Reviews')

    const healthSheet = await fetchHealthSheet(from, to)
    XLSX.utils.book_append_sheet(wb, healthSheet, '10 Health & People')

    const trainingSheets = await fetchTrainingSheets(from, to)
    XLSX.utils.book_append_sheet(wb, trainingSheets.staff,    '11a Staff Training')
    XLSX.utils.book_append_sheet(wb, trainingSheets.allergen, '11b Allergen Training')

    // Generate binary buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const filename = `MFS_HACCP_Audit_${from}_to_${to}.xlsx`

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    })

  } catch (err) {
    console.error('[GET /api/haccp/audit/export]', err)
    return new NextResponse('Server error', { status: 500 })
  }
}
