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

    // Future sections added here:
    // const coldStorageSheet = await fetchColdStorageSheet(from, to)
    // XLSX.utils.book_append_sheet(wb, coldStorageSheet, '02 Cold Storage')

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
