/**
 * app/api/haccp/mince-prep/route.ts
 *
 * GET  — today's mince/meatprep/timesep + recent deliveries (16 days) + today's mince batches
 * POST — submit mince | meatprep | time_separation record
 *
 * Phase M-B (2026-04-21): CCA wiring
 * - CAPayload: cause, disposition, recurrence, notes (no action field — server-derived)
 * - Mince deviations write to haccp_corrective_actions:
 *     CCP-M1: input temp >7°C → channel 'M1-input'
 *     CCP-M1: output temp breach → channel 'M1-output'
 * - Prep deviations write to haccp_corrective_actions:
 *     CCP-MP1: input temp >7°C → channel 'MP1-input'
 *     CCP-MP1: output temp breach → channel 'MP1-output'
 * - management_verification_required: true for all mince/prep deviations
 *
 * Source: MMP-001 V1.0 · MMP-MF-001 V1.0 · MMP-HA-001 V1.0 · CA-001 Table 4
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ─── CA payload ──────────────────────────────────────────────────────────────
// action_taken is NOT in the payload — server derives it per channel

type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes:       string
}

// Disposition mapping to enum values in haccp_corrective_actions
const DISPOSITION_MAP: Record<string, string> = {
  'Accept':             'accept',
  'Conditional accept': 'conditional_accept',
  'Assess':             'assess',
  'Reject':             'reject',
  'Dispose':            'dispose',
}

// ─── CA protocol derivation ───────────────────────────────────────────────────

function deriveMinceTempAction(channel: 'input' | 'output', outputMode: string): string {
  if (channel === 'input') {
    return [
      'Quarantine batch immediately.',
      'Assess product condition and odour.',
      'Attempt rapid chilling to ≤7°C within 2 hours.',
      'If ≤7°C not achieved within 2 hours: reject product and return to supplier.',
      'Investigate supplier temperature control and delivery conditions.',
      'Record deviation on Mincing Production Log (MMP-MF-001 Form 1).',
    ].join(' ')
  }
  // output
  if (outputMode === 'frozen') {
    return [
      'Extend freezing time and recheck temperature after 30 minutes.',
      'If still above -18°C: assess product and review blast freezer capacity.',
      'Reduce batch sizes to ensure temperature compliance.',
      'Do not dispatch until ≤-18°C is confirmed.',
    ].join(' ')
  }
  return [
    'Extend chilling period and recheck temperature after 30 minutes.',
    'If still above 2°C: assess product safety.',
    'Reduce batch size — product may be too warm from mincing friction.',
    'Do not dispatch until ≤2°C is confirmed.',
  ].join(' ')
}

function derivePrepTempAction(channel: 'input' | 'output', outputMode: string): string {
  if (channel === 'input') {
    return [
      'Quarantine batch immediately.',
      'Assess product condition.',
      'Attempt rapid chilling to ≤7°C within 2 hours.',
      'If ≤7°C not achieved: reject product.',
      'Record deviation on Meat Prep Production Log (MMP-MF-001 Form 2).',
    ].join(' ')
  }
  if (outputMode === 'frozen') {
    return [
      'Extend freezing time and recheck after 30 minutes.',
      'If still above -18°C: assess product and review freezer capacity.',
      'Do not dispatch until ≤-18°C is confirmed.',
    ].join(' ')
  }
  return [
    'Extend chilling period and recheck after 30 minutes.',
    'If still above 4°C: assess product safety before dispatch.',
    'Consider reducing batch size.',
  ].join(' ')
}

// ─── Date / time ─────────────────────────────────────────────────────────────

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

function killDatePass(species: string, daysFromKill: number): boolean {
  if (species === 'imported_vac') return true
  return daysFromKill <= 6
}

function killDateHardFail(species: string, daysFromKill: number): boolean {
  if (species === 'imported_vac') return false
  return daysFromKill > 6
}

// ─── Temperature logic ───────────────────────────────────────────────────────

function inputTempPass(temp: number): boolean {
  return temp <= 7
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
    const range   = req.nextUrl.searchParams.get('range') ?? 'today'

    // Week = Monday of current ISO week through today
    const weekStart = (() => {
      const d   = new Date(today + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()  // Sunday = 7
      d.setDate(d.getDate() - (day - 1))
      return d.toLocaleDateString('en-CA')
    })()

    const [mince, meatprep, timesep, deliveries] = await Promise.all([
      (range === 'week'
        ? supabase.from('haccp_mince_log')
            .select(`id, date, time_of_production, batch_code, product_species, kill_date,
                     days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
            .gte('date', weekStart).lte('date', today)
        : supabase.from('haccp_mince_log')
            .select(`id, date, time_of_production, batch_code, product_species, kill_date,
                     days_from_kill, kill_date_within_limit, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
            .eq('date', today)
      ).order('date', { ascending: false }).order('submitted_at', { ascending: false }),

      (range === 'week'
        ? supabase.from('haccp_meatprep_log')
            .select(`id, date, time_of_production, batch_code, product_name, product_species,
                     kill_date, days_from_kill, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     allergens_present, label_check_completed,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
            .gte('date', weekStart).lte('date', today)
        : supabase.from('haccp_meatprep_log')
            .select(`id, date, time_of_production, batch_code, product_name, product_species,
                     kill_date, days_from_kill, input_temp_c, output_temp_c,
                     input_temp_pass, output_temp_pass, output_mode,
                     allergens_present, label_check_completed,
                     source_batch_numbers, corrective_action, submitted_at, users!inner(name)`)
            .eq('date', today)
      ).order('date', { ascending: false }).order('submitted_at', { ascending: false }),

      (range === 'week'
        ? supabase.from('haccp_time_separation_log')
            .select(`id, date, time_of_entry, plain_products_end_time, clean_completed_time,
                     allergen_products_start_time, clean_verified_by, allergens_in_production,
                     corrective_action, submitted_at, users!inner(name)`)
            .gte('date', weekStart).lte('date', today)
        : supabase.from('haccp_time_separation_log')
            .select(`id, date, time_of_entry, plain_products_end_time, clean_completed_time,
                     allergen_products_start_time, clean_verified_by, allergens_in_production,
                     corrective_action, submitted_at, users!inner(name)`)
            .eq('date', today)
      ).order('date', { ascending: false }).order('submitted_at', { ascending: false }),

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

    if (body.date && body.date !== today) {
      return NextResponse.json(
        { error: 'Records may only be submitted for today\'s date' },
        { status: 400 }
      )
    }

    const nowTime      = nowTimeUK()
    const validSpecies = ['lamb', 'beef', 'imported_vac']

    // ── Mince log ─────────────────────────────────────────────────────────────
    if (form === 'mince') {
      const {
        product_species, kill_date, input_temp_c, output_temp_c,
        output_mode, source_batch_numbers, source_delivery_ids,
        corrective_action,
      } = body

      if (!product_species || !validSpecies.includes(product_species))
        return NextResponse.json({ error: 'Species must be lamb, beef, or imported_vac' }, { status: 400 })
      if (!kill_date)
        return NextResponse.json({ error: 'Kill date is required' }, { status: 400 })
      if (input_temp_c == null)
        return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      if (output_temp_c == null)
        return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })

      const killDateObj  = new Date(kill_date + 'T00:00:00')
      const todayObj     = new Date(today + 'T00:00:00')
      const daysFromKill = Math.floor((todayObj.getTime() - killDateObj.getTime()) / 86400000)

      if (killDateHardFail(product_species, daysFromKill)) {
        return NextResponse.json({
          error:               `Kill date exceeded (${daysFromKill} days) — DO NOT MINCE. Segregate and return to supplier or dispose as Category 3 ABP.`,
          kill_date_hard_fail: true,
          days_from_kill:      daysFromKill,
        }, { status: 400 })
      }

      const killPass     = killDatePass(product_species, daysFromKill)
      const inPass       = inputTempPass(input_temp_c)
      const outPass      = outputTempPass(output_temp_c, 'mince', output_mode ?? 'chilled')
      const anyDeviation = !inPass || !outPass

      if (anyDeviation && !corrective_action) {
        return NextResponse.json(
          { error: 'Corrective action is required for temperature deviation' },
          { status: 400 }
        )
      }

      const runNum    = await nextRunNumber('haccp_mince_log', today)
      const batchCode = buildBatchCode('mince', today, product_species, runNum)

      // 1. Insert mince log row
      const { data: inserted, error: insertErr } = await supabase
        .from('haccp_mince_log')
        .insert({
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
          corrective_action:      corrective_action
            ? `${corrective_action.cause} | ${corrective_action.disposition} | ${corrective_action.recurrence}`
            : null,
        })
        .select('id')
        .single()

      if (insertErr) {
        if (insertErr.code === '23505')
          return NextResponse.json({ error: 'Duplicate submission — batch code already exists today' }, { status: 409 })
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // 2. Write CA rows to haccp_corrective_actions if deviation
      let caWriteFailed = false
      if (anyDeviation && corrective_action && inserted) {
        const ca     = corrective_action as CAPayload
        const disp   = DISPOSITION_MAP[ca.disposition] ?? 'assess'
        const recNotes = ca.notes
          ? `${ca.recurrence} | Notes: ${ca.notes}`
          : ca.recurrence

        const caRows: Array<Record<string, unknown>> = []

        if (!inPass) {
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_mince_log',
            source_id:     inserted.id,
            ccp_ref:       'CCP-M1',
            deviation_description: `Mince input temp: ${input_temp_c}°C (limit ≤7°C, ${product_species}). Cause: ${ca.cause}`,
            action_taken:          deriveMinceTempAction('input', output_mode ?? 'chilled'),
            product_disposition:   disp,
            recurrence_prevention: recNotes,
            management_verification_required: true,
          })
        }

        if (!outPass) {
          const limit = (output_mode ?? 'chilled') === 'frozen' ? '≤-18°C' : '≤2°C'
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_mince_log',
            source_id:     inserted.id,
            ccp_ref:       'CCP-M1',
            deviation_description: `Mince output temp: ${output_temp_c}°C (limit ${limit}, ${output_mode ?? 'chilled'}). Cause: ${ca.cause}`,
            action_taken:          deriveMinceTempAction('output', output_mode ?? 'chilled'),
            product_disposition:   disp,
            recurrence_prevention: recNotes,
            management_verification_required: true,
          })
        }

        if (caRows.length > 0) {
          const { error: caErr } = await supabase.from('haccp_corrective_actions').insert(caRows)
          if (caErr) {
            console.error('[POST /api/haccp/mince-prep] CCP-M1 CA insert failed:', caErr)
            caWriteFailed = true
          }
        }
      }

      return NextResponse.json({
        ok:             true,
        batch_code:     batchCode,
        days_from_kill: daysFromKill,
        kill_pass:      killPass,
        has_deviation:  anyDeviation,
        ca_write_failed: caWriteFailed,
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

      if (!product_name?.trim())
        return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
      if (input_temp_c  == null)
        return NextResponse.json({ error: 'Input temperature is required' }, { status: 400 })
      if (output_temp_c == null)
        return NextResponse.json({ error: 'Output temperature is required' }, { status: 400 })
      if (product_species && !validSpecies.includes(product_species))
        return NextResponse.json({ error: 'Invalid species' }, { status: 400 })

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

      if (anyDeviation && !corrective_action)
        return NextResponse.json({ error: 'Corrective action is required for deviation' }, { status: 400 })

      const allSourceBatches = [
        ...(source_batch_numbers   ?? []),
        ...(source_mince_batch_ids ?? []),
      ]

      const runNum    = await nextRunNumber('haccp_meatprep_log', today)
      const batchCode = buildBatchCode('meatprep', today, speciesForTemp, runNum)

      // 1. Insert prep log row
      const { data: inserted, error: insertErr } = await supabase
        .from('haccp_meatprep_log')
        .insert({
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
          corrective_action:     corrective_action
            ? `${corrective_action.cause} | ${corrective_action.disposition} | ${corrective_action.recurrence}`
            : null,
        })
        .select('id')
        .single()

      if (insertErr) {
        if (insertErr.code === '23505')
          return NextResponse.json({ error: 'Duplicate submission — batch code already exists today' }, { status: 409 })
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      // 2. Write CA rows if temperature deviation
      let caWriteFailed = false
      if (((!inPass) || (!outPass)) && corrective_action && inserted) {
        const ca     = corrective_action as CAPayload
        const disp   = DISPOSITION_MAP[ca.disposition] ?? 'assess'
        const recNotes = ca.notes
          ? `${ca.recurrence} | Notes: ${ca.notes}`
          : ca.recurrence

        const caRows: Array<Record<string, unknown>> = []

        if (!inPass) {
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_meatprep_log',
            source_id:     inserted.id,
            ccp_ref:       'CCP-MP1',
            deviation_description: `Prep input temp: ${input_temp_c}°C (limit ≤7°C, ${product_name.trim()}). Cause: ${ca.cause}`,
            action_taken:          derivePrepTempAction('input', output_mode ?? 'chilled'),
            product_disposition:   disp,
            recurrence_prevention: recNotes,
            management_verification_required: true,
          })
        }

        if (!outPass) {
          const limit = (output_mode ?? 'chilled') === 'frozen' ? '≤-18°C' : '≤4°C'
          caRows.push({
            actioned_by:   userId,
            source_table:  'haccp_meatprep_log',
            source_id:     inserted.id,
            ccp_ref:       'CCP-MP1',
            deviation_description: `Prep output temp: ${output_temp_c}°C (limit ${limit}, ${product_name.trim()}). Cause: ${ca.cause}`,
            action_taken:          derivePrepTempAction('output', output_mode ?? 'chilled'),
            product_disposition:   disp,
            recurrence_prevention: recNotes,
            management_verification_required: true,
          })
        }

        if (caRows.length > 0) {
          const { error: caErr } = await supabase.from('haccp_corrective_actions').insert(caRows)
          if (caErr) {
            console.error('[POST /api/haccp/mince-prep] CCP-MP1 CA insert failed:', caErr)
            caWriteFailed = true
          }
        }
      }

      return NextResponse.json({
        ok:              true,
        batch_code:      batchCode,
        has_deviation:   anyDeviation,
        ca_write_failed: caWriteFailed,
      })
    }

    // ── Time separation log ───────────────────────────────────────────────────
    if (form === 'timesep') {
      const {
        plain_products_end_time, clean_completed_time,
        allergen_products_start_time, clean_verified_by,
        allergens_in_production, corrective_action,
      } = body

      if (!clean_completed_time)
        return NextResponse.json({ error: 'Clean completed time is required' }, { status: 400 })
      if (!clean_verified_by?.trim())
        return NextResponse.json({ error: 'Verified by name is required' }, { status: 400 })
      if (!allergens_in_production?.trim())
        return NextResponse.json({ error: 'Allergens in production field is required' }, { status: 400 })

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
