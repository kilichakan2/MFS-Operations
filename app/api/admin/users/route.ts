/**
 * app/api/admin/users/route.ts
 * GET  — list all users
 * POST — create a new user (bcrypt-hashes PIN or password)
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS.
 * Credentials are cast to String() before bcrypt to prevent type errors.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt                        from 'bcryptjs'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function GET() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, active, last_login_at, created_at, email')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/users]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    const name       = String(body?.name       ?? '').trim()
    const role       = String(body?.role       ?? '').trim()
    const credential = String(body?.credential ?? '').trim()
    const email      = body?.email ? String(body.email).trim() || null : null

    if (!name || !role || !credential) {
      return NextResponse.json(
        { error: 'name, role, and credential are required' },
        { status: 400 }
      )
    }

    // Server-side PIN validation — belt and braces even if frontend validates
    if (role !== 'admin' && !/^\d{4}$/.test(credential)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 numeric digits (e.g. 1234)' },
        { status: 400 }
      )
    }

    if (role === 'admin' && credential.length < 6) {
      return NextResponse.json(
        { error: 'Admin password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Explicitly cast to String() before bcrypt — prevents "Illegal arguments" TypeError
    let hash: string
    try {
      hash = await bcrypt.hash(String(credential), 12)
    } catch (bcryptErr) {
      console.error('[POST /api/admin/users] bcrypt.hash failed:', bcryptErr)
      return NextResponse.json({ error: 'Failed to hash credential' }, { status: 500 })
    }

    const field = role === 'admin' ? 'password_hash' : 'pin_hash'

    const { data, error } = await supabase
      .from('users')
      .insert({ name, role, [field]: hash, active: true, ...(email ? { email } : {}) })
      .select('id, name, role, active, last_login_at, created_at, email')
      .single()

    if (error) {
      console.error('[POST /api/admin/users]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/users] Unhandled:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
