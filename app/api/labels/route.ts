/**
 * app/api/labels/route.ts
 *
 * GET /api/labels?type=delivery&id=UUID&format=html&copies=1
 *
 * Fetches record from DB, maps to label data, generates output.
 *
 * Auth: mfs_role cookie — warehouse or admin required
 *
 * Params:
 *   type:   'delivery' | 'mince' | 'prep'  (required)
 *   id:     UUID                           (required)
 *   format: 'html' | 'zpl' | 'json'        (optional, default 'html')
 *   copies: 1–50                           (optional, default 1)
 *
 * Returns: HTML document, ZPL string, or — for format=json — the aggregated
 *   LabelData as JSON ({ type, data }) so the native Sunmi adapter consumes the
 *   SAME server-aggregated BLS fields the renderer uses (single source of truth).
 * Errors: 400 (bad params), 401 (auth), 404 (not found), 500 (server)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/adapters/supabase/client'
import {
  generateLabel,
  calculateUseByFromDays,
  fmtDisplayDate,
  formatGoodsInBatchCode,
  ddmmFromDate,
  MFS_PLANT_CODE,
} from '@/lib/printing'
import type { DeliveryLabelData, MinceLabelData, PrepLabelData, PrintConfig, OutputMode } from '@/lib/printing/types'

const supabase = supabaseService

// Auth: warehouse and admin can print labels
const ALLOWED_ROLES = ['admin', 'warehouse', 'butcher']

function validateParams(params: URLSearchParams): {
  valid: boolean; error?: string
  type?: string; id?: string; format?: string; width?: string; copies?: number; usebydays?: number
} {
  const type   = params.get('type')   ?? undefined
  const id     = params.get('id')     ?? undefined
  const format = params.get('format') ?? 'html'
  const width  = params.get('width')  ?? '100mm'
  const copiesStr    = params.get('copies')    ?? '1'
  const usebydaysStr = params.get('usebydays') ?? undefined

  if (!type || !['delivery', 'mince', 'prep'].includes(type)) {
    return { valid: false, error: 'type must be delivery, mince or prep' }
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { valid: false, error: 'id must be a valid UUID' }
  }
  // 'json' is the structured-data path the native Sunmi adapter fetches (ADR-0013):
  // the server aggregates the BLS fields ONCE and hands the adapter the same
  // LabelData the renderer uses, so there is a single source of truth.
  if (!['html', 'zpl', 'json'].includes(format)) {
    return { valid: false, error: 'format must be html, zpl or json' }
  }
  if (!['100mm', '58mm'].includes(width)) {
    return { valid: false, error: 'width must be 100mm or 58mm' }
  }
  const copies = parseInt(copiesStr)
  if (isNaN(copies) || copies < 1 || copies > 50) {
    return { valid: false, error: 'copies must be 1–50' }
  }

  let usebydays: number | undefined
  // usebydays is a print-time staff pick (use-by date), required for both
  // production templates (mince + prep), not for the goods-in delivery label.
  if (type === 'mince' || type === 'prep') {
    if (!usebydaysStr) return { valid: false, error: 'usebydays is required for mince and prep labels' }
    usebydays = parseInt(usebydaysStr)
    if (isNaN(usebydays) || usebydays < 1 || usebydays > 365) {
      return { valid: false, error: 'usebydays must be 1–365' }
    }
  }

  return { valid: true, type, id, format, width, copies, usebydays }
}

// BLS traceability chain: resolve the FULL set of underlying goods-in delivery IDs
// for a production run. A prep/mince run may be sourced from another BATCH (e.g. a
// burger made from MINCE-3006-BEEF-1) rather than from deliveries directly — but the
// origin (born/slaughtered/cut) lives on the deliveries that fed that batch. Follow
// each source batch back to its deliveries: MINCE-/PREP- batches resolve via their
// own source rows (PREP recurses one more level); any other code is a goods-in
// delivery batch_number. Depth-bounded to guard against cycles. Deduped by delivery id.
async function resolveDeliveryIds(
  directIds: string[],
  sourceBatchNumbers: string[],
  depth = 0,
): Promise<string[]> {
  const ids = new Set<string>(directIds.filter(Boolean))
  if (depth > 3) return [...ids] // cycle / runaway guard
  for (const batch of sourceBatchNumbers) {
    if (!batch) continue
    if (batch.startsWith('MINCE-')) {
      const { data } = await supabase
        .from('haccp_mince_log')
        .select('source_delivery_ids')
        .eq('batch_code', batch)
        .maybeSingle()
      ;((data?.source_delivery_ids as string[] | null) ?? []).forEach(id => id && ids.add(id))
    } else if (batch.startsWith('PREP-')) {
      const { data } = await supabase
        .from('haccp_meatprep_log')
        .select('source_delivery_ids, source_batch_numbers')
        .eq('batch_code', batch)
        .maybeSingle()
      if (data) {
        const nested = await resolveDeliveryIds(
          (data.source_delivery_ids as string[] | null) ?? [],
          (data.source_batch_numbers as string[] | null) ?? [],
          depth + 1,
        )
        nested.forEach(id => ids.add(id))
      }
    } else {
      // goods-in delivery batch_number (e.g. "3006-GB-1")
      const { data } = await supabase
        .from('haccp_deliveries')
        .select('id')
        .eq('batch_number', batch)
      ;(data ?? []).forEach(d => d?.id && ids.add(d.id as string))
    }
  }
  return [...ids]
}

export async function GET(req: NextRequest) {
  try {
    // Auth check — role injected by middleware from session
    const role = req.headers.get('x-mfs-user-role')
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return new NextResponse('Unauthorised', { status: 401 })
    }

    // Param validation
    const result = validateParams(req.nextUrl.searchParams)
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { type, id, format, width, copies, usebydays } = result as Required<typeof result> & { usebydays?: number }
    // For the renderer path, 'json' is never passed through — generateLabel only
    // knows html/zpl. The json branch returns the aggregated LabelData directly
    // (the single-source-of-truth the native Sunmi adapter consumes).
    const isJson = format === 'json'
    const renderFormat: 'html' | 'zpl' = format === 'zpl' ? 'zpl' : 'html'
    const config: PrintConfig = { format: renderFormat, copies, width: width as '100mm' | '58mm' }

    // ── Delivery label ─────────────────────────────────────────────────────────
    if (type === 'delivery') {
      const { data, error } = await supabase
        .from('haccp_deliveries')
        .select('id, date, batch_number, supplier, product, species, product_category, temperature_c, temp_status, born_in, reared_in, slaughter_site, cut_site, allergens_identified, allergen_notes')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Delivery record not found' }, { status: 404 })
      }

      // Ensure batch code — generate if missing
      let batchCode = data.batch_number
      if (!batchCode) {
        const ddmm  = ddmmFromDate(data.date)
        const sp    = data.species ?? data.product_category ?? 'OTHER'
        // Get sequence for this day + species
        const { count } = await supabase
          .from('haccp_deliveries')
          .select('*', { count: 'exact', head: true })
          .eq('date', data.date)
          .not('batch_number', 'is', null)
        const seq   = (count ?? 0) + 1
        batchCode   = formatGoodsInBatchCode(ddmm, sp, seq)
      }

      const isoDate = data.date  // YYYY-MM-DD

      const labelData: DeliveryLabelData = {
        batch_code:     batchCode,
        supplier:       data.supplier,
        product:        data.product,
        species:        data.species ?? '',
        date_received:  fmtDisplayDate(isoDate),
        born_in:        data.born_in ?? null,
        reared_in:      data.reared_in ?? null,
        slaughter_site: data.slaughter_site ?? null,
        cut_site:       data.cut_site ?? null,
        mfs_plant:      MFS_PLANT_CODE,
        temperature_c:  Number(data.temperature_c),
        temp_status:    data.temp_status ?? 'pass',
        allergens_flagged: data.allergens_identified ?? false,
        allergen_notes:    data.allergen_notes ?? null,
      }

      if (isJson) {
        return NextResponse.json({ type: 'delivery', data: labelData })
      }

      // For 58mm: fetch supplier label_code (case-insensitive match, fallback handled in renderer)
      let supplierCode = ''
      if (config.width === '58mm') {
        const { data: sup } = await supabase
          .from('haccp_suppliers')
          .select('label_code')
          .ilike('name', data.supplier)
          .limit(1)
          .maybeSingle()
        supplierCode = sup?.label_code ?? ''
      }

      const output = generateLabel('delivery', labelData, { ...config, supplierCode } as Parameters<typeof generateLabel>[2])

      return new NextResponse(output.content, {
        headers: {
          'Content-Type': output.contentType,
          'Content-Disposition': `inline; filename="${output.filename}"`,
        },
      })
    }

    // ── Mince / Prep label ─────────────────────────────────────────────────────
    if (type === 'mince') {
      const { data, error } = await supabase
        .from('haccp_mince_log')
        // NOTE: haccp_mince_log has NO allergens_present column (it lives only on
        // haccp_meatprep_log). Selecting it made PostgREST reject the query → 404.
        // Mince allergens are out of scope until Pass 3; render "None" for now.
        .select('id, date, batch_code, product_species, output_mode, kill_date, days_from_kill, source_batch_numbers, source_delivery_ids')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Mince/prep record not found' }, { status: 404 })
      }

      // ── BLS: look up source delivery records to get origin data ──────────────
      const deliveryIds = await resolveDeliveryIds(
        (data.source_delivery_ids as string[] | null) ?? [],
        (data.source_batch_numbers as string[] | null) ?? [],
      )
      let origins:       string[] = []
      let slaughteredIn: string[] = []

      if (deliveryIds.length > 0) {
        const { data: deliveries } = await supabase
          .from('haccp_deliveries')
          .select('born_in, reared_in, slaughter_site')
          .in('id', deliveryIds)

        if (deliveries && deliveries.length > 0) {
          // Born-in country CODES (GB, AU) — codes, not full names, so the line
          // stays one row and matches the Slaughtered/Cut lines (Hakan, 2026-06-30).
          origins = [...new Set(
            deliveries.map(d => ((d.born_in as string | null) ?? '').toUpperCase()).filter(Boolean)
          )]

          // Extract country code prefix from slaughter_site (e.g. "GB" from "GB1234")
          slaughteredIn = [...new Set(
            deliveries
              .map(d => (d.slaughter_site as string | null) ?? '')
              .filter(Boolean)
              .map(site => site.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())
              .filter(Boolean)
          )]
        }
      }

      const outputMode = (data.output_mode ?? 'chilled') as OutputMode
      // use_by: calculated from usebydays param (staff picked at print time)
      const useby      = calculateUseByFromDays(data.date, usebydays ?? 7)

      const labelData: MinceLabelData = {
        batch_code:           data.batch_code,
        product_species:      data.product_species ?? '',
        output_mode:          outputMode,
        date:                 fmtDisplayDate(data.date),
        kill_date:            data.kill_date ? fmtDisplayDate(data.kill_date) : null,
        days_from_kill:       data.days_from_kill ?? null,
        source_batch_numbers: (data.source_batch_numbers as string[]) ?? [],
        use_by:               fmtDisplayDate(useby),
        origins:              origins,
        slaughtered_in:       slaughteredIn,
        minced_in:            'GB',
        // No allergens column on haccp_mince_log (see select above) → always empty
        // until Pass 3 wires real mince allergens. Renders "Allergens: None".
        allergens_present:    [],
      }

      if (isJson) {
        return NextResponse.json({ type: 'mince', data: labelData })
      }

      const output = generateLabel('mince', labelData, config)

      return new NextResponse(output.content, {
        headers: {
          'Content-Type': output.contentType,
          'Content-Disposition': `inline; filename="${output.filename}"`,
        },
      })
    }

    // ── Prep (meat-prep) dispatch label ──────────────────────────────────────
    // BLS rules differ from mince: slaughtered_in is COUNTRY+PLANT (raw GBxxxx,
    // digits kept), plus "Cut in" (primary cut site, country+plant) and
    // "Further cut in" (MFS GB2946). Reads haccp_meatprep_log + the source
    // deliveries' cut_site/slaughter_site.
    if (type === 'prep') {
      const { data, error } = await supabase
        .from('haccp_meatprep_log')
        .select('id, date, batch_code, product_name, product_species, output_mode, kill_date, days_from_kill, source_batch_numbers, source_delivery_ids, allergens_present')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Prep record not found' }, { status: 404 })
      }

      const deliveryIds = await resolveDeliveryIds(
        (data.source_delivery_ids as string[] | null) ?? [],
        (data.source_batch_numbers as string[] | null) ?? [],
      )
      let origins:       string[] = []
      let rearedIn:      string[] = []
      let slaughteredIn: string[] = []   // COUNTRY+PLANT (raw, distinct)
      let cutIn:         string[] = []   // primary cut site, country+plant (raw, distinct)

      if (deliveryIds.length > 0) {
        const { data: deliveries } = await supabase
          .from('haccp_deliveries')
          .select('born_in, reared_in, slaughter_site, cut_site')
          .in('id', deliveryIds)

        if (deliveries && deliveries.length > 0) {
          // Born/Reared country CODES (GB, AU) — codes, not full names, so each
          // stays one row on the dense prep label (Hakan, 2026-06-30).
          origins = [...new Set(
            deliveries.map(d => ((d.born_in as string | null) ?? '').toUpperCase()).filter(Boolean)
          )]

          rearedIn = [...new Set(
            deliveries.map(d => ((d.reared_in as string | null) ?? '').toUpperCase()).filter(Boolean)
          )]

          // Prep keeps the FULL country+plant code (e.g. "GB1234") — do NOT
          // strip digits (that is the mince-only country-only rule).
          slaughteredIn = [...new Set(
            deliveries.map(d => (d.slaughter_site as string | null) ?? '').filter(Boolean)
          )]

          cutIn = [...new Set(
            deliveries.map(d => (d.cut_site as string | null) ?? '').filter(Boolean)
          )]
        }
      }

      const outputMode = (data.output_mode ?? 'prep') as OutputMode
      const useby      = calculateUseByFromDays(data.date, usebydays ?? 7)

      const labelData: PrepLabelData = {
        batch_code:           data.batch_code,
        product_name:         data.product_name ?? '',
        product_species:      data.product_species ?? '',
        output_mode:          outputMode,
        date:                 fmtDisplayDate(data.date),
        kill_date:            data.kill_date ? fmtDisplayDate(data.kill_date) : null,
        days_from_kill:       data.days_from_kill ?? null,
        source_batch_numbers: (data.source_batch_numbers as string[]) ?? [],
        use_by:               fmtDisplayDate(useby),
        origins:              origins,
        reared_in:            rearedIn,
        slaughtered_in:       slaughteredIn,
        cut_in:               cutIn,
        further_cut_in:       MFS_PLANT_CODE,
        allergens_present:    (data.allergens_present as string[] | null) ?? [],
      }

      if (isJson) {
        return NextResponse.json({ type: 'prep', data: labelData })
      }

      const output = generateLabel('prep', labelData, config)

      return new NextResponse(output.content, {
        headers: {
          'Content-Type': output.contentType,
          'Content-Disposition': `inline; filename="${output.filename}"`,
        },
      })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })

  } catch (err) {
    console.error('[GET /api/labels]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
