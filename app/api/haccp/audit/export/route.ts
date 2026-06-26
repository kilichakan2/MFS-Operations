/**
 * app/api/haccp/audit/export/route.ts
 *
 * GET /api/haccp/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Generates a single XLSX file with one sheet per built audit section.
 * Returns as a binary download: MFS_HACCP_Audit_FROM_to_TO.xlsx
 *
 * Admin only.
 *
 * F-19 PR8: thin doorman — role-check → ask the reporting service for the
 * finished workbook bytes → wrap in the download headers. The Excel library
 * (`xlsx`) is no longer imported here — it is confined to the
 * SpreadsheetExporter adapter (`lib/adapters/xlsx/`) and reached via the
 * HaccpReportingService (PR7). The 14-tab workbook assembly lives in the
 * service / adapter, not in this route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpReportingServiceForCaller } from '@/lib/wiring/haccp'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId || role !== 'admin') {
      return new NextResponse('Unauthorised', { status: 401 })
    }

    const svc = await haccpReportingServiceForCaller(userId)

    const { searchParams } = req.nextUrl
    const from = searchParams.get('from') ?? daysAgo(30)
    const to   = searchParams.get('to')   ?? todayUK()

    const buf = await svc.buildAuditWorkbook(from, to)

    const filename = `MFS_HACCP_Audit_${from}_to_${to}.xlsx`

    // `buf` is a Node Buffer (a Uint8Array subclass). Copy the bytes into a
    // plain ArrayBuffer-backed Uint8Array so NextResponse accepts it as a
    // BodyInit — same bytes, same Content-Length.
    const body = new Uint8Array(buf)

    return new NextResponse(body, {
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
