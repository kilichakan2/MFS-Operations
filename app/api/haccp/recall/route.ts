/**
 * app/api/haccp/recall/route.ts
 *
 * SALSA 3.4 — Recall & Withdrawal Contact List
 *
 * GET  — config (internal team, regulatory, other contacts) + all active suppliers with contact info
 * POST — save config (admin only)
 * PATCH — update a single supplier's contact details (admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const [configRes, suppliersRes] = await Promise.all([
      supabase
        .from('haccp_recall_config')
        .select('id, internal_team, regulatory, other_contacts, updated_at, updater:updated_by(name)')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('haccp_suppliers')
        .select('id, name, categories, contact_name, contact_phone, contact_email, active')
        .eq('active', true)
        .order('name'),
    ])

    if (configRes.error && configRes.error.code !== 'PGRST116') {
      return NextResponse.json({ error: configRes.error.message }, { status: 500 })
    }
    if (suppliersRes.error) {
      return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      config:    configRes.data ?? null,
      suppliers: suppliersRes.data ?? [],
    })
  } catch (err) {
    console.error('[GET /api/haccp/recall]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — save config ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const role   = req.cookies.get('mfs_role')?.value
    const userId = req.cookies.get('mfs_user_id')?.value
    if (role !== 'admin' || !userId) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { id, internal_team, regulatory, other_contacts } = body as {
      id?:             string
      internal_team:   unknown[]
      regulatory:      unknown[]
      other_contacts:  unknown[]
    }

    if (!Array.isArray(internal_team) || !Array.isArray(regulatory) || !Array.isArray(other_contacts)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const payload = {
      internal_team,
      regulatory,
      other_contacts,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }

    let result
    if (id) {
      result = await supabase
        .from('haccp_recall_config')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('haccp_recall_config')
        .insert(payload)
        .select()
        .single()
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ config: result.data })
  } catch (err) {
    console.error('[POST /api/haccp/recall]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update supplier contact details ──────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { id, contact_name, contact_phone, contact_email } = body as {
      id:             string
      contact_name:   string
      contact_phone:  string
      contact_email:  string
    }

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('haccp_suppliers')
      .update({
        contact_name:  contact_name?.trim()  || null,
        contact_phone: contact_phone?.trim() || null,
        contact_email: contact_email?.trim() || null,
      })
      .eq('id', id)
      .select('id, name, contact_name, contact_phone, contact_email')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ supplier: data })
  } catch (err) {
    console.error('[PATCH /api/haccp/recall]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
