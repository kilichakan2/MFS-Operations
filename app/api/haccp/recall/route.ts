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
import { haccpSuppliersService }     from '@/lib/wiring/haccp'

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const result = await haccpSuppliersService.getRecallContactList()
    return NextResponse.json(result)
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

    const nowIso = new Date().toISOString()
    const result = await haccpSuppliersService.saveRecallConfig(
      { id, internal_team, regulatory, other_contacts },
      userId,
      nowIso,
    )
    return NextResponse.json(result)
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

    const result = await haccpSuppliersService.updateRecallSupplierContact({
      id, contact_name, contact_phone, contact_email,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[PATCH /api/haccp/recall]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
