/**
 * app/api/haccp/mince-prep/route.ts
 *
 * GET  — today's mince/meatprep/timesep + recent deliveries (16 days) + today's mince batches
 * POST — submit mince | meatprep | time_separation record
 *
 * Phase M-A changes (2026-04-21):
 * - Species: lamb, beef, imported_vac only (poultry/offal removed)
 * - imported_vac: kill date recorded informational only, no pass/fail limit
 * - Today-only date guard on POST
 * - Kill date exceeded hard-blocks mince submission (400)
 * - Clean 409 on duplicate batch_code
 * - GET returns last 16 days of deliveries + today's mince batches for prep picker
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

function nDaysAgoUK(n: number): string {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() - (n * 24))
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

// ─── Kill date logic (MMP-001 §6.1) ─────────────────────────────────────────

/** imported_vac has no enforced limit — always returns true (informational only) */
function killDatePass(species: string, daysFromKill: number): boolean {
  if (species === 'imported_vac') return true
  return daysFromKill <= 6  // lamb + beef
}

/** Hard block only when limit is genuinely exceeded and species is not imported_vac */
function killDateHardFail(species: string, daysFromKill: number): boolean {
  if (species === 'imported_vac') return false
  return daysFromKill > 6
}

// ─── Temperature logic ───────────────────────────────────────────────────────

function inputTempPass(temp: number): boolean {
  return temp <= 7  // all current species are red meat (lamb/beef/imported_vac)
}

function outputTempPass(temp: number, form: 'mince' | 'meatprep', mode: string): boolean {
  if (mode === 'frozen') return temp <= -18
  return form === 'mince' ? temp <= 2 : temp <= 4
}

// ─── Batch code ──────────────────────────────────────────────────────────────

async function nextRunNumber(
  table: 'haccp_mince_log' | 'haccp_meatprep_log',
  date: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('date', date)
  return (count ?? 0) + 1
}

