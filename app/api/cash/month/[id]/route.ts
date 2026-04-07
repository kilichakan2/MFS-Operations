export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    const role   = req.headers.get('x-mfs-user-role')
    if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id }  = await params
    const body    = await req.json().catch(() => null)

    if (typeof body?.is_locked !== 'boolean') {
      return NextResponse.json({ error: 'is_locked (boolean) required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cash_months')
      .update({ is_locked: body.is_locked })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ month: data })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
