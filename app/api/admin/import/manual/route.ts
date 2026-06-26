/**
 * POST /api/admin/import/manual
 *
 * Receives pre-parsed rows and column-index mappings from the manual column
 * mapper UI. Inserts directly into products or customers — no Anthropic call.
 *
 * Strategy: insert rows one at a time so a single duplicate/bad row never
 * aborts the entire batch. Duplicates (unique constraint violations on name)
 * are silently skipped and counted as "skipped".
 *
 * Body:
 *   type    — 'customers' | 'products'
 *   rows    — string[][] (data rows, header already excluded by the client)
 *   mapping — { name: number, code?: number, category?: number, box_size?: number }
 *             numbers are 0-based column indices; null/undefined = not mapped
 */

import { NextRequest, NextResponse } from 'next/server'
import { customersService }          from '@/lib/wiring/customers'
import { productsService }           from '@/lib/wiring/products'
import { auditLog }                  from '@/lib/wiring/auditLog'

/** Trim a cell value; return null if blank */
function cell(v: string | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

export async function POST(req: NextRequest) {
  try {
    const userId   = req.headers.get('x-mfs-user-id')
    const userName = req.headers.get('x-mfs-user-name') ?? 'Admin'
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { type, rows, mapping } = body as {
      type:    'customers' | 'products'
      rows:    string[][]
      mapping: { name: number; code?: number | null; category?: number | null; box_size?: number | null }
    }

    if (type !== 'customers' && type !== 'products') {
      return NextResponse.json({ error: 'type must be "customers" or "products"' }, { status: 400 })
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required and must not be empty' }, { status: 400 })
    }
    if (typeof mapping?.name !== 'number') {
      return NextResponse.json({ error: 'mapping.name column index is required' }, { status: 400 })
    }

    let inserted = 0
    let skipped  = 0

    // ── Insert rows individually so one failure never aborts the batch ─────────
    // The per-row insertOne returns a typed InsertOneResult and NEVER throws on a
    // 23505 (duplicates are defined out of existence inside the adapter), so one
    // bad row never aborts the batch — byte-identical to today's inline handling.
    for (const row of rows) {
      const name = cell(row[mapping.name])
      if (!name) { skipped++; continue }   // blank name — skip silently

      const result = type === 'customers'
        ? await customersService.insertOne({ name, created_by: userId })
        : await productsService.insertOne({
            name,
            code:     mapping.code     != null ? cell(row[mapping.code])     : null,
            category: mapping.category != null ? cell(row[mapping.category]) : null,
            box_size: mapping.box_size  != null ? cell(row[mapping.box_size])  : null,
            created_by: userId,
          })

      if (result.outcome === 'inserted') {
        inserted++
      } else if (result.outcome === 'duplicate') {
        skipped++   // duplicate name — skip it silently
      } else {
        // Any other DB error — the adapter already logged it; reproduce today's
        // console.error + skip with the message string (no vendor object leaks).
        console.error(`[import/manual] ${type === 'customers' ? 'customer' : 'product'} insert error:`, result.message, '| row:', name)
        skipped++
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    // Best-effort (R-AUDIT): today the inline insert's `{ error }` is IGNORED —
    // an audit-write failure never fails an already-succeeded import. The .catch
    // preserves that: auditLog.record throws ServiceError on a DB failure, so we
    // swallow+log it here rather than let it bubble to the 500 catch.
    const label = type === 'customers' ? 'customer' : 'product'
    await auditLog.record({
      user_id:   userId,
      screen:    'screen5',
      action:    'imported',
      record_id: null,
      summary:   `${inserted} ${label}${inserted === 1 ? '' : 's'} imported via manual column mapper by ${userName}${skipped > 0 ? ` (${skipped} skipped — blank or duplicate)` : ''}`,
    }).catch(e => console.error('[import/manual] audit write failed (non-fatal):', e))

    return NextResponse.json({ inserted, skipped }, { status: 201 })

  } catch (err) {
    console.error('[import/manual] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
