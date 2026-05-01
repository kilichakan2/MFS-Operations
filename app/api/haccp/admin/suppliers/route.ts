/**
 * app/api/haccp/admin/suppliers/route.ts
 * Supplier management — admin only.
 *
 * GET    — list all suppliers (active + inactive), ordered by position
 * POST   — create new supplier (name required)
 * PATCH  — update supplier fields
 * DELETE — deactivate supplier (soft delete unless never used)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

function isAdmin(req: NextRequest) {
  return req.cookies.get('mfs_role')?.value === 'admin'
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { data, error } = await supabase
      .from('haccp_suppliers')
      .select('id, name, active, position, address, contact_name, contact_phone, contact_email, fsa_approval_no, fsa_activities, cert_type, cert_expiry, products_supplied, date_approved, notes, created_at')
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ suppliers: data ?? [] })
  } catch (err) {
    console.error('[GET /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — create ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const name = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    // Assign next position
    const { count } = await supabase
      .from('haccp_suppliers').select('*', { count: 'exact', head: true })
    const nextPosition = (count ?? 0) + 1

    const { data, error } = await supabase
      .from('haccp_suppliers')
      .insert({
        name,
        active:           body.active ?? true,
        position:         nextPosition,
        address:          body.address          ?? null,
        contact_name:     body.contact_name     ?? null,
        contact_phone:    body.contact_phone    ?? null,
        contact_email:    body.contact_email    ?? null,
        fsa_approval_no:  body.fsa_approval_no  ?? null,
        fsa_activities:   body.fsa_activities   ?? null,
        cert_type:        body.cert_type        ?? null,
        cert_expiry:      body.cert_expiry      ?? null,
        products_supplied:body.products_supplied ?? null,
        date_approved:    body.date_approved    ?? null,
        notes:            body.notes            ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ supplier: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update ───────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const { id, ...fields } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Whitelist updatable fields
    const allowed = [
      'name', 'active', 'position', 'address', 'contact_name', 'contact_phone',
      'contact_email', 'fsa_approval_no', 'fsa_activities', 'cert_type', 'cert_expiry',
      'products_supplied', 'date_approved', 'notes',
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in fields) update[key] = fields[key]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('haccp_suppliers')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ supplier: data })
  } catch (err) {
    console.error('[PATCH /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
