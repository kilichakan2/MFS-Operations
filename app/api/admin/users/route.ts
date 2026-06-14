/**
 * app/api/admin/users/route.ts
 * GET  — list all users
 * POST — create a new user (bcrypt-hashes PIN or password)
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS.
 * Credentials are cast to String() before bcrypt to prevent type errors.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/adapters/supabase/client'
import { passwordHasher }            from '@/lib/wiring/password'

const supabase = supabaseService

export async function GET(req: NextRequest) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, secondary_roles, active, last_login_at, created_at, email')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/users]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  try {
    const callerRole = req.headers.get('x-mfs-user-role')
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)

    const name            = String(body?.name       ?? '').trim()
    const role            = String(body?.role       ?? '').trim()
    const credential      = String(body?.credential ?? '').trim()
    const email           = body?.email ? String(body.email).trim() || null : null
    const secondaryRoles  = (Array.isArray(body?.secondary_roles) ? body.secondary_roles : [])
      .filter((r: unknown) => typeof r === 'string' && r !== 'admin') as string[]

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

    // Hash via the PasswordHasher port (cost 12, String() casting owned by the
    // adapter). A genuine hashing failure propagates to the outer try/catch,
    // which already returns a 500.
    const hash = await passwordHasher.hash(credential)

    const field = role === 'admin' ? 'password_hash' : 'pin_hash'

    const { data, error } = await supabase
      .from('users')
      .insert({ name, role, secondary_roles: secondaryRoles, [field]: hash, active: true, ...(email ? { email } : {}) })
      .select('id, name, role, secondary_roles, active, last_login_at, created_at, email')
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
