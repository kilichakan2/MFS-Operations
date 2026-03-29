/**
 * app/api/admin/users/[id]/route.ts
 * PATCH  — toggle active / reset credential
 * DELETE — permanently remove a user
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
      email?:      string | null
    }

    const updates: Record<string, unknown> = {}

    if (body.active !== undefined) {
      updates.active = body.active
    }

    // Email update — null clears it, empty string treated as null
    if (body.email !== undefined) {
      updates.email = body.email?.trim() || null
    }

    if (body.credential && body.role) {
      const hash  = await bcrypt.hash(body.credential, 12)
      const field = body.role === 'admin' ? 'password_hash' : 'pin_hash'
      // Clear the other field so no stale credential remains
      if (field === 'pin_hash') updates.password_hash = null
      else updates.pin_hash = null
      updates[field] = hash
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, role, active, last_login_at, created_at, email')
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[DELETE /api/admin/users/:id]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
