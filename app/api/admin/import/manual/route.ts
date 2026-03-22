/**
 * POST /api/admin/import/manual
 *
 * Receives pre-parsed rows and column-index mappings from the manual column
 * mapper UI. Performs a direct upsert into the products or customers table.
 * NO Anthropic API call — this is a pure data-to-DB path.
 *
 * Body:
 *   type        — 'customers' | 'products'
 *   rows        — string[][] (all data rows, header row already excluded)
 *   mapping     — { name: number, code?: number, category?: number, box_size?: number }
 *                 numbers are 0-based column indices
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function clean(v: string | undefined): string | null {
  if (!v || v.trim() === '') return null
  return v.trim()
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
      mapping: { name: number; code?: number; category?: number; box_size?: number }
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

    // ── Build insert payload ───────────────────────────────────────────────────
    let inserted = 0
    let skipped  = 0

    if (type === 'customers') {
      const payload = rows
        .map((row) => ({ name: clean(row[mapping.name]) }))
        .filter((r): r is { name: string } => r.name !== null && r.name.length > 0)

      if (payload.length === 0) {
        return NextResponse.json({ error: 'No valid customer names found in data' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('customers')
        .upsert(payload.map(r => ({ ...r, active: true, created_by: userId })), {
          onConflict:        'name',
          ignoreDuplicates:  true,
        })
        .select('id')

      if (error) {
        console.error('[import/manual] Customer upsert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      inserted = data?.length ?? 0
      skipped  = payload.length - inserted

    } else {
      const payload = rows
        .map((row) => ({
          name:       clean(row[mapping.name]),
          code:       mapping.code     !== undefined ? clean(row[mapping.code])     : null,
          category:   mapping.category !== undefined ? clean(row[mapping.category]) : null,
          box_size:   mapping.box_size  !== undefined ? clean(row[mapping.box_size])  : null,
        }))
        .filter((r): r is typeof r & { name: string } => r.name !== null && r.name.length > 0)

      if (payload.length === 0) {
        return NextResponse.json({ error: 'No valid product names found in data' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('products')
        .upsert(payload.map(r => ({ ...r, active: true, created_by: userId })), {
          onConflict:       'name',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) {
        console.error('[import/manual] Product upsert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      inserted = data?.length ?? 0
      skipped  = payload.length - inserted
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    const label = type === 'customers' ? 'customer' : 'product'
    await supabase.from('audit_log').insert({
      user_id:   userId,
      screen:    'screen5',
      action:    'imported',
      record_id: null,
      summary:   `${inserted} ${label}${inserted === 1 ? '' : 's'} imported via manual column mapper by ${userName}${skipped > 0 ? ` (${skipped} skipped — already exist)` : ''}`,
    })

    return NextResponse.json({ inserted, skipped }, { status: 201 })

  } catch (err) {
    console.error('[import/manual] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
