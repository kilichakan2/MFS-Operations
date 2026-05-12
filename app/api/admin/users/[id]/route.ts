/**
 * app/api/admin/users/[id]/route.ts
 * PATCH  — toggle active / reset credential
 * DELETE — permanently remove a user
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt                        from 'bcryptjs'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id }  = await params
    const body    = await req.json() as {
      active?:          boolean
      credential?:      string
      role?:            string
      email?:           string | null
      secondary_roles?: string[]
    }

    const updates: Record<string, unknown> = {}

    if (body.active !== undefined) {
      updates.active = body.active
    }

    if (body.email !== undefined) {
      updates.email = body.email?.trim() || null
    }

    if (body.secondary_roles !== undefined) {
      updates.secondary_roles = body.secondary_roles
        .filter((r: string) => r !== 'admin')
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
      .select('id, name, role, secondary_roles, active, last_login_at, created_at, email')
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


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
