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
import { haccpSuppliersServiceForCaller } from '@/lib/wiring/haccp'

function isAdmin(req: NextRequest) {
  return req.headers.get('x-mfs-user-role') === 'admin'
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const svc = await haccpSuppliersServiceForCaller(userId)
    const result = await svc.listSuppliers()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST — create ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const svc = await haccpSuppliersServiceForCaller(userId)

    const body = await req.json()

    const result = await svc.createSupplier(body)
    if ('ok' in result && result.ok === false) {
      return NextResponse.json({ error: result.message }, { status: result.status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH — update ───────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const svc = await haccpSuppliersServiceForCaller(userId)

    const body = await req.json()

    const result = await svc.updateSupplier(body)
    if ('ok' in result && result.ok === false) {
      return NextResponse.json({ error: result.message }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[PATCH /api/haccp/admin/suppliers]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
