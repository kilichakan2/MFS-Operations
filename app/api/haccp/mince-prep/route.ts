/**
 * app/api/haccp/mince-prep/route.ts
 *
 * GET  — today's mince log + meatprep log + time sep log + today's deliveries
 * POST — submit mince | meatprep | time_separation record
 *
 * Source: MMP-001 V1.0 · MMP-MF-001 V1.0 · MMP-HA-001 V1.0 · CA-001 Table 4
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function nowTimeUK(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// Kill date pass/fail (MMP-001 §6.1)
function killDatePass(species: string, daysFromKill: number): boolean {
  switch (species) {
    case 'poultry':   return daysFromKill <= 3
    case 'vac_beef':  return daysFromKill <= 15
    default:          return daysFromKill <= 6   // beef / lamb
  }
}

// Input temp pass/fail (CCP-M1/MP1)
function inputTempPass(temp: number, species: string): boolean {
  if (species === 'poultry') return temp <= 4
  if (species === 'offal')   return temp <= 3
  return temp <= 7  // red meat
}

// Output temp pass/fail (CCP-M1/MP1)
function outputTempPass(temp: number, form: 'mince' | 'meatprep', mode: string): boolean {
  if (mode === 'frozen') return temp <= -18
  return form === 'mince' ? temp <= 2 : temp <= 4
}

// Count today's runs to assign sequential batch number
async function nextRunNumber(table: 'haccp_mince_log' | 'haccp_meatprep_log', date: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('date', date)
  return (count ?? 0) + 1
}

// Build batch code from source deliveries or fallback
function buildBatchCode(
  form: 'mince' | 'meatprep',
  date: string,
  species: string,
  runNum: number,
  sourceBatches: string[]
): string {
  const d   = new Date(date + 'T00:00:00')
  const dd  = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = form === 'mince' ? 'MINCE' : 'PREP'
  const sp     = species.toUpperCase().replace('VAC_BEEF', 'VACBEEF')
  // If we have source delivery batches, encode the first one's key parts
  if (sourceBatches.length > 0) {
    return `${prefix}-${dd}${mm}-${sp}-${runNum}`
  }
  return `${prefix}-${dd}${mm}-${sp}-${runNum}`
}

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today = todayUK()

    const [mince, meatprep, timesep, deliveries] = await Promise.all([
      supabase
        .from('haccp_mince_log')
        .select(`id, date, time_of_production, batch_code, product_species, kill_date,
                 days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c,
                 input_temp_pass, output_temp_pass, output_mode,
                 source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
        .eq('date', today)
        .order('submitted_at', { ascending: false }),

      supabase
        .from('haccp_meatprep_log')
        .select(`id, date, time_of_production, batch_code, product_name, product_species,
                 kill_date, days_from_kill, input_temp_c, output_temp_c,
                 input_temp_pass, output_temp_pass, output_mode,
                 allergens_present, label_check_completed,
                 source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
        .eq('date', today)
        .order('submitted_at', { ascending: false }),

      supabase
        .from('haccp_time_separation_log')
        .select(`id, date, time_of_entry, plain_products_end_time, clean_completed_time,
                 allergen_products_start_time, clean_verified_by, allergens_in_production,
                 corrective_action, submitted_at, users!inner(name)`)
        .eq('date', today)
        .order('submitted_at', { ascending: false }),

      // Today's deliveries — for batch picker
      supabase
        .from('haccp_deliveries')
        .select(`id, supplier, product, product_category, batch_number, slaughter_site,
                 born_in, delivery_number, date,
                 temperature_c, temp_status`)
        .eq('date', today)
        .not('batch_number', 'is', null)
        .order('delivery_number', { ascending: true }),
    ])

    if (mince.error)     return NextResponse.json({ error: mince.error.message },     { status: 500 })
    if (meatprep.error)  return NextResponse.json({ error: meatprep.error.message },  { status: 500 })
    if (timesep.error)   return NextResponse.json({ error: timesep.error.message },   { status: 500 })
    if (deliveries.error)return NextResponse.json({ error: deliveries.error.message },{ status: 500 })

    return NextResponse.json({
      date:       today,
      mince:      mince.data      ?? [],
      meatprep:   meatprep.data   ?? [],
      timesep:    timesep.data    ?? [],
      deliveries: deliveries.data ?? [],
    })

  } catch (err) {
    console.error('[GET /api/haccp/mince-prep] Unhandled:', err)
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
    const { form } = body

    const today   = todayUK()
    const nowTime = nowTimeUK()

    // ── Mince log ──────────────────────────────────────────────────────────────
    if (form === 'mince') {
      const {
        product_species, kill_date, input_temp_c, output_temp_c,
        output_mode, source_batch_numbers, source_delivery_ids, corrective_action,
      } = body

      if (!product_species)  return NextResponse.json({ error: 'Select a species' }, { status: 400 })
      if (!kill_date)        return NextResponse.json({ error: 'Kill date is required for mince' }, { status: 400 })
      if (input_temp_c  == null) return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      if (output_temp_c == null) return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })

      const killDateObj   = new Date(kill_date + 'T00:00:00')
      const todayObj      = new Date(today + 'T00:00:00')
      const daysFromKill  = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)
      const killPass      = killDatePass(product_species, daysFromKill)
      const inPass        = inputTempPass(input_temp_c, product_species)
      const outPass       = outputTempPass(output_temp_c, 'mince', output_mode ?? 'chilled')
      const anyDeviation  = !killPass || !inPass || !outPass

      if (anyDeviation && !corrective_action?.trim()) {
        return NextResponse.json({ error: 'Corrective action required for any deviation' }, { status: 400 })
      }

      const runNum    = await nextRunNumber('haccp_mince_log', today)
      const batchCode = buildBatchCode('mince', today, product_species, runNum, source_batch_numbers ?? [])

      const { error } = await supabase.from('haccp_mince_log').insert({
        submitted_by:          userId,
        date:                  today,
        time_of_production:    nowTime,
        batch_code:            batchCode,
        product_species,
        kill_date,
        days_from_kill:        daysFromKill,
        kill_date_within_limit:killPass,
        input_temp_c,
        output_temp_c,
        input_temp_pass:       inPass,
        output_temp_pass:      outPass,
        output_mode:           output_mode ?? 'chilled',
        source_batch_numbers:  source_batch_numbers ?? [],
        source_delivery_ids:   source_delivery_ids  ?? [],
        corrective_action:     corrective_action?.trim() || null,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, batch_code: batchCode, days_from_kill: daysFromKill, kill_pass: killPass })
    }

    // ── Meat prep log ──────────────────────────────────────────────────────────
    if (form === 'meatprep') {
      const {
        product_name, product_species, kill_date,
        input_temp_c, output_temp_c, output_mode,
        allergens_present, label_check_completed,
        source_batch_numbers, source_delivery_ids, corrective_action,
      } = body

      if (!product_name?.trim())  return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
      if (input_temp_c  == null)  return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      if (output_temp_c == null)  return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })

      // Kill date is optional for meatprep but recommended
      let daysFromKill: number | null = null
      if (kill_date) {
        const killDateObj = new Date(kill_date + 'T00:00:00')
        const todayObj    = new Date(today + 'T00:00:00')
        daysFromKill      = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)
      }

      const speciesForTemp = product_species ?? 'beef'
      const inPass  = inputTempPass(input_temp_c, speciesForTemp)
      const outPass = outputTempPass(output_temp_c, 'meatprep', output_mode ?? 'chilled')
      const anyDeviation = !inPass || !outPass || (allergens_present?.length > 0 && !label_check_completed)

      if (anyDeviation && !corrective_action?.trim()) {
        return NextResponse.json({ error: 'Corrective action required for any deviation' }, { status: 400 })
      }

      const runNum    = await nextRunNumber('haccp_meatprep_log', today)
      const batchCode = buildBatchCode('meatprep', today, speciesForTemp, runNum, source_batch_numbers ?? [])

      const { error } = await supabase.from('haccp_meatprep_log').insert({
        submitted_by:          userId,
        date:                  today,
        time_of_production:    nowTime,
        batch_code:            batchCode,
        product_name:          product_name.trim(),
        product_species:       product_species ?? null,
        kill_date:             kill_date ?? null,
        days_from_kill:        daysFromKill,
        input_temp_c,
        output_temp_c,
        input_temp_pass:       inPass,
        output_temp_pass:      outPass,
        output_mode:           output_mode ?? 'chilled',
        allergens_present:     allergens_present ?? [],
        label_check_completed: !!label_check_completed,
        source_batch_numbers:  source_batch_numbers ?? [],
        source_delivery_ids:   source_delivery_ids  ?? [],
        corrective_action:     corrective_action?.trim() || null,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, batch_code: batchCode })
    }

    // ── Time separation log ────────────────────────────────────────────────────
    if (form === 'timesep') {
      const {
        plain_products_end_time, clean_completed_time,
        allergen_products_start_time, clean_verified_by,
        allergens_in_production, corrective_action,
      } = body

      if (!clean_completed_time)  return NextResponse.json({ error: 'Clean completed time is required' }, { status: 400 })
      if (!clean_verified_by?.trim()) return NextResponse.json({ error: 'Clean verified by name is required' }, { status: 400 })
      if (!allergens_in_production?.trim()) return NextResponse.json({ error: 'Allergens in production is required' }, { status: 400 })

      const { error } = await supabase.from('haccp_time_separation_log').insert({
        submitted_by:                userId,
        date:                        today,
        time_of_entry:               nowTime,
        plain_products_end_time:     plain_products_end_time ?? null,
        clean_completed_time,
        allergen_products_start_time:allergen_products_start_time ?? null,
        clean_verified_by:           clean_verified_by.trim(),
        allergens_in_production:     allergens_in_production.trim(),
        corrective_action:           corrective_action?.trim() || null,
      })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid form type' }, { status: 400 })

  } catch (err) {
    console.error('[POST /api/haccp/mince-prep] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
