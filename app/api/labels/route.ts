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
 *   type:   'delivery' | 'mince'    (required)
 *   id:     UUID                    (required)
 *   format: 'html' | 'zpl'         (optional, default 'html')
 *   copies: 1–50                    (optional, default 1)
 *
 * Returns: HTML document or ZPL string
 * Errors: 400 (bad params), 401 (auth), 404 (not found), 500 (server)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'
import {
  generateLabel,
  calculateUseByFromDays,
  fmtDisplayDate,
  formatGoodsInBatchCode,
  ddmmFromDate,
} from '@/lib/printing'
import type { DeliveryLabelData, MinceLabelData, PrintConfig, OutputMode } from '@/lib/printing/types'

const supabase = supabaseService

// Auth: warehouse and admin can print labels
const ALLOWED_ROLES = ['admin', 'warehouse', 'butcher']

function validateParams(params: URLSearchParams): {
  valid: boolean; error?: string
  type?: string; id?: string; format?: string; copies?: number; usebydays?: number
} {
  const type   = params.get('type')   ?? undefined
  const id     = params.get('id')     ?? undefined
  const format = params.get('format') ?? 'html'
  const copiesStr  = params.get('copies')    ?? '1'
  const usebydaysStr = params.get('usebydays') ?? undefined

  if (!type || !['delivery', 'mince'].includes(type)) {
    return { valid: false, error: 'type must be delivery or mince' }
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { valid: false, error: 'id must be a valid UUID' }
  }
  if (!['html', 'zpl'].includes(format)) {
    return { valid: false, error: 'format must be html or zpl' }
  }
  const copies = parseInt(copiesStr)
  if (isNaN(copies) || copies < 1 || copies > 50) {
    return { valid: false, error: 'copies must be 1–50' }
  }

  let usebydays: number | undefined
  if (type === 'mince') {
    if (!usebydaysStr) return { valid: false, error: 'usebydays is required for mince labels' }
    usebydays = parseInt(usebydaysStr)
    if (isNaN(usebydays) || usebydays < 1 || usebydays > 365) {
      return { valid: false, error: 'usebydays must be 1–365' }
    }
  }

  return { valid: true, type, id, format, copies, usebydays }
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

    const { type, id, format, copies, usebydays } = result as Required<typeof result> & { usebydays?: number }
    const config: PrintConfig = { format: format as 'html' | 'zpl', copies }

    // ── Delivery label ─────────────────────────────────────────────────────────
    if (type === 'delivery') {
      const { data, error } = await supabase
        .from('haccp_deliveries')
        .select('id, date, batch_number, supplier, product, species, product_category, temperature_c, temp_status, born_in, reared_in, slaughter_site, cut_site')
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
        mfs_plant:      'UK2946',
        temperature_c:  Number(data.temperature_c),
        temp_status:    data.temp_status ?? 'pass',
      }

      const output = generateLabel('delivery', labelData, config)

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
        .select('id, date, batch_code, product_species, output_mode, kill_date, days_from_kill, source_batch_numbers, source_delivery_ids')
        .eq('id', id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Mince/prep record not found' }, { status: 404 })
      }

      // ── BLS: look up source delivery records to get origin data ──────────────
      const deliveryIds = (data.source_delivery_ids as string[] | null) ?? []
      let origins:       string[] = []
      let slaughteredIn: string[] = []

      if (deliveryIds.length > 0) {
        const { data: deliveries } = await supabase
          .from('haccp_deliveries')
          .select('born_in, reared_in, slaughter_site')
          .in('id', deliveryIds)

        if (deliveries && deliveries.length > 0) {
          // Collect unique born_in country codes → map to country names
          const bornCodes = [...new Set(
            deliveries.map(d => (d.born_in as string | null) ?? '').filter(Boolean)
          )]
          origins = bornCodes.map(code => {
            const COUNTRY_NAMES: Record<string, string> = {
              GB:'United Kingdom', UK:'United Kingdom', IE:'Ireland',
              AU:'Australia', NZ:'New Zealand', FR:'France', DE:'Germany',
              NL:'Netherlands', BE:'Belgium', ES:'Spain', IT:'Italy',
              PL:'Poland', BR:'Brazil', AR:'Argentina', UY:'Uruguay',
              US:'United States', CA:'Canada', ZA:'South Africa',
              NA:'Namibia', BW:'Botswana', IN:'India', PK:'Pakistan',
            }
            return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
          })

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
      }

      const output = generateLabel('mince', labelData, config)

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
