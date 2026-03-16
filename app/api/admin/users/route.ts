/**
 * app/api/admin/users/route.ts
 * GET  — list all users (id, name, role, active, last_login_at, created_at)
 * POST — create a new user
 *
 * Server-side only. Uses service role key — never call directly from the browser.
 * Middleware enforces admin-role session before any request reaches here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import bcrypt                        from 'bcryptjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, active, last_login_at, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/admin/users]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  try {
    const { name, role, credential } = await req.json() as {
      name:       string
      role:       'warehouse' | 'office' | 'sales' | 'admin'
      credential: string   // plain PIN or password
    }

    if (!name?.trim() || !role || !credential?.trim()) {
      return NextResponse.json({ error: 'name, role, and credential required' }, { status: 400 })
    }

    // Server-side PIN validation — enforced even if client-side is bypassed
    if (role !== 'admin' && !/^\d{4}$/.test(credential)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 numeric digits (e.g. 1234)' },
        { status: 400 }
      )
    }

    if (role === 'admin' && credential.trim().length < 6) {
      return NextResponse.json(
        { error: 'Admin password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const hash  = await bcrypt.hash(credential, 12)
    const field = role === 'admin' ? 'password_hash' : 'pin_hash'

    const { data, error } = await supabase
      .from('users')
      .insert({ name: name.trim(), role, [field]: hash, active: true })
      .select('id, name, role, active, last_login_at, created_at')
      .single()

    if (error) {
      console.error('[POST /api/admin/users]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
