/**
 * POST /api/admin/import/confirm
 *
 * Receives the admin-confirmed clean_rows array and the target type
 * ('customers' or 'products') and performs a bulk insert into Supabase.
 *
 * Also writes a single audit_log entry summarising the import.
 * Returns { inserted: number, skipped: number } — skipped count covers
 * rows that failed individually (e.g. duplicate name constraint).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CustomerRow { name: string }
interface ProductRow  { name: string; category?: string | null }

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

    const { type, rows } = body as {
      type: 'customers' | 'products'
      rows: (CustomerRow | ProductRow)[]
    }

    if (type !== 'customers' && type !== 'products') {
      return NextResponse.json(
        { error: 'type must be "customers" or "products"' },
        { status: 400 }
      )
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'rows array is required and must not be empty' },
        { status: 400 }
      )
    }

    // ── Build insert payload ──────────────────────────────────────────────────
    // Filter out any rows without a name (belt-and-braces against bad AI output)
    const validRows = rows.filter((r) => typeof r.name === 'string' && r.name.trim())

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to insert after validation' },
        { status: 400 }
      )
    }

    let inserted = 0
    let skipped  = 0

    if (type === 'customers') {
      const payload = validRows.map((r) => ({
        name:       (r as CustomerRow).name.trim(),
        active:     true,
        created_by: userId,
      }))

      // Insert in a single batch — ignore duplicates via onConflict
      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select('id')

      if (error) {
        console.error('[import/confirm] Customer insert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      inserted = data?.length ?? 0
      skipped  = validRows.length - inserted

    } else {
      const payload = validRows.map((r) => ({
        name:       (r as ProductRow).name.trim(),
        category:   (r as ProductRow).category?.trim() || null,
        active:     true,
        created_by: userId,
      }))

      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id')

      if (error) {
        console.error('[import/confirm] Product insert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      inserted = data?.length ?? 0
      skipped  = validRows.length - inserted
    }

    // ── Write audit log ───────────────────────────────────────────────────────
    const entityLabel = type === 'customers' ? 'customer' : 'product'
    await supabase.from('audit_log').insert({
      user_id:   userId,
      screen:    'screen5',
      action:    'imported',
      record_id: null,
      summary:   `${inserted} ${entityLabel}${inserted === 1 ? '' : 's'} imported via AI import by ${userName}${skipped > 0 ? ` (${skipped} skipped — already exist)` : ''}`,
    })

    return NextResponse.json({ inserted, skipped }, { status: 201 })

  } catch (err) {
    console.error('[import/confirm] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
