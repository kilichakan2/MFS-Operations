/**
 * app/api/admin/users/[id]/route.ts
 * PATCH — update a user (toggle active, reset PIN/password)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import bcrypt                        from 'bcryptjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }  = await params
    const body    = await req.json() as {
      active?:     boolean
      credential?: string
      role?:       string
    }

    const updates: Record<string, unknown> = {}

    if (body.active !== undefined) {
      updates.active = body.active
    }

    if (body.credential && body.role) {
      const hash  = await bcrypt.hash(body.credential, 12)
      const field = body.role === 'admin' ? 'password_hash' : 'pin_hash'
      updates[field] = hash
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, role, active, last_login_at, created_at')
      .single()

    if (error) {
      console.error('[PATCH /api/admin/users/:id]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