function buildBatchCode(
  form: 'mince' | 'meatprep',
  date: string,
  species: string,
  runNum: number,
): string {
  const d      = new Date(date + 'T00:00:00')
  const dd     = String(d.getDate()).padStart(2, '0')
  const mm     = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = form === 'mince' ? 'MINCE' : 'PREP'
  const sp     = species.toUpperCase().replace('IMPORTED_VAC', 'IMPVAC')
  return `${prefix}-${dd}${mm}-${sp}-${runNum}`
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const today   = todayUK()
    const since16 = nDaysAgoUK(16)

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

      // Last 16 days of deliveries — covers 6-day fresh and 15-day vac-pac source windows
      supabase
        .from('haccp_deliveries')
        .select(`id, supplier, product, product_category, batch_number, slaughter_site,
                 born_in, delivery_number, date, temperature_c, temp_status`)
        .gte('date', since16)
        .not('batch_number', 'is', null)
        .order('date', { ascending: false })
        .order('delivery_number', { ascending: true }),
    ])

    if (mince.error)      return NextResponse.json({ error: mince.error.message },      { status: 500 })
    if (meatprep.error)   return NextResponse.json({ error: meatprep.error.message },   { status: 500 })
    if (timesep.error)    return NextResponse.json({ error: timesep.error.message },    { status: 500 })
    if (deliveries.error) return NextResponse.json({ error: deliveries.error.message }, { status: 500 })

    // Expose today's mince batches separately for the prep source picker
    const minceBatches = (mince.data ?? []).map((r) => ({
      id:           r.id,
      batch_code:   r.batch_code,
      species:      r.product_species,
      kill_date:    r.kill_date,
      output_mode:  r.output_mode,
      submitted_at: r.submitted_at,
    }))

    return NextResponse.json({
      date:          today,
      mince:         mince.data      ?? [],
      meatprep:      meatprep.data   ?? [],
      timesep:       timesep.data    ?? [],
      deliveries:    deliveries.data ?? [],
      mince_batches: minceBatches,
    })

  } catch (err) {
    console.error('[GET /api/haccp/mince-prep] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body  = await req.json()
    const { form } = body
    const today = todayUK()

    // Today-only date guard
    if (body.date && body.date !== today) {
      return NextResponse.json(
        { error: 'Records may only be submitted for today\'s date' },
        { status: 400 }
      )
    }

    const nowTime = nowTimeUK()
    const validSpecies = ['lamb', 'beef', 'imported_vac']

    // ── Mince log ─────────────────────────────────────────────────────────────
    if (form === 'mince') {
      const {
        product_species, kill_date, input_temp_c, output_temp_c,
        output_mode, source_batch_numbers, source_delivery_ids, corrective_action,
      } = body

      if (!product_species || !validSpecies.includes(product_species)) {
        return NextResponse.json(
          { error: 'Species must be lamb, beef, or imported_vac' },
          { status: 400 }
        )
      }
      if (!kill_date) {
        return NextResponse.json({ error: 'Kill date is required' }, { status: 400 })
      }
      if (input_temp_c == null) {
        return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      }
      if (output_temp_c == null) {
        return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })
      }

      const killDateObj  = new Date(kill_date + 'T00:00:00')
      const todayObj     = new Date(today + 'T00:00:00')
      const daysFromKill = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)

      // Hard block — kill date exceeded for non-imported species
      if (killDateHardFail(product_species, daysFromKill)) {
        return NextResponse.json({
          error:               `Kill date exceeded (${daysFromKill} days from kill). DO NOT MINCE — segregate and return to supplier or dispose as Category 3 ABP.`,
          kill_date_hard_fail: true,
          days_from_kill:      daysFromKill,
        }, { status: 400 })
      }

      const killPass = killDatePass(product_species, daysFromKill)
      const inPass   = inputTempPass(input_temp_c)
      const outPass  = outputTempPass(output_temp_c, 'mince', output_mode ?? 'chilled')
      const anyDeviation = !inPass || !outPass

      if (anyDeviation && !corrective_action?.trim()) {
        return NextResponse.json(
          { error: 'Corrective action is required when a temperature deviation is recorded' },
          { status: 400 }
        )
      }

      const runNum    = await nextRunNumber('haccp_mince_log', today)
      const batchCode = buildBatchCode('mince', today, product_species, runNum)

      const { error } = await supabase.from('haccp_mince_log').insert({
        submitted_by:           userId,
        date:                   today,
        time_of_production:     nowTime,
        batch_code:             batchCode,
        product_species,
        kill_date,
        days_from_kill:         daysFromKill,
        kill_date_within_limit: killPass,
        input_temp_c,
        output_temp_c,
        input_temp_pass:        inPass,
        output_temp_pass:       outPass,
        output_mode:            output_mode ?? 'chilled',
        source_batch_numbers:   source_batch_numbers ?? [],
        source_delivery_ids:    source_delivery_ids  ?? [],
        corrective_action:      corrective_action?.trim() || null,
      })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Duplicate submission — a batch with this code already exists today' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        ok:             true,
        batch_code:     batchCode,
        days_from_kill: daysFromKill,
        kill_pass:      killPass,
      })
    }

    // ── Meat prep log ─────────────────────────────────────────────────────────
    if (form === 'meatprep') {
      const {
        product_name, product_species, kill_date,
        input_temp_c, output_temp_c, output_mode,
        allergens_present, label_check_completed,
        source_batch_numbers, source_delivery_ids,
        source_mince_batch_ids,
        corrective_action,
      } = body

      if (!product_name?.trim()) {
        return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
      }
      if (input_temp_c  == null) {
        return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      }
      if (output_temp_c == null) {
        return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })
      }
      if (product_species && !validSpecies.includes(product_species)) {
        return NextResponse.json({ error: 'Invalid species' }, { status: 400 })
      }

      let daysFromKill: number | null = null
      if (kill_date) {
        const kd = new Date(kill_date + 'T00:00:00')
        const td = new Date(today + 'T00:00:00')
        daysFromKill = Math.floor((td.getTime() - kd.getTime()) / 86400000)
      }

      const speciesForTemp      = product_species ?? 'beef'
      const inPass              = inputTempPass(input_temp_c)
      const outPass             = outputTempPass(output_temp_c, 'meatprep', output_mode ?? 'chilled')
      const allergenLabelIssue  = (allergens_present?.length > 0) && !label_check_completed
      const anyDeviation        = !inPass || !outPass || allergenLabelIssue

      if (anyDeviation && !corrective_action?.trim()) {
        return NextResponse.json(
          { error: 'Corrective action is required for deviation' },
          { status: 400 }
        )
      }

      // Merge delivery + mince batch references into source_batch_numbers
      const allSourceBatches = [
        ...(source_batch_numbers  ?? []),
        ...(source_mince_batch_ids ?? []),
      ]

      const runNum    = await nextRunNumber('haccp_meatprep_log', today)
      const batchCode = buildBatchCode('meatprep', today, speciesForTemp, runNum)

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
        source_batch_numbers:  allSourceBatches,
        source_delivery_ids:   source_delivery_ids ?? [],
        corrective_action:     corrective_action?.trim() || null,
      })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Duplicate submission — a batch with this code already exists today' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, batch_code: batchCode })
    }

    // ── Time separation log ───────────────────────────────────────────────────
    if (form === 'timesep') {
      const {
        plain_products_end_time, clean_completed_time,
        allergen_products_start_time, clean_verified_by,
        allergens_in_production, corrective_action,
      } = body

      if (!clean_completed_time) {
        return NextResponse.json({ error: 'Clean completed time is required' }, { status: 400 })
      }
      if (!clean_verified_by?.trim()) {
        return NextResponse.json({ error: 'Verified by name is required' }, { status: 400 })
      }
      if (!allergens_in_production?.trim()) {
        return NextResponse.json({ error: 'Allergens in production field is required' }, { status: 400 })
      }

      const { error } = await supabase.from('haccp_time_separation_log').insert({
        submitted_by:                 userId,
        date:                         today,
        time_of_entry:                nowTime,
        plain_products_end_time:      plain_products_end_time ?? null,
        clean_completed_time,
        allergen_products_start_time: allergen_products_start_time ?? null,
        clean_verified_by:            clean_verified_by.trim(),
        allergens_in_production:      allergens_in_production.trim(),
        corrective_action:            corrective_action?.trim() || null,
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
